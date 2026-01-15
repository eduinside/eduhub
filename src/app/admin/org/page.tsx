"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, auth, storage } from "@/lib/firebase";
import {
    collection, query, where, onSnapshot, getDoc, doc, updateDoc, arrayRemove,
    getDocs, addDoc, deleteDoc, serverTimestamp, orderBy
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/utils/dateUtils";

interface Member {
    uid: string;
    name: string;
    email: string;
    role: string;
    joinedAt: any;
    profiles?: any;
    provider?: string;
}

interface Resource {
    id: string;
    name: string;
    location: string;
    approvalRequired: boolean;
    orgId: string;
    managers?: string[];
    imageUrl?: string;
    order?: number;
}

interface TimeSlot {
    name: string;
    start: string;
    end: string;
}

interface LinkItem {
    id: string;
    title: string;
    url: string;
    order?: number;
    isVisible?: boolean;
}

// 리소스 예시 그래픽 프리셋 (심플한 그래픽/이모지 기반)
const RESOURCE_PRESETS = [
    { name: '회의실', emoji: '🤝', color: '#4F46E5' },
    { name: '교실', emoji: '📖', color: '#10B981' },
    { name: '도서실', emoji: '📚', color: '#F59E0B' },
    { name: '컴퓨터실', emoji: '💻', color: '#3B82F6' },
    { name: '음악실', emoji: '🎵', color: '#EC4899' },
    { name: '체육관', emoji: '🏀', color: '#EF4444' },
    { name: '운동장', emoji: '🏃', color: '#8B5CF6' }
];

export default function OrgAdminPage() {
    const { isAdmin, orgId, loading, user } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'reservations' | 'groups' | 'bookmarks'>('dashboard');
    const [allGroups, setAllGroups] = useState<any[]>([]);
    const [orgName, setOrgName] = useState("");

    // Member States
    const [userCode, setUserCode] = useState("");
    const [adminCode, setAdminCode] = useState("");
    const [members, setMembers] = useState<Member[]>([]);

    // Reservation/Resource States
    const [resources, setResources] = useState<Resource[]>([]);
    const [timeTable, setTimeTable] = useState<TimeSlot[]>([]);
    const [isResModalOpen, setIsResModalOpen] = useState(false);
    const [editingResource, setEditingResource] = useState<Resource | null>(null);
    const [resName, setResName] = useState("");
    const [resLocation, setResLocation] = useState("");
    const [resApproval, setResApproval] = useState(false);
    const [resManagers, setResManagers] = useState<string[]>([]);
    const [resImageFile, setResImageFile] = useState<File | null>(null);
    const [resPreviewUrl, setResPreviewUrl] = useState("");
    const [isResSaving, setIsResSaving] = useState(false);

    // Bookmark States
    const [orgLinks, setOrgLinks] = useState<LinkItem[]>([]);
    const [globalLinks, setGlobalLinks] = useState<LinkItem[]>([]);
    const [newLinkTitle, setNewLinkTitle] = useState("");
    const [newLinkUrl, setNewLinkUrl] = useState("https://");

    // Dashboard Stats
    const [stats, setStats] = useState({
        totalMembers: 0,
        adminCount: 0,
        resourceCount: 0,
        todayReservations: 0,
        bookmarkCount: 0,
        totalGroups: 0,
        privateGroups: 0,
        uploadLimit: '',
        totalFiles: 0,
        totalBytes: 0,
        pendingFeedback: 0
    });

    useEffect(() => {
        if (!isAdmin || !orgId) return;

        // 1. 조직 기본 정보
        const unsubOrg = onSnapshot(doc(db, "organizations", orgId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setOrgName(data.name);
                setUserCode(data.userInviteCode || "");
                setAdminCode(data.adminInviteCode || "");
                setTimeTable(data.timeTable || []);
                setStats(prev => ({
                    ...prev,
                    uploadLimit: data.uploadLimit || "3",
                    totalFiles: data.storageUsage?.totalFiles || 0,
                    totalBytes: data.storageUsage?.totalBytes || 0
                }));
            }
        });

        // 2. 멤버 목록
        const qMembers = query(collection(db, "users"), where("orgIds", "array-contains", orgId));
        const unsubMembers = onSnapshot(qMembers, (snapshot) => {
            const list = snapshot.docs.map(doc => {
                const data = doc.data();
                const p = data.profiles?.[orgId] || {};
                return {
                    uid: doc.id,
                    ...data,
                    name: p.name || data.name || "정보 없음",
                    role: p.role || "user",
                    joinedAt: p.joinedAt || data.joinedAt || data.createdAt
                };
            }) as Member[];

            list.sort((a, b) => {
                if (a.role === 'admin' && b.role !== 'admin') return -1;
                if (a.role !== 'admin' && b.role === 'admin') return 1;
                const dateA = a.joinedAt?.seconds ? a.joinedAt.seconds : new Date(a.joinedAt || 0).getTime();
                const dateB = b.joinedAt?.seconds ? b.joinedAt.seconds : new Date(b.joinedAt || 0).getTime();
                return dateB - dateA;
            });
            setMembers(list);

            setStats(prev => ({
                ...prev,
                totalMembers: list.length,
                adminCount: list.filter(m => m.role === 'admin').length
            }));
        });

        // 3. 자원 목록
        const qResources = query(collection(db, "resources"), where("orgId", "==", orgId));
        const unsubResources = onSnapshot(qResources, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Resource[];
            // 안정적인 정렬: order가 없으면 아주 높은 값을 부여하여 뒤로 보냄
            list.sort((a, b) => (a.order ?? 1000000) - (b.order ?? 1000000));
            setResources(list);
            setStats(prev => ({ ...prev, resourceCount: list.length }));
        });

        // 4. 즐겨찾기 목록 (조직 + 시스템 전체)
        const qOrgLinks = query(collection(db, "bookmarks"), where("type", "==", "org"), where("orgId", "==", orgId));
        const unsubOrgLinks = onSnapshot(qOrgLinks, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            list.sort((a: any, b: any) => (a.order ?? 1000000) - (b.order ?? 1000000));
            setOrgLinks(list);
            setStats(prev => ({ ...prev, bookmarkCount: list.length }));
        });

        const qGlobalLinks = query(collection(db, "bookmarks"), where("type", "==", "global"));
        const unsubGlobalLinks = onSnapshot(qGlobalLinks, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            list.sort((a, b) => (a.order ?? 1000000) - (b.order ?? 1000000));
            setGlobalLinks(list);
        });

        // 5. 그룹 목록
        const qGroups = query(collection(db, "groups"), where("orgId", "==", orgId));
        const unsubGroups = onSnapshot(qGroups, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            setAllGroups(list);
            setStats(prev => ({
                ...prev,
                totalGroups: list.length,
                privateGroups: list.filter(g => !g.isPublic).length
            }));
        });

        // 6. 미답변 문의 개수
        const qFeedback = query(
            collection(db, "feedback"),
            where("orgId", "==", orgId),
            where("status", "==", "pending")
        );
        const unsubFeedback = onSnapshot(qFeedback, (snapshot) => {
            setStats(prev => ({ ...prev, pendingFeedback: snapshot.size }));
        });


        return () => {
            unsubOrg();
            unsubMembers();
            unsubResources();
            unsubOrgLinks();
            unsubGlobalLinks();
            unsubGroups();
            unsubFeedback();
        };
    }, [isAdmin, orgId]);

    const [isCleaning, setIsCleaning] = useState(false);

    // 데이터 무결성 체크 (비정상 예약 데이터 정리) 
    const cleanupOrphanedData = async (manual = false) => {
        if (!orgId || resources.length === 0) return;
        if (manual) setIsCleaning(true);
        try {
            const qAllRes = query(collection(db, "reservations"), where("orgId", "==", orgId));
            const snap = await getDocs(qAllRes);
            const resIds = new Set(resources.map(r => r.id));
            const orphans = snap.docs.filter(d => !resIds.has(d.data().resourceId));

            if (orphans.length > 0) {
                await Promise.all(orphans.map(d => deleteDoc(d.ref)));
                if (manual) showToast(`${orphans.length}개의 불필요한 예약 데이터가 정리되었습니다.`, "success");

                // 오늘 예약 수 재계산
                const today = new Date().toISOString().split('T')[0];
                const qToday = query(collection(db, "reservations"), where("orgId", "==", orgId), where("date", "==", today));
                const todaySnap = await getDocs(qToday);
                setStats(prev => ({ ...prev, todayReservations: todaySnap.docs.filter(d => resIds.has(d.data().resourceId)).length }));
            } else if (manual) {
                showToast("정리할 데이터가 없습니다. 시스템이 최적화된 상태입니다.", "info");
            }
        } catch (e) {
            console.error("Data cleanup failed:", e);
            if (manual) showToast("데이터 정리 중 오류가 발생했습니다.", "error");
        } finally {
            if (manual) setIsCleaning(false);
        }
    };

    // 자원 목록 갱신 시 자동 체크 및 통계 업데이트
    useEffect(() => {
        if (orgId) {
            // Auto run cleanup when entering admin center or when resources/org changes
            cleanupOrphanedData(false);

            // 오늘 예약 수량 최신화
            const today = new Date().toISOString().split('T')[0];
            const q = query(collection(db, "reservations"), where("orgId", "==", orgId), where("date", "==", today));
            getDocs(q).then(snap => {
                const resIds = new Set(resources.map(r => r.id));
                const validCount = snap.docs.filter(d => resIds.has(d.data().resourceId)).length;
                setStats(prev => ({ ...prev, todayReservations: validCount }));
            });
        }
    }, [orgId, resources.length]);

    const handleDeleteGroup = async (groupId: string, groupName: string) => {
        if (!confirm(`'${groupName}' 그룹을 삭제하시겠습니까? 모든 데이터가 영구 삭제됩니다.`)) return;
        try {
            await deleteDoc(doc(db, "groups", groupId));
            showToast("그룹이 삭제되었습니다.", "success");
        } catch (e) {
            showToast("삭제 실패", "error");
        }
    };

    // Member Actions
    const handleRoleChange = async (uid: string, currentRole: string) => {
        if (!orgId) return;
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        if (!confirm(`해당 회원의 이 조직 내 권한을 ${newRole === 'admin' ? '관리자' : '구성원'}로 변경하시겠습니까?`)) return;
        try {
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const userData = userSnap.data();
                if (userData.role === 'superadmin' && newRole === 'user') {
                    showToast("최고관리자의 권한은 강등할 수 없습니다.", "error");
                    return;
                }
                const updatedProfiles = { ...(userData.profiles || {}) };
                if (!updatedProfiles[orgId]) updatedProfiles[orgId] = {};
                updatedProfiles[orgId].role = newRole;
                await updateDoc(userRef, { profiles: updatedProfiles });
                showToast("권한이 변경되었습니다.", "success");
            }
        } catch (err) { showToast("권한 변경 실패", "error"); }
    };

    const handleRemoveMember = async (uid: string) => {
        if (!orgId) return;
        if (!confirm("정말로 이 회원을 이 조직에서 제외하시겠습니까?")) return;
        try {
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const updatedProfiles = { ...(userSnap.data().profiles || {}) };
                delete updatedProfiles[orgId];
                await updateDoc(userRef, {
                    orgIds: arrayRemove(orgId),
                    profiles: updatedProfiles
                });
                showToast("조직에서 제외되었습니다.", "info");
            }
        } catch (err) { showToast("제외 실패", "error"); }
    };

    const copyInviteLink = (code: string) => {
        if (!code) return;
        const link = `${window.location.origin}/invite/${code}`;
        navigator.clipboard.writeText(link);
        showToast("초대 링크가 복사되었습니다.", "success");
    };

    // Resource Actions
    const openResModal = (res: Resource | null = null) => {
        setEditingResource(res);
        setResName(res?.name || "");
        setResLocation(res?.location || "");
        setResApproval(res?.approvalRequired || false);
        setResManagers(res?.managers || []);
        setResPreviewUrl(res?.imageUrl || "");
        setResImageFile(null);
        setIsResModalOpen(true);
    };

    const handleSaveResource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId) return;
        if (resApproval && resManagers.length === 0) {
            showToast("확인 후 예약 방식은 담당자를 지정해야 합니다.", "error");
            return;
        }
        setIsResSaving(true);
        try {
            let imageUrl = resPreviewUrl;
            if (resImageFile) {
                const sRef = ref(storage, `resources/${orgId}/${Date.now()}_${resImageFile.name}`);
                await uploadBytes(sRef, resImageFile);
                imageUrl = await getDownloadURL(sRef);
            }
            const data = {
                name: resName,
                location: resLocation,
                approvalRequired: resApproval,
                managers: resManagers,
                imageUrl,
                orgId
            };
            if (editingResource) {
                await updateDoc(doc(db, "resources", editingResource.id), data);
                showToast("수정 완료", "success");
            } else {
                const maxOrder = resources.length > 0 ? Math.max(...resources.map(r => r.order ?? 0)) : 0;
                await addDoc(collection(db, "resources"), { ...data, order: maxOrder + 100 });
                showToast("등록 완료", "success");
            }
            setIsResModalOpen(false);
        } catch (err) { showToast("저장 실패", "error"); }
        finally { setIsResSaving(false); }
    };

    const handleDeleteResource = async (id: string) => {
        if (!confirm("해당 자원을 삭제하시겠습니까? 연관된 모든 예약 내역도 함께 삭제됩니다.")) return;
        try {
            // 1. 자원 삭제
            await deleteDoc(doc(db, "resources", id));

            // 2. 연관된 예약 내역 동시 삭제
            const q = query(collection(db, "reservations"), where("resourceId", "==", id));
            const snap = await getDocs(q);
            if (snap.size > 0) {
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            }

            showToast("자원 및 관련 예약 내역이 삭제되었습니다.", "info");
        } catch (err) { showToast("삭제 실패", "error"); }
    };

    const moveResource = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === resources.length - 1) return;

        const newResources = [...resources];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // 현재 리스트의 모든 아이템에 대해 order가 없는 경우 인덱스 기반으로 강제 할당 (정렬 꼬임 방지)
        const currentItem = newResources[index];
        const targetItem = newResources[targetIndex];

        // 모든 리소스를 순회하며 order가 없는 경우 index * 100으로 업데이트하는 대신,
        // 두 타겟의 순서만 명확히 교체합니다.
        // 기준점: 현재 리스트의 순서를 유지하면서 두 개만 바꿈
        const currentOrder = currentItem.order ?? (index * 100);
        const targetOrder = targetItem.order ?? (targetIndex * 100);

        try {
            await Promise.all([
                updateDoc(doc(db, "resources", currentItem.id), { order: targetOrder }),
                updateDoc(doc(db, "resources", targetItem.id), { order: currentOrder })
            ]);
        } catch (e) { showToast("순서 변경 실패", "error"); }
    };

    const saveTimeTable = async () => {
        if (!orgId) return;
        try {
            const sorted = [...timeTable].sort((a, b) => a.start.localeCompare(b.start));
            await updateDoc(doc(db, "organizations", orgId), { timeTable: sorted });
            showToast("시간표 저장 완료", "success");
        } catch (err) { showToast("저장 실패", "error"); }
    };

    // Bookmark Actions
    const handleAddLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !newLinkTitle.trim() || !newLinkUrl.trim()) return;
        let url = newLinkUrl.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        const maxOrder = orgLinks.length > 0 ? Math.max(...orgLinks.map((l: any) => l.order || 0)) : 0;
        try {
            await addDoc(collection(db, "bookmarks"), {
                type: 'org',
                orgId,
                title: newLinkTitle,
                url,
                order: maxOrder + 100,
                isVisible: true, // Default ON
                createdAt: serverTimestamp()
            });
            showToast("링크 추가됨", "success");
            setNewLinkTitle(""); setNewLinkUrl("https://");
        } catch (e) { showToast("추가 실패", "error"); }
    };

    const toggleBookmarkVisibility = async (bookmarkId: string, currentStatus: boolean) => {
        try {
            await updateDoc(doc(db, "bookmarks", bookmarkId), { isVisible: !currentStatus });
        } catch (e) { showToast("상태 변경 실패", "error"); }
    };

    const moveBookmark = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === orgLinks.length - 1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const currentItem = orgLinks[index];
        const targetItem = orgLinks[targetIndex];
        const currentOrder = currentItem.order ?? (index * 100);
        const targetOrder = targetItem.order ?? (targetIndex * 100);
        try {
            await Promise.all([
                updateDoc(doc(db, "bookmarks", currentItem.id), { order: targetOrder }),
                updateDoc(doc(db, "bookmarks", targetItem.id), { order: currentOrder })
            ]);
        } catch (e) { showToast("순서 변경 실패", "error"); }
    };

    if (loading) return null;
    if (!isAdmin) return <div style={{ padding: '4rem', textAlign: 'center' }}>접근 권한이 없습니다.</div>;

    const renderHeader = (title: string, desc: string) => (
        <div style={{ marginBottom: '2.5rem' }}>
            <h2 className="text-gradient" style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem' }}>{title}</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '1rem' }}>{desc}</p>
        </div>
    );

    // 정렬된 멤버 목록 (승인자 지정용)
    const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ marginBottom: '3rem' }}>
                <h1 className="text-gradient" style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.8rem' }}>🏢 {orgName} 관리자 센터</h1>
                <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>조직의 구성원과 주요 자산 및 설정을 관리합니다.</p>
            </header>

            {/* Tab Navigation */}
            <div className="glass-panel" style={{ display: 'flex', padding: '0.5rem', gap: '0.5rem', marginBottom: '3rem', maxWidth: '600px' }}>
                {[
                    { id: 'dashboard', label: '📊 대시보드' },
                    { id: 'members', label: '👤 회원관리' },
                    { id: 'reservations', label: '🗓️ 예약설정' },
                    { id: 'groups', label: '👥 그룹관리' },
                    { id: 'bookmarks', label: '⭐ 즐겨찾기' }
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

            {/* Tab Contents */}
            {activeTab === 'dashboard' && (
                <div className="animate-fade">
                    {renderHeader("📊 조직 운영 현황", "현재 조직의 주요 지표를 한눈에 확인합니다.")}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', borderLeft: '4px solid #10B981' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>스토리지 현황</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#10B981' }}>
                                {stats.uploadLimit === 'blocked' ? '🚫 이용불가' : `${stats.uploadLimit || '3'}MB 제한`}
                            </div>
                            <div style={{ fontSize: '0.8rem', marginTop: '0.8rem', opacity: 0.8, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <span>📁 {(stats.totalFiles || 0).toLocaleString()}개 파일</span>
                                <span>💾 {((stats.totalBytes || 0) / (1024 * 1024)).toFixed(1)} MB 저장됨</span>
                            </div>
                        </div>
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>전체 구성원</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--primary)' }}>{stats.totalMembers}명</div>
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>관리자 {stats.adminCount}명 포함</div>
                        </div>
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>오늘의 예약</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--accent)' }}>{stats.todayReservations}건</div>
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>전체 자원 {stats.resourceCount}개 운영중</div>
                        </div>
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>그룹 관리</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#7950f2' }}>{stats.totalGroups}개</div>
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>비공개 그룹 {stats.privateGroups}개 포함</div>
                        </div>
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>공용 즐겨찾기</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--success)' }}>{stats.bookmarkCount}개</div>
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>조직원 공용 링크</div>
                        </div>
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', borderLeft: stats.pendingFeedback > 0 ? '4px solid #ff4444' : 'none' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>미답변 문의</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: stats.pendingFeedback > 0 ? '#ff4444' : 'var(--text-dim)' }}>{stats.pendingFeedback}건</div>
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.7 }}>
                                {stats.pendingFeedback > 0 ? (
                                    <Link href="/admin/feedback" style={{ color: '#ff4444', textDecoration: 'underline' }}>답변하러 가기 →</Link>
                                ) : '모든 문의 처리 완료'}
                            </div>
                        </div>
                    </div>


                </div>
            )}

            {activeTab === 'members' && (
                <div className="animate-fade">
                    {renderHeader("👥 회원 관리 및 초대", "구성원을 관리하고 새로운 멤버를 초대합니다.")}

                    {/* 초대 코드 섹션 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', marginBottom: '0.3rem' }}>일반 멤버 초대</h4>
                                <code style={{ fontSize: '1.2rem', fontWeight: '700' }}>{userCode}</code>
                            </div>
                            <button onClick={() => copyInviteLink(userCode)} className="glass-card" style={{ padding: '0.6rem 1rem', fontSize: '0.8rem' }}>🔗 링크 복사</button>
                        </div>
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ fontSize: '0.9rem', color: 'var(--accent)', marginBottom: '0.3rem' }}>조직 관리자 초대</h4>
                                <code style={{ fontSize: '1.2rem', fontWeight: '700' }}>{adminCode}</code>
                            </div>
                            <button onClick={() => copyInviteLink(adminCode)} className="glass-card" style={{ padding: '0.6rem 1rem', fontSize: '0.8rem' }}>🔗 링크 복사</button>
                        </div>
                    </div>

                    {/* 멤버 목록 테이블 */}
                    <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-glass)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                    <th style={{ padding: '1.2rem' }}>이름 / 이메일</th>
                                    <th style={{ padding: '1.2rem' }}>권한</th>
                                    <th style={{ padding: '1.2rem' }}>가입 일시</th>
                                    <th style={{ padding: '1.2rem', textAlign: 'right' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map(m => (
                                    <tr key={m.uid} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                        <td style={{ padding: '1.2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                                <span style={{
                                                    padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.65rem',
                                                    background: m.provider === 'password' ? 'rgba(255,255,255,0.1)' : 'rgba(66, 133, 244, 0.15)',
                                                    color: m.provider === 'password' ? 'var(--text-dim)' : '#4c8bf5',
                                                    border: '1px solid currentColor'
                                                }}>{m.provider === 'password' ? '이메일' : 'Google'}</span>
                                                <div>
                                                    <div style={{ fontWeight: '600' }}>{m.name}</div>
                                                    <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{m.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem' }}>
                                            <span style={{
                                                padding: '0.3rem 0.7rem', borderRadius: '20px', fontSize: '0.75rem',
                                                background: m.role === 'admin' ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                                                color: m.role === 'admin' ? 'white' : 'inherit'
                                            }}>{m.role === 'admin' ? '관리자' : '일반'}</span>
                                        </td>
                                        <td style={{ padding: '1.2rem', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                                            {m.joinedAt ? (m.joinedAt.seconds ? new Date(m.joinedAt.seconds * 1000).toLocaleString() : new Date(m.joinedAt).toLocaleString()) : '-'}
                                        </td>
                                        <td style={{ padding: '1.2rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                <button onClick={() => handleRoleChange(m.uid, m.role)} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>권한변경</button>
                                                {m.provider === 'password' && (
                                                    <button onClick={async () => {
                                                        if (!confirm(`${m.email}로 초기화 메일을 발송할까요?`)) return;
                                                        await sendPasswordResetEmail(auth, m.email);
                                                        showToast("발송 완료", "success");
                                                    }} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', color: 'var(--primary)' }}>비번초기화</button>
                                                )}
                                                <button onClick={() => handleRemoveMember(m.uid)} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', color: '#ff4444' }}>제외</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'reservations' && (
                <div className="animate-fade">
                    {renderHeader("🗓️ 예약 및 일과 설정", "조직의 공용 자원(회의실, 장비 등)과 일과표를 관리합니다.")}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
                        {/* 자원 목록 */}
                        <div className="glass-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ fontSize: '1.2rem' }}>📁 자원 목록 ({resources.length})</h3>
                                <button onClick={() => openResModal()} className="btn-primary" style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}>+ 신규 등록</button>
                            </div>
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {resources.map((res, idx) => (
                                    <div key={res.id} className="glass-card" style={{ padding: '1.2rem', display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', opacity: 0.6 }}>
                                                <button onClick={() => moveResource(idx, 'up')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px' }}>▲</button>
                                                <button onClick={() => moveResource(idx, 'down')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px' }}>▼</button>
                                            </div>
                                            <div style={{ width: '70px', height: '70px', borderRadius: '12px', background: 'var(--bg-card)', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                                                {res.imageUrl ? <img src={res.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📦</div>}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '700', fontSize: '1.05rem', marginBottom: '0.2rem' }}>{res.name}</div>
                                                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>📍 {res.location} | {res.approvalRequired ? "🔒 승인제" : "⚡ 즉시예약"}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => openResModal(res)} className="glass-card" style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}>수정</button>
                                                <button onClick={() => handleDeleteResource(res.id)} className="glass-card" style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', color: '#ff4444' }}>삭제</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 일과표 설정 */}
                        <div className="glass-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ fontSize: '1.1rem' }}>🕓 일과표 설정</h3>
                                <button onClick={saveTimeTable} className="glass-card" style={{ padding: '0.4rem 1.2rem', fontSize: '0.85rem', fontWeight: 'bold' }}>저장</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {timeTable.map((slot, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                                        <input
                                            value={slot.name}
                                            onChange={e => {
                                                const nt = [...timeTable]; nt[idx].name = e.target.value; setTimeTable(nt);
                                            }}
                                            placeholder="일과명 (예: 1교시)"
                                            className="glass-card" style={{ flex: 2, padding: '0.6rem', fontSize: '0.9rem' }}
                                        />
                                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flex: 3 }}>
                                            <input
                                                type="time" value={slot.start}
                                                onChange={e => {
                                                    const nt = [...timeTable]; nt[idx].start = e.target.value; setTimeTable(nt);
                                                }}
                                                className="glass-card" style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem', textAlign: 'center' }}
                                            />
                                            <span style={{ opacity: 0.4 }}>~</span>
                                            <input
                                                type="time" value={slot.end}
                                                onChange={e => {
                                                    const nt = [...timeTable]; nt[idx].end = e.target.value; setTimeTable(nt);
                                                }}
                                                className="glass-card" style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem', textAlign: 'center' }}
                                            />
                                        </div>
                                        <button onClick={() => setTimeTable(timeTable.filter((_, i) => i !== idx))} style={{ border: 'none', background: 'none', color: '#ff4444', fontSize: '1.5rem', cursor: 'pointer', opacity: 0.6 }}>×</button>
                                    </div>
                                ))}
                                <button onClick={() => setTimeTable([...timeTable, { name: "", start: "", end: "" }])} className="glass-card" style={{ padding: '0.8rem', borderStyle: 'dashed', opacity: 0.7, fontWeight: '600' }}>+ 일과 추가</button>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem', textAlign: 'center' }}>* 시간순으로 자동 정렬되어 저장됩니다.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'groups' && (
                <div className="animate-fade">
                    {renderHeader("📂 그룹 관리", "조직 내에서 운영 중인 모든 소모임 및 프로젝트 그룹을 관리합니다.")}

                    <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-glass)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                    <th style={{ padding: '1.2rem' }}>생성일</th>
                                    <th style={{ padding: '1.2rem' }}>제목 (내용)</th>
                                    <th style={{ padding: '1.2rem' }}>그룹장</th>
                                    <th style={{ padding: '1.2rem' }}>참여자 수</th>
                                    <th style={{ padding: '1.2rem', textAlign: 'right' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allGroups.length > 0 ? allGroups.map(group => {
                                    const owner = members.find(m => m.uid === group.ownerId);
                                    return (
                                        <tr key={group.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                            <td style={{ padding: '1.2rem', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                                                {group.createdAt?.toDate ? formatDate(group.createdAt.toDate()) : '-'}
                                            </td>
                                            <td style={{ padding: '1.2rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ fontWeight: '600' }}>{group.name}</div>
                                                    <span style={{
                                                        padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.65rem',
                                                        background: group.isPublic ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                        color: group.isPublic ? '#10b981' : '#ef4444',
                                                        border: `1px solid ${group.isPublic ? '#10b981' : '#ef4444'}`
                                                    }}>
                                                        {group.isPublic ? '공개' : '비공개'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{group.description || '설명 없음'}</div>
                                            </td>
                                            <td style={{ padding: '1.2rem' }}>
                                                {owner ? owner.name : '알 수 없음'}
                                            </td>
                                            <td style={{ padding: '1.2rem' }}>
                                                {group.memberIds?.length || 0} 명
                                            </td>
                                            <td style={{ padding: '1.2rem', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleDeleteGroup(group.id, group.name)}
                                                    className="glass-card"
                                                    style={{
                                                        padding: '0.4rem 0.8rem',
                                                        fontSize: '0.75rem',
                                                        color: '#ff4444',
                                                        borderRadius: '20px',
                                                        border: '1px solid rgba(255, 68, 68, 0.2)'
                                                    }}
                                                >
                                                    삭제
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                                            운영 중인 그룹이 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'bookmarks' && (
                <div className="animate-fade">
                    {renderHeader("🔖 즐겨찾기 관리", "구성원들을 위한 공용 즐겨찾기 및 시스템 링크를 관리합니다.")}
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 7fr', gap: '2rem', alignItems: 'start' }}>
                        {/* 시스템 공통 링크 (Read-only) */}
                        <div className="glass-panel" style={{ padding: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '1.2rem', color: 'var(--accent)' }}>🌐 최고관리자 지정 링크</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {globalLinks.length > 0 ? globalLinks.map(link => (
                                    <div key={link.id} className="glass-card" style={{ padding: '0.8rem', opacity: 0.8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{link.title}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.url}</div>
                                        </div>
                                        <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--text-dim)', marginLeft: '0.8rem', display: 'flex', alignItems: 'center' }} title="새 창에서 열기">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                        </a>
                                    </div>
                                )) : <div style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center', padding: '1rem' }}>등록된 전체 링크가 없습니다.</div>}
                            </div>
                        </div>

                        {/* 조직 즐겨찾기 */}
                        <div className="glass-panel" style={{ padding: '2rem' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>📋 조직 공용 즐겨찾기</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                {orgLinks.map((link, idx) => (
                                    <div key={link.id} className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', opacity: 0.6 }}>
                                                <button onClick={() => moveBookmark(idx, 'up')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px' }}>▲</button>
                                                <button onClick={() => moveBookmark(idx, 'down')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px' }}>▼</button>
                                            </div>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                                    <div style={{ fontWeight: '600', fontSize: '1rem' }}>{link.title}</div>
                                                    <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }} title="새 창에서 열기">
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                    </a>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', opacity: 0.6, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{link.url}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={link.isVisible !== false}
                                                    onChange={e => toggleBookmarkVisibility(link.id, link.isVisible !== false)}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <span>상단 메뉴 보이기</span>
                                            </label>
                                            <button onClick={async () => {
                                                if (confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "bookmarks", link.id));
                                            }} className="glass-card" style={{ color: '#ff4444', padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}>삭제</button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 하단 한 줄 추가 폼 */}
                            <form onSubmit={handleAddLink} className="glass-card" style={{ padding: '0.8rem', display: 'flex', gap: '0.8rem', alignItems: 'center', background: 'rgba(255,255,255,0.05)' }}>
                                <input
                                    value={newLinkTitle}
                                    onChange={e => setNewLinkTitle(e.target.value)}
                                    placeholder="제목"
                                    className="glass-card"
                                    style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', border: 'none' }}
                                    required
                                />
                                <input
                                    value={newLinkUrl}
                                    onChange={e => setNewLinkUrl(e.target.value)}
                                    placeholder="URL (https://...)"
                                    className="glass-card"
                                    style={{ flex: 2, padding: '0.6rem', fontSize: '0.9rem', border: 'none' }}
                                    required
                                />
                                <button type="submit" className="btn-primary" style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>+ 추가</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Resource Modal */}
            {isResModalOpen && (
                <div className="modal-overlay" onClick={() => setIsResModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '95%', maxWidth: '650px', padding: '2.5rem', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '800' }}>{editingResource ? '자원 정보 수정' : '신규 자원 등록'}</h3>
                        <form onSubmit={handleSaveResource} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: '120px', height: '120px', margin: '0 auto 1.5rem', borderRadius: '16px', background: 'var(--bg-card)', overflow: 'hidden', border: '2px solid var(--border-glass)', boxShadow: 'var(--shadow-premium)' }}>
                                    {resPreviewUrl ? <img src={resPreviewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3, fontSize: '2rem' }}>📷</div>}
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.6rem' }}>기본 예시 이미지 선택</div>
                                    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                        {RESOURCE_PRESETS.map((p: any, i) => {
                                            const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${encodeURIComponent(p.color)}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="50">${p.emoji}</text></svg>`;
                                            const dataUrl = `data:image/svg+xml;utf8,${svgString}`;
                                            return (
                                                <div
                                                    key={i}
                                                    onClick={() => { setResPreviewUrl(dataUrl); setResImageFile(null); }}
                                                    style={{
                                                        width: '50px', height: '50px', borderRadius: '10px', cursor: 'pointer',
                                                        overflow: 'hidden', border: resPreviewUrl === dataUrl ? '3px solid var(--primary)' : '1px solid var(--border-glass)',
                                                        background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
                                                        transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                                                    }}
                                                >
                                                    {p.emoji}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <input type="file" accept="image/*" onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) { setResImageFile(file); setResPreviewUrl(URL.createObjectURL(file)); }
                                    }} style={{ fontSize: '0.8rem' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.4rem' }}>자원 이름</label>
                                    <input value={resName} onChange={e => setResName(e.target.value)} placeholder="예: 대회의실" className="glass-card" style={{ width: '100%', padding: '0.8rem' }} required />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.4rem' }}>위치</label>
                                    <input value={resLocation} onChange={e => setResLocation(e.target.value)} placeholder="예: 본관 2층" className="glass-card" style={{ width: '100%', padding: '0.8rem' }} required />
                                </div>
                            </div>

                            <div className="glass-panel" style={{ padding: '1.2rem', background: 'rgba(255,255,255,0.03)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer', marginBottom: resApproval ? '1.2rem' : '0' }}>
                                    <div style={{ position: 'relative', width: '22px', height: '22px' }}>
                                        <input
                                            type="checkbox"
                                            checked={resApproval}
                                            onChange={e => setResApproval(e.target.checked)}
                                            style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', zIndex: 1 }}
                                        />
                                        <div style={{
                                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                            borderRadius: '6px', border: '2px solid var(--primary)',
                                            background: resApproval ? 'var(--primary)' : 'transparent',
                                            transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {resApproval && <span style={{ color: 'white', fontSize: '0.9rem' }}>✓</span>}
                                        </div>
                                    </div>
                                    <strong style={{ fontSize: '1rem', color: resApproval ? 'var(--primary)' : 'inherit' }}>관리자 승인 후 예약 확정</strong>
                                </label>

                                {resApproval && (
                                    <>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.8rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem' }}>자원 담당 승인자 지정</div>
                                        <div style={{
                                            maxHeight: '180px', overflowY: 'auto', display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.6rem',
                                            padding: '0.5rem', borderRadius: '8px', background: 'rgba(0,0,0,0.1)'
                                        }}>
                                            {sortedMembers.map(m => (
                                                <label key={m.uid} style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                    padding: '0.5rem', borderRadius: '6px', cursor: 'pointer',
                                                    background: resManagers.includes(m.uid) ? 'rgba(255,255,255,0.1)' : 'transparent',
                                                    transition: 'all 0.1s'
                                                }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={resManagers.includes(m.uid)}
                                                        onChange={e => {
                                                            if (e.target.checked) setResManagers([...resManagers, m.uid]);
                                                            else setResManagers(resManagers.filter(id => id !== m.uid));
                                                        }}
                                                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                                                    />
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{m.name}</span>
                                                        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{m.email}</span>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsResModalOpen(false)} className="glass-card" style={{ flex: 1, padding: '1rem', fontWeight: '700' }}>취소</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '1rem', fontWeight: '700' }} disabled={isResSaving}>{isResSaving ? '저장중...' : '저장하기'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style jsx>{`
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); borderRadius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </main>
    );
}
