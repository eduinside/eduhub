"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, arrayUnion, arrayRemove, updateDoc } from "firebase/firestore";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { deleteUser, sendPasswordResetEmail } from "firebase/auth";
import NotificationSettings from "@/components/NotificationSettings";

export default function ProfilePage() {
    const { user, orgId, orgIds, activeProfile, profiles, loading, setActiveOrgId } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();

    const [name, setName] = useState("");
    const [dept, setDept] = useState("");
    const [contact, setContact] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const [newInviteCode, setNewInviteCode] = useState("");
    const [joining, setJoining] = useState(false);

    // Join Confirmation states
    const [pendingOrg, setPendingOrg] = useState<{ id: string, name: string, role: string } | null>(null);
    const [newName, setNewName] = useState("");
    const [newDept, setNewDept] = useState("");
    const [newContact, setNewContact] = useState("");

    const [myOrgDetails, setMyOrgDetails] = useState<{ id: string, name: string }[]>([]);

    useEffect(() => {
        if (activeProfile) {
            setName(activeProfile.name || "");
            setDept(activeProfile.department || "");
            setContact(activeProfile.contact || "");
        }
    }, [activeProfile]);

    useEffect(() => {
        if (orgIds.length > 0) {
            const fetchOrgNames = async () => {
                const details = await Promise.all(orgIds.map(async (id) => {
                    const snap = await getDoc(doc(db, "organizations", id));
                    return snap.exists() ? { id, name: snap.data().name } : null;
                }));
                setMyOrgDetails(details.filter(d => d !== null) as { id: string, name: string }[]);
            };
            fetchOrgNames();
        } else {
            setMyOrgDetails([]);
        }
    }, [orgIds]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !orgId) return;
        setIsSaving(true);
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            const currentProfiles = userSnap.data()?.profiles || {};

            const updatedProfiles = {
                ...currentProfiles,
                [orgId]: {
                    ...currentProfiles[orgId],
                    name,
                    department: dept,
                    contact: contact
                }
            };

            await setDoc(userRef, { profiles: updatedProfiles }, { merge: true });
            showToast("현재 소속 정보가 수정되었습니다.", "success");
        } catch (error) {
            showToast("수정 실패", "error");
        } finally { setIsSaving(false); }
    };

    const handleValidateCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newInviteCode || !user) return;
        setJoining(true);
        try {
            let q = query(collection(db, "organizations"), where("adminInviteCode", "==", newInviteCode.trim()));
            let snapshot = await getDocs(q);
            let role = "admin";
            let targetOrgId = "";
            let orgName = "";

            if (!snapshot.empty) {
                targetOrgId = snapshot.docs[0].id;
                orgName = snapshot.docs[0].data().name;
            } else {
                q = query(collection(db, "organizations"), where("userInviteCode", "==", newInviteCode.trim()));
                snapshot = await getDocs(q);
                if (snapshot.empty) {
                    showToast("유효하지 않은 코드입니다.", "error");
                    setJoining(false); return;
                }
                role = "user";
                targetOrgId = snapshot.docs[0].id;
                orgName = snapshot.docs[0].data().name;
            }

            if (orgIds.includes(targetOrgId)) {
                showToast("이미 합류한 곳입니다.", "info");
                setJoining(false); return;
            }

            // Valid code, show info entry step
            setPendingOrg({ id: targetOrgId, name: orgName, role: role });
            setNewName(activeProfile?.name || user.displayName || "");
            setNewDept("");
            setNewContact("");
        } catch (error) {
            showToast("코드 확인 실패", "error");
        } finally { setJoining(false); }
    };

    const handleFinalJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pendingOrg || !user) return;
        setJoining(true);
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            const currentProfiles = userSnap.data()?.profiles || {};

            const updatedProfiles = {
                ...currentProfiles,
                [pendingOrg.id]: {
                    name: newName,
                    department: newDept,
                    contact: newContact,
                    role: pendingOrg.role,
                    joinedAt: new Date().toISOString()
                }
            };

            await updateDoc(userRef, {
                orgIds: arrayUnion(pendingOrg.id),
                profiles: updatedProfiles
            });

            showToast(`${pendingOrg.name}에 성공적으로 합류했습니다!`, "success");
            setPendingOrg(null);
            setNewInviteCode("");
        } catch (error) {
            showToast("합류 실패", "error");
        } finally { setJoining(false); }
    };

    const handleWithdrawal = async () => {
        if (!user) return;
        const confirmStr = "EduHub에서 탈퇴하시겠습니까? 모든 개인 정보와 활동 기록이 삭제되며 복구할 수 없습니다. '탈퇴'라고 입력해 주세요.";
        const userInput = prompt(confirmStr);
        if (userInput !== "탈퇴") return;

        try {
            // Firestore data cleanup
            await updateDoc(doc(db, "users", user.uid), {
                status: 'withdrawn',
                withdrawnAt: new Date().toISOString()
            });
            // Actually delete user from Auth
            await deleteUser(user);
            showToast("그동안 이용해 주셔서 감사합니다. 메인화면으로 이동합니다.", "info");
            router.push("/");
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/requires-recent-login') {
                showToast("보안을 위해 다시 로그인한 후 탈퇴를 진행해 주세요.", "error");
            } else {
                showToast("탈퇴 처리 중 오류가 발생했습니다.", "error");
            }
        }
    };

    const handleLeaveOrg = async (targetId: string, targetName: string) => {
        if (!user || orgIds.length <= 1) return;
        if (!confirm(`${targetName} 조직에서 정말로 제외하시겠습니까? 소속 정보와 참여 기록이 더 이상 조회되지 않습니다.`)) return;

        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            const currentProfiles = { ...(userSnap.data()?.profiles || {}) };
            delete currentProfiles[targetId];

            await updateDoc(userRef, {
                orgIds: arrayRemove(targetId),
                profiles: currentProfiles
            });

            showToast(`${targetName}에서 제외되었습니다.`, "info");

            // 만약 현재 선택된 조직을 떠났다면 다른 조직으로 자동 전환
            if (orgId === targetId) {
                const remaining = orgIds.filter(id => id !== targetId);
                if (remaining.length > 0) setActiveOrgId(remaining[0]);
            }
        } catch (error) {
            showToast("제외 실패", "error");
        }
    };

    const handlePasswordReset = async () => {
        if (!user || !user.email) return;
        try {
            await sendPasswordResetEmail(auth, user.email);
            showToast("비밀번호 재설정 이메일이 발송되었습니다. 이메일을 확인해 주세요.", "success");
        } catch (error) {
            showToast("이메일 발송에 실패했습니다.", "error");
        }
    };

    if (loading) return null;

    // 현재 조직 이름 찾기
    const currentOrgName = myOrgDetails.find(o => o.id === orgId)?.name || "현재 조직";

    return (
        <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '2.5rem' }}>👤 내 정보 관리</h1>

            <div style={{ display: 'grid', gap: '2rem' }}>

                {/* 1. 현재 소속 정보 수정 */}
                <section className="glass-panel" style={{ padding: '2.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        🏢 현재 소속 정보 수정
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
                        현재 선택된 조직(<strong>{currentOrgName}</strong>)에서 사용하는 내 정보를 관리합니다.
                    </p>
                    <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>성함</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} className="glass-card" style={{ padding: '0.8rem 1.2rem', border: 'none' }} required />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>부서명</label>
                            <input type="text" value={dept} onChange={e => setDept(e.target.value)} className="glass-card" style={{ padding: '0.8rem 1.2rem', border: 'none' }} required />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>연락처</label>
                            <input type="text" value={contact} onChange={e => setContact(e.target.value)} className="glass-card" style={{ padding: '0.8rem 1.2rem', border: 'none' }} required />
                        </div>
                        <button type="submit" className="btn-primary" style={{ padding: '1rem', marginTop: '0.5rem' }} disabled={isSaving}>
                            {isSaving ? "저장 중..." : "소속 정보 업데이트"}
                        </button>
                    </form>

                    {/* 조직 제외 버튼 */}
                    {orgIds.length > 1 && (
                        <div style={{ borderTop: '1px solid var(--border-glass)', marginTop: '2rem', paddingTop: '1.5rem' }}>
                            <button
                                onClick={() => orgId && handleLeaveOrg(orgId, currentOrgName)}
                                className="glass-card btn-delete-fancy"
                                style={{ width: '100%', padding: '1rem', color: '#ff4444', border: '1px solid rgba(255, 68, 68, 0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <span>📤</span> {currentOrgName} 조직에서 나가기
                            </button>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.8rem', textAlign: 'center' }}>
                                이 조직에서의 활동 기록이 더 이상 프로필에 표시되지 않습니다.
                            </p>
                        </div>
                    )}
                </section>

                {/* 2. 다른 조직 합류하기 */}
                <section className="glass-panel" style={{ padding: '2.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>🚀 다른 조직 합류하기</h2>
                    {!pendingOrg ? (
                        <>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
                                다른 곳에 합류하려면 초대 코드를 입력해 주세요.
                            </p>
                            <form onSubmit={handleValidateCode} style={{ display: 'flex', gap: '1rem' }}>
                                <input
                                    type="text" value={newInviteCode} onChange={e => setNewInviteCode(e.target.value)}
                                    className="glass-card" style={{ padding: '0.8rem 1.2rem', border: 'none', flex: 1 }}
                                    placeholder="초대 코드 입력" required
                                />
                                <button type="submit" className="btn-primary" style={{ padding: '0.8rem 2rem' }} disabled={joining}>
                                    코드 확인
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="animate-fade" style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--primary-light)' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>📋 {pendingOrg.name} 소속 정보 입력</h3>
                            <form onSubmit={handleFinalJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>실명</label>
                                        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="glass-card" style={{ padding: '0.7rem' }} required />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>부서</label>
                                        <input type="text" value={newDept} onChange={e => setNewDept(e.target.value)} className="glass-card" style={{ padding: '0.7rem' }} required />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>연락처</label>
                                    <input type="text" value={newContact} onChange={e => setNewContact(e.target.value)} className="glass-card" style={{ padding: '0.7rem' }} required />
                                </div>
                                <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.5rem' }}>
                                    <button type="submit" className="btn-primary" style={{ flex: 1, padding: '0.8rem' }} disabled={joining}>
                                        합류 완료하기
                                    </button>
                                    <button type="button" onClick={() => setPendingOrg(null)} className="glass-card" style={{ padding: '0.8rem 1.5rem' }}>
                                        취소
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </section>

                {/* 3. 알림 설정 */}
                <NotificationSettings />

                {/* 4. 로그인 계정 및 서비스 탈퇴하기 */}
                <section className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>로그인 계정: {user?.email}</p>
                    <p style={{ color: 'var(--text-main)', fontSize: '0.85rem', marginBottom: '1.2rem', opacity: 0.8 }}>
                        현재 <strong>{user?.providerData[0]?.providerId === 'google.com' ? 'Google 계정' : '이메일/비밀번호'}</strong> 방식으로 로그인되어 있습니다.
                        {user?.providerData[0]?.providerId === 'password' && (
                            <div style={{ marginTop: '0.8rem' }}>
                                <button
                                    onClick={handlePasswordReset}
                                    className="glass-card"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary)', border: '1px solid var(--primary-light)' }}
                                >
                                    비밀번호 수정(재설정) 메일 받기
                                </button>
                                <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-dim)' }}>
                                    (가입하신 이메일로 비밀번호 변경 링크가 전송됩니다.)
                                </p>
                            </div>
                        )}
                    </p>
                    <button
                        onClick={handleWithdrawal}
                        style={{
                            background: 'none', border: 'none', color: '#ff4444',
                            fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline',
                            opacity: 0.7
                        }}
                    >
                        EduHub 서비스 탈퇴하기
                    </button>
                </section>
            </div>
            <style jsx>{`
                .btn-delete-fancy:hover {
                    background: rgba(255, 68, 68, 0.1) !important;
                }
            `}</style>
        </main>
    );
}
