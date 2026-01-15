"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, storage } from "@/lib/firebase";
import {
    collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDocs,
    serverTimestamp, query, where, getDoc, orderBy, arrayUnion, arrayRemove, setDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import remarkGfm from "remark-gfm";
import { sendPasswordResetEmail } from "firebase/auth";
import Link from "next/link";
import { formatDate } from "@/utils/dateUtils";
import { auth } from "@/lib/firebase";

interface Organization {
    id: string;
    name: string;
    userInviteCode: string;
    adminInviteCode: string;
    createdAt: any;
    suspendedAt?: any;
    status?: 'active' | 'suspended';
    statusHistory?: { status: string, timestamp: any }[];
    uploadLimit?: string;
    storageUsage?: { totalFiles: number, totalBytes: number };
    limitHistory?: { limit: string, changedAt: string, changedBy: string }[];
}

interface UserProfile {
    uid: string;
    name: string;
    email: string;
    role: string;
    orgIds?: string[];
    profiles?: Record<string, any>;
    provider?: string;
    superAdminGrantedAt?: any;
}

interface Notice {
    id: string;
    title: string;
    content: string;
    authorName: string;
    authorUid: string;
    createdAt: any;
    startDate: string;
    endDate: string;
    orgId?: string;
    attachments?: { name: string, url: string, size: number }[];
}

export default function SuperAdminPage() {
    const { isSuperAdmin, user } = useAuth();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'stats' | 'orgs' | 'policy' | 'admins'>('stats');

    const [searchEmail, setSearchEmail] = useState("");
    const [foundUsers, setFoundUsers] = useState<UserProfile[]>([]);

    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [orgNotices, setOrgNotices] = useState<Notice[]>([]); // 통계용
    const [policies, setPolicies] = useState<any>({ fileLimit: "3" });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
    const [historyOrg, setHistoryOrg] = useState<Organization | null>(null);
    const [newOrgName, setNewOrgName] = useState("");
    const [editOrgName, setEditOrgName] = useState("");
    const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);
    const [limitModalOrg, setLimitModalOrg] = useState<Organization | null>(null);

    const handleCopyText = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast("코드가 복사되었습니다.", "success");
    };

    const handleCopyInviteLink = (code: string) => {
        const link = `${window.location.origin}/invite/${code}`;
        navigator.clipboard.writeText(link);
        showToast("초대 링크가 복사되었습니다.", "success");
    };

    useEffect(() => {
        if (!isSuperAdmin) return;

        const unsubOrgs = onSnapshot(collection(db, "organizations"), (snapshot) => {
            const orgList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Organization[];
            setOrgs(orgList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        });

        const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as UserProfile[]);
        });

        const unsubNotices = onSnapshot(collection(db, "notices"), (snapshot) => {
            const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Notice[];
            // 조직별 공지만 통계용으로 유지
            const orgSpecific = all.filter(n => n.orgId !== "all");
            setOrgNotices(orgSpecific);
        });

        getDoc(doc(db, "settings", "global_policy")).then(s => { if (s.exists()) setPolicies(s.data()); });

        return () => { unsubOrgs(); unsubUsers(); unsubNotices(); };
    }, [isSuperAdmin]);

    const getOrgStats = (orgId: string) => {
        const orgUsers = users.filter(u => u.orgIds?.includes(orgId));
        const adminCount = orgUsers.filter(u => {
            const p = u.profiles?.[orgId];
            return p?.role === 'admin';
        }).length;
        const userCount = orgUsers.length - adminCount;
        return { adminCount, userCount };
    };

    const createOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const adminCode = "A" + Math.random().toString(36).substring(2, 7).toUpperCase();
            await addDoc(collection(db, "organizations"), {
                name: newOrgName,
                userInviteCode: inviteCode,
                adminInviteCode: adminCode,
                createdAt: serverTimestamp(),
                status: 'active'
            });
            showToast("조직이 생성되었습니다.", "success");
            setNewOrgName(""); setIsCreateModalOpen(false);
        } catch (error) { showToast("생성 실패", "error"); }
    };

    const refreshInviteCode = async (orgId: string, type: 'user' | 'admin') => {
        const newCode = type === 'user'
            ? Math.random().toString(36).substring(2, 8).toUpperCase()
            : "A" + Math.random().toString(36).substring(2, 7).toUpperCase();
        const field = type === 'user' ? 'userInviteCode' : 'adminInviteCode';
        await updateDoc(doc(db, "organizations", orgId), { [field]: newCode });
        showToast("코드 갱신 완료", "success");
    };

    const deleteOrg = async (id: string) => {
        if (!confirm("정말 삭제하시겠습니까? 관련 데이터가 모두 삭제될 수 있습니다.")) return;
        await deleteDoc(doc(db, "organizations", id));
        showToast("삭제 완료", "info");
        setDeletingOrgId(null);
    };

    const updatePolicy = async (field: string, value: any) => {
        const newPolicy = { ...policies, [field]: value };
        setPolicies(newPolicy);
        await setDoc(doc(db, "settings", "global_policy"), newPolicy, { merge: true });
        showToast("정책 업데이트 완료", "success");
    };

    const toggleOrgStatus = async (org: Organization) => {
        const newStatus = org.status === 'suspended' ? 'active' : 'suspended';
        try {
            await updateDoc(doc(db, "organizations", org.id), {
                status: newStatus,
                statusHistory: arrayUnion({ status: newStatus, changedAt: new Date().toISOString(), changedBy: user?.uid || 'system' })
            });
            showToast(`조직이 ${newStatus === 'active' ? '재개' : '중단'}되었습니다.`, "success");
        } catch (error) { showToast("상태 변경 실패", "error"); }
    };

    const migrateLegacyUsers = async () => {
        if (!isSuperAdmin) return;
        if (!confirm("불완전한 프로필 데이터를 찾아 최신 구조로 보정하시겠습니까? (누락된 가입시간 복구 등)")) return;

        try {
            const usersSnap = await getDocs(collection(db, "users"));
            let updatedCount = 0;

            for (const userDoc of usersSnap.docs) {
                const data = userDoc.data();
                let isModified = false;

                const orgIds = data.orgIds || (data.orgId ? [data.orgId] : []);
                const currentProfiles = data.profiles || {};
                const newProfiles = { ...currentProfiles };

                // orgIds에 있는 모든 조직이 profiles에도 있는지 확인 및 보정
                orgIds.forEach((id: string) => {
                    if (!newProfiles[id]) {
                        // 프로필이 아예 없는 조직인 경우 생성
                        newProfiles[id] = {
                            name: data.name || "정보 없음",
                            department: data.department || "미지정",
                            contact: data.contact || "미지정",
                            role: data.role === 'superadmin' ? 'admin' : (data.role || 'user'),
                            joinedAt: data.joinedAt || data.createdAt || new Date().toISOString()
                        };
                        isModified = true;
                    } else {
                        // 프로필은 있으나 joinedAt 등 필수 필드가 누락된 경우 보정
                        if (!newProfiles[id].joinedAt) {
                            newProfiles[id].joinedAt = data.joinedAt || data.createdAt || new Date().toISOString();
                            isModified = true;
                        }
                        // 프로필 내 정보가 비어있고 루트에 정보가 있다면 복사 (부차적 보정)
                        if (!newProfiles[id].name && data.name) { newProfiles[id].name = data.name; isModified = true; }
                        if (!newProfiles[id].department && data.department) { newProfiles[id].department = data.department; isModified = true; }
                        if (!newProfiles[id].contact && data.contact) { newProfiles[id].contact = data.contact; isModified = true; }
                    }
                });

                if (isModified) {
                    await updateDoc(userDoc.ref, {
                        profiles: newProfiles
                    });
                    updatedCount++;
                }
            }
            showToast(`${updatedCount}명의 데이터가 최신 구조로 보정되었습니다.`, "success");
        } catch (error) {
            console.error(error);
            showToast("보정 실패", "error");
        }
    };

    const handleSearchUser = async () => {
        if (!searchEmail.trim()) {
            showToast("검색할 이메일을 입력하세요.", "info");
            return;
        }
        try {
            const q = query(collection(db, "users"), where("email", "==", searchEmail.trim()));
            const snap = await getDocs(q);
            const results = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as UserProfile[];
            setFoundUsers(results);
            if (results.length === 0) showToast("검색 결과가 없습니다.", "info");
        } catch (error) {
            showToast("검색 중 오류 발생", "error");
        }
    };

    const toggleSuperAdmin = async (targetUser: UserProfile) => {
        if (targetUser.uid === user?.uid) {
            showToast("자신의 최고관리자 권한은 해제할 수 없습니다.", "error");
            return;
        }
        const isCurrentlySuper = targetUser.role === 'superadmin';
        const newRole = isCurrentlySuper ? 'user' : 'superadmin';

        if (!confirm(`${targetUser.email} 사용자의 최고관리자 권한을 ${isCurrentlySuper ? '해제' : '부여'}하시겠습니까?`)) return;

        try {
            const updateData: any = { role: newRole };
            if (newRole === 'superadmin') {
                updateData.superAdminGrantedAt = serverTimestamp();
            } else {
                updateData.superAdminGrantedAt = null; // 권한 해제 시 필드 무효화
            }

            await updateDoc(doc(db, "users", targetUser.uid), updateData);
            showToast(`최고관리자 권한이 ${isCurrentlySuper ? '해제' : '부여'}되었습니다.`, "success");
            // 업데이트된 정보를 반영하기 위해 검색 결과 갱신
            const updatedUsers = foundUsers.map(u => u.uid === targetUser.uid ? { ...u, role: newRole, superAdminGrantedAt: newRole === 'superadmin' ? new Date() : null } : u);
            setFoundUsers(updatedUsers);
        } catch (error) {
            showToast("권한 변경 실패", "error");
        }
    };


    if (!isSuperAdmin) return <div style={{ padding: '4rem', textAlign: 'center' }}>권한이 없습니다.</div>;

    const activeOrgs = orgs.filter(o => o.status !== 'suspended').length;
    const totalMemCount = users.filter(u => u.orgIds && u.orgIds.length > 0).length;

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ marginBottom: '3rem' }}>
                <h1 className="text-gradient" style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.8rem' }}>💎 EduHub 시스템 관리</h1>
                <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>EduHub 플랫폼의 모든 조직과 시스템을 통합 관리합니다.</p>
            </header>

            <div className="glass-panel" style={{ display: 'flex', padding: '0.5rem', gap: '0.5rem', marginBottom: '3rem', maxWidth: '650px' }}>
                {[
                    { id: 'stats', label: '📊 대시보드' },
                    { id: 'orgs', label: '🏢 조직 관리' },
                    { id: 'admins', label: '🛡️ 최고관리자' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        style={{
                            flex: 1,
                            padding: '0.8rem',
                            borderRadius: '12px',
                            border: 'none',
                            background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                            color: activeTab === tab.id ? 'white' : 'var(--text-main)',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'stats' && (
                <div className="animate-fade">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                        <div className="glass-card" style={{ padding: '2rem', borderLeft: '4px solid var(--primary)' }}>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>활성 조직 수</p>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{activeOrgs} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>/ {orgs.length}개</span></p>
                        </div>
                        <div className="glass-card" style={{ padding: '2rem', borderLeft: '4px solid #10B981' }}>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>전체 스토리지 사용량</p>
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                {(orgs.reduce((acc, org) => acc + (org.storageUsage?.totalBytes || 0), 0) / (1024 * 1024)).toFixed(1)} MB
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginLeft: '0.5rem' }}>
                                    / {(orgs.reduce((acc, org) => acc + (org.storageUsage?.totalFiles || 0), 0)).toLocaleString()} files
                                </span>
                            </p>
                        </div>
                        <div className="glass-card" style={{ padding: '2rem', borderLeft: '4px solid var(--secondary)' }}>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>전체 회원 수</p>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{totalMemCount}명</p>
                        </div>
                        <div className="glass-card" style={{ padding: '2rem', borderLeft: '4px solid var(--accent)' }}>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>조직 내 공지 수</p>
                            <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{orgNotices.length}건</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'orgs' && (
                <div className="animate-fade">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.8rem' }}>🏢 조직 관리</h2>
                        <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary" style={{ padding: '0.8rem 2rem' }}>+ 신규 조직 생성</button>
                    </div>
                    <div className="glass-card" style={{ overflow: 'hidden', padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                    <th style={{ padding: '1rem 1.5rem' }}>조직명</th>
                                    <th style={{ padding: '1rem 1.5rem' }}>유저 초대코드</th>
                                    <th style={{ padding: '1rem 1.5rem' }}>관리자 초대코드</th>
                                    <th style={{ padding: '1rem 1.5rem' }}>회원현황</th>
                                    <th style={{ padding: '1rem 1.5rem' }}>용량관리</th>
                                    <th style={{ padding: '1rem 1.5rem' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orgs.map(org => {
                                    const { adminCount, userCount } = getOrgStats(org.id);
                                    const isSuspended = org.status === 'suspended';
                                    return (
                                        <tr key={org.id} style={{ borderBottom: '1px solid var(--border-glass)', opacity: isSuspended ? 0.6 : 1 }}>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div onClick={() => { setHistoryOrg(org); setEditOrgName(org.name); }} style={{ cursor: 'pointer', fontWeight: '600' }}>{org.name} {isSuspended && <span style={{ fontSize: '0.7rem', color: 'var(--accent)', marginLeft: '0.5rem' }}>[중단됨]</span>}</div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <code
                                                        onClick={() => handleCopyText(org.userInviteCode)}
                                                        title="코드 복사"
                                                        style={{ fontSize: '1.1rem', color: 'var(--primary)', cursor: 'pointer', transition: 'opacity 0.2s' }}
                                                        onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                                    >
                                                        {org.userInviteCode}
                                                    </code>
                                                    <button onClick={() => handleCopyInviteLink(org.userInviteCode)} title="초대 링크 복사" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>📋</button>
                                                    <button onClick={() => refreshInviteCode(org.id, 'user')} title="새로고침" style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>🔄</button>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <code
                                                        onClick={() => handleCopyText(org.adminInviteCode)}
                                                        title="코드 복사"
                                                        style={{ fontSize: '1.1rem', color: 'var(--accent)', cursor: 'pointer', transition: 'opacity 0.2s' }}
                                                        onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                                    >
                                                        {org.adminInviteCode}
                                                    </code>
                                                    <button onClick={() => handleCopyInviteLink(org.adminInviteCode)} title="초대 링크 복사" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>📋</button>
                                                    <button onClick={() => refreshInviteCode(org.id, 'admin')} title="새로고침" style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>🔄</button>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div style={{ fontSize: '0.85rem' }}>총 <strong>{adminCount + userCount}명</strong> (관리자 {adminCount}) <button onClick={() => setSelectedOrgId(org.id)} style={{ marginLeft: '0.8rem', color: 'var(--primary)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}>멤버관리</button></div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setLimitModalOrg(org); }}
                                                    className="glass-card"
                                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: org.uploadLimit === 'blocked' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--border-glass)', color: 'var(--text-main)' }}
                                                >
                                                    {org.uploadLimit === 'blocked' ? '🚫 차단됨' : `${org.uploadLimit || '3'}MB 제한`}
                                                </button>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => toggleOrgStatus(org)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer' }}>{isSuspended ? "운영재개" : "운영중단"}</button>
                                                    <button
                                                        onClick={() => deleteOrg(org.id)}
                                                        className="btn-delete-fancy"
                                                        style={{
                                                            padding: '0.4rem 1rem',
                                                            borderRadius: '20px',
                                                            fontSize: '0.8rem'
                                                        }}
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}


            {activeTab === 'policy' && (
                <div className="animate-fade" style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '2.5rem' }}>
                        <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️ 정책 설정</h2>
                        <p style={{ color: 'var(--text-dim)' }}>모든 조직과 계정에 적용되는 통합 정책입니다.</p>
                    </div>



                </div>
            )}

            {activeTab === 'admins' && (
                <div className="animate-fade" style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '2.5rem' }}>
                        <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛡️ 최고관리자 권한 관리</h2>
                        <p style={{ color: 'var(--text-dim)' }}>시스템 전체를 제어할 수 있는 최고관리자 계정을 검색하고 관리합니다.</p>
                    </div>

                    <div className="glass-panel" style={{ padding: '2.5rem', marginBottom: '3.5rem' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>👥 현재 최고관리자 목록</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {users.filter(u => u.role === 'superadmin').map(u => (
                                <div key={u.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                                    <div>
                                        <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{u.name || "이름 없음"} {u.uid === user?.uid && <span style={{ fontSize: '0.7rem', color: 'var(--primary)', marginLeft: '0.4rem' }}>(나)</span>}</p>
                                        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>{u.email}</p>
                                            {u.superAdminGrantedAt && (
                                                <p style={{ fontSize: '0.75rem', color: 'var(--accent)', opacity: 0.8 }}>
                                                    📅 부여일: {u.superAdminGrantedAt.seconds
                                                        ? formatDate(new Date(u.superAdminGrantedAt.seconds * 1000))
                                                        : formatDate(new Date(u.superAdminGrantedAt))}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {u.uid !== user?.uid && (
                                        <button
                                            onClick={() => toggleSuperAdmin(u)}
                                            className="glass-card"
                                            style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', color: '#ff4444', border: '1px solid rgba(255, 68, 68, 0.3)' }}
                                        >
                                            권한 해제
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '2.5rem', marginBottom: '2rem', border: '1px solid var(--primary-light)' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>➕ 신규 최고관리자 추가</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
                            권한을 부여할 사용자의 이메일을 정확히 입력하여 검색해 주세요.
                        </p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <input
                                type="email"
                                value={searchEmail}
                                onChange={(e) => setSearchEmail(e.target.value)}
                                placeholder="검색할 사용자의 이메일 입력"
                                className="glass-card"
                                style={{ flex: 1, padding: '1rem', border: 'none' }}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
                            />
                            <button onClick={handleSearchUser} className="btn-primary" style={{ padding: '0 2rem' }}>검색</button>
                        </div>
                    </div>

                    {foundUsers.length > 0 && (
                        <div className="glass-card" style={{ padding: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', paddingLeft: '0.5rem' }}>🔍 검색 결과</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {foundUsers.map(u => (
                                    <div key={u.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                                        <div>
                                            <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{u.name || "이름 없음"}</p>
                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>{u.email}</p>
                                            <div style={{ marginTop: '0.6rem' }}>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '4px',
                                                    background: u.role === 'superadmin' ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                                                    color: 'white',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {u.role === 'superadmin' ? '현재 최고관리자' : '일반 사용자'}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => toggleSuperAdmin(u)}
                                            className={u.role === 'superadmin' ? 'glass-card' : 'btn-primary'}
                                            style={{
                                                padding: '0.7rem 1.4rem',
                                                fontSize: '0.9rem',
                                                color: u.role === 'superadmin' ? '#ff4444' : 'white',
                                                border: u.role === 'superadmin' ? '1px solid #ff4444' : 'none'
                                            }}
                                        >
                                            {u.role === 'superadmin' ? '권한 해제' : '최고관리자 임명'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isCreateModalOpen && (
                <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '500px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '2rem' }}>🏢 신규 조직 생성</h2>
                        <form onSubmit={createOrg} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>조직명</label>
                                <input type="text" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} className="glass-card" style={{ width: '100%', padding: '1rem', border: 'none', marginTop: '0.5rem' }} placeholder="조직명을 입력하세요" required />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="glass-card" style={{ flex: 1, padding: '1rem' }}>취소</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '1rem' }}>생성하기</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {historyOrg && (
                <div className="modal-overlay" onClick={() => setHistoryOrg(null)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '500px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '2rem' }}>💎 조직 상세 및 수정</h3>
                        <form onSubmit={async (e) => { e.preventDefault(); await updateDoc(doc(db, "organizations", historyOrg.id), { name: editOrgName }); showToast("변경됨", "success"); setHistoryOrg(null); }} style={{ marginBottom: '2rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>조직명 변경</label>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <input type="text" value={editOrgName} onChange={e => setEditOrgName(e.target.value)} className="glass-card" style={{ flex: 1, padding: '0.8rem', border: 'none' }} required />
                                <button type="submit" className="btn-primary">변경</button>
                            </div>
                        </form>
                        <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: '12px', fontSize: '0.9rem', maxHeight: '250px', overflowY: 'auto' }}>
                            <p style={{ marginBottom: '1rem' }}>✨ <strong>최초 생성:</strong> {historyOrg.createdAt?.toDate?.().toLocaleString() || '기록 없음'}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                <p style={{ fontWeight: 'bold' }}>🕒 상태 변경 이력</p>
                                {historyOrg.statusHistory?.map((h: any, idx: number) => (
                                    <div key={idx} style={{ paddingLeft: '0.8rem', borderLeft: `3px solid ${h.status === 'active' ? 'var(--primary)' : 'var(--accent)'}` }}>
                                        {h.status === 'active' ? '운영 재개' : '운영 중단'} - {h.changedAt || h.timestamp?.toDate?.().toLocaleString()}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button onClick={() => setHistoryOrg(null)} className="glass-card" style={{ width: '100%', padding: '1rem', marginTop: '2rem', border: 'none' }}>닫기</button>
                    </div>
                </div>
            )}

            {limitModalOrg && (
                <div className="modal-overlay" onClick={() => setLimitModalOrg(null)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '500px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.3rem' }}>💾 용량 및 파일 관리 ({limitModalOrg.name})</h3>

                        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                            <p style={{ marginBottom: '0.8rem', color: 'var(--text-dim)' }}>현재 스토리지 사용 현황</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                        {((limitModalOrg.storageUsage?.totalBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                                    </div>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>총 용량</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                                        {(limitModalOrg.storageUsage?.totalFiles || 0).toLocaleString()}개
                                    </div>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>총 파일 수</div>
                                </div>
                            </div>
                            <button
                                onClick={async () => {
                                    // Simple simulation of calculation or fetch real stats if possible. 
                                    // Since actual storage scanning is expensive, we might just update with a timestamp or simulate recalc.
                                    // For now, let's assume valid data exists or just refresh.
                                    showToast("스토리지 사용량을 갱신 중입니다...", "info");
                                    // Here we could trigger a Cloud Function or complex query. 
                                    // Simulating an update for UI feedback:
                                    try {
                                        // In a real app, this would be a heavy backend job.
                                        // We will just verify the current data is displayed.
                                        showToast("최신 데이터입니다.", "success");
                                    } catch (e) { }
                                }}
                                className="glass-card"
                                style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', fontSize: '0.9rem' }}
                            >
                                🔄 사용량 집계 갱신 (시뮬레이션)
                            </button>
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <p style={{ marginBottom: '0.8rem', color: 'var(--text-dim)' }}>업로드 제한 설정</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.8rem' }}>
                                {['3', '5', '10', 'blocked'].map(limit => (
                                    <button
                                        key={limit}
                                        onClick={async () => {
                                            try {
                                                const newHistory = [
                                                    ...(limitModalOrg.limitHistory || []),
                                                    { limit, changedAt: new Date().toISOString(), changedBy: user?.email || 'unknown' }
                                                ];
                                                await updateDoc(doc(db, "organizations", limitModalOrg.id), {
                                                    uploadLimit: limit,
                                                    limitHistory: newHistory
                                                });
                                                setLimitModalOrg(prev => prev ? { ...prev, uploadLimit: limit, limitHistory: newHistory } : null);
                                                showToast("설정이 변경되었습니다.", "success");
                                            } catch (e) { showToast("변경 실패", "error"); }
                                        }}
                                        className={limitModalOrg.uploadLimit === limit || (limit === '3' && !limitModalOrg.uploadLimit) ? 'btn-primary' : 'glass-card'}
                                        style={{ padding: '0.8rem', fontSize: '0.9rem' }}
                                    >
                                        {limit === 'blocked' ? '차단' : `${limit}MB`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {limitModalOrg.limitHistory && limitModalOrg.limitHistory.length > 0 && (
                            <div style={{ marginTop: '1rem', maxHeight: '150px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                                <p style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>📜 변경 이력</p>
                                {limitModalOrg.limitHistory.slice().reverse().map((h, i) => (
                                    <div key={i} style={{ fontSize: '0.75rem', marginBottom: '0.3rem', color: 'var(--text-dim)' }}>
                                        {new Date(h.changedAt).toLocaleString()} - <b>{h.limit === 'blocked' ? '차단' : `${h.limit}MB`}</b>로 변경 ({h.changedBy})
                                    </div>
                                ))}
                            </div>
                        )}

                        <button onClick={() => setLimitModalOrg(null)} className="glass-card" style={{ width: '100%', padding: '1rem', marginTop: '2rem', border: 'none' }}>닫기</button>
                    </div>
                </div>
            )}

            {selectedOrgId && (
                <div className="modal-overlay" onClick={() => setSelectedOrgId(null)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '800px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
                        <h3>구성원 권한 관리</h3>
                        <div style={{ maxHeight: '500px', overflowY: 'auto', marginTop: '1rem' }}>
                            <table style={{ width: '100%' }}><tbody>
                                {users.filter(u => u.orgIds?.includes(selectedOrgId)).map(u => {
                                    const p = u.profiles?.[selectedOrgId];
                                    const orgRole = p?.role || 'user';
                                    return (
                                        <tr key={u.uid} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                            <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                                <span style={{
                                                    padding: '0.3rem 0.6rem',
                                                    borderRadius: '99px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 'bold',
                                                    background: u.provider === 'password' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(66, 133, 244, 0.15)',
                                                    color: u.provider === 'password' ? 'var(--text-dim)' : '#4c8bf5',
                                                    border: `1px solid ${u.provider === 'password' ? 'rgba(255,255,255,0.2)' : 'rgba(76,139,245,0.3)'}`,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {u.provider === 'password' ? '이메일' : 'Google'}
                                                </span>
                                                <div>
                                                    {p?.name || u.name} ({p?.department || '미지정'}) <br />
                                                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{u.email}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem' }}>{orgRole === 'admin' ? '관리자' : '구성원'}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button onClick={async () => {
                                                        const newRole = orgRole === 'admin' ? 'user' : 'admin';
                                                        const updated = { ...(u.profiles || {}) };
                                                        if (!updated[selectedOrgId]) updated[selectedOrgId] = {};
                                                        updated[selectedOrgId].role = newRole;
                                                        await updateDoc(doc(db, "users", u.uid), { profiles: updated });
                                                        showToast("권한 변경됨", "success");
                                                    }} className="glass-card" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>권한변경</button>

                                                    <button onClick={async () => {
                                                        if (!confirm(`정말로 이 사용자를 이 조직에서 제외하시겠습니까?`)) return;
                                                        try {
                                                            const userRef = doc(db, "users", u.uid);
                                                            const updated = { ...(u.profiles || {}) };
                                                            delete updated[selectedOrgId];

                                                            await updateDoc(userRef, {
                                                                orgIds: arrayRemove(selectedOrgId),
                                                                profiles: updated
                                                            });
                                                            showToast("조직에서 제외되었습니다.", "info");
                                                        } catch (err) {
                                                            showToast("제외 실패", "error");
                                                        }
                                                    }} className="glass-card" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: '#ff4444' }}>제외</button>

                                                    {u.provider === 'password' && (
                                                        <button onClick={async () => {
                                                            if (!confirm(`${u.email}로 비밀번호 재설정 메일을 보낼까요?`)) return;
                                                            try {
                                                                await sendPasswordResetEmail(auth, u.email);
                                                                showToast("재설정 메일 발송 완료", "success");
                                                            } catch (err) {
                                                                showToast("발송 실패", "error");
                                                            }
                                                        }} className="glass-card" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', color: 'var(--accent)' }}>비번초기화</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody></table>
                        </div>
                    </div>
                </div>
            )
            }
        </main >
    );
}
