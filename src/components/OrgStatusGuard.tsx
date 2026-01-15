"use client";

import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, setDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/context/ToastContext";

export default function OrgStatusGuard({ children }: { children: React.ReactNode }) {
    const { user, orgIds, orgStatus, isSuperAdmin, activeProfile, activeOrgId } = useAuth();
    const { showToast } = useToast();
    const pathname = usePathname();
    const [inviteCode, setInviteCode] = useState("");
    const [isJoining, setIsJoining] = useState(false);

    // 프로필 보정용 로컬 상태
    const [extraName, setExtraName] = useState("");
    const [extraDept, setExtraDept] = useState("");
    const [extraContact, setExtraContact] = useState("");
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    // 1. 소속된 조직이 아예 없는 경우 (신규 유저)
    if (user && orgIds.length === 0 && !pathname.startsWith('/admin/super') && !isSuperAdmin) {
        const handleJoinByCode = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!inviteCode.trim() || isJoining) return;
            setIsJoining(true);

            try {
                let q = query(collection(db, "organizations"), where("adminInviteCode", "==", inviteCode.trim()));
                let snapshot = await getDocs(q);
                let role = "admin";
                let targetOrgId = "";

                if (snapshot.empty) {
                    q = query(collection(db, "organizations"), where("userInviteCode", "==", inviteCode.trim()));
                    snapshot = await getDocs(q);
                    role = "user";
                }

                if (snapshot.empty) {
                    showToast("유효하지 않은 초대 코드입니다.", "error");
                    setIsJoining(false);
                    return;
                }

                targetOrgId = snapshot.docs[0].id;
                const orgData = snapshot.docs[0].data();
                if (orgData.status === 'suspended') {
                    showToast("운영이 중단된 조직입니다.", "error");
                    setIsJoining(false);
                    return;
                }

                // 가입 처리
                const userRef = doc(db, "users", user.uid);
                await setDoc(userRef, {
                    orgIds: arrayUnion(targetOrgId),
                    profiles: {
                        [targetOrgId]: {
                            name: user.displayName || "익명",
                            department: "", // 빈 값으로 저장하여 프로필 입력 유도
                            contact: "",
                            role: role,
                            joinedAt: serverTimestamp()
                        }
                    },
                    lastUpdated: serverTimestamp()
                }, { merge: true });

                showToast(`${orgData.name} 조직에 성공적으로 합류했습니다!`, "success");
            } catch (err) {
                console.error(err);
                showToast("오류가 발생했습니다.", "error");
            } finally {
                setIsJoining(false);
                setInviteCode("");
            }
        };

        return (
            <div style={{
                height: 'calc(100vh - 120px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '2rem'
            }}>
                <div className="glass-panel animate-fade" style={{ padding: '4rem', maxWidth: '600px', width: '100%' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🏢</div>
                    <h1 className="text-gradient" style={{ fontSize: '2.2rem', marginBottom: '1rem' }}>소속된 조직이 없습니다</h1>
                    <p style={{ fontSize: '1.1rem', color: 'var(--text-dim)', lineHeight: '1.6', marginBottom: '2.5rem' }}>
                        EduHub를 이용하려면 먼저 조직에 소속되어야 합니다.<br />
                        전달받은 초대 코드를 입력해 주세요.
                    </p>
                    <form onSubmit={handleJoinByCode} style={{ display: 'flex', gap: '0.8rem', maxWidth: '400px', margin: '0 auto', marginBottom: '2.5rem' }}>
                        <input
                            type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                            placeholder="초대 코드 입력" className="glass-card"
                            style={{ flex: 1, padding: '1rem', border: '1px solid var(--border-glass)' }} required
                        />
                        <button type="submit" className="btn-primary" style={{ padding: '0 2rem' }} disabled={isJoining}>
                            {isJoining ? "처리 중..." : "합류하기"}
                        </button>
                    </form>

                    <button
                        onClick={async () => {
                            if (!user) return;
                            const confirmStr = "EduHub에서 탈퇴하시겠습니까? 모든 개인 정보와 활동 기록이 삭제되며 복구할 수 없습니다. '탈퇴'라고 입력해 주세요.";
                            const userInput = prompt(confirmStr);
                            if (userInput !== "탈퇴") return;
                            try {
                                const { updateDoc, doc } = await import("firebase/firestore");
                                const { deleteUser } = await import("firebase/auth");
                                await updateDoc(doc(db, "users", user.uid), { status: 'withdrawn', withdrawnAt: new Date().toISOString() });
                                await deleteUser(user);
                                showToast("그동안 이용해 주셔서 감사합니다.", "info");
                                window.location.href = "/";
                            } catch (err: any) {
                                if (err.code === 'auth/requires-recent-login') showToast("다시 로그인한 후 탈퇴를 진행해 주세요.", "error");
                                else showToast("탈퇴 처리 중 오류가 발생했습니다.", "error");
                            }
                        }}
                        style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '0.85rem', cursor: 'pointer', opacity: 0.7, textDecoration: 'underline' }}
                    >
                        회원 탈퇴하기
                    </button>
                </div>
            </div>
        );
    }

    // 2. 관리자에 의해 운영 중단된 조직인 경우
    if (orgStatus === 'suspended' && !pathname.startsWith('/admin/super') && !isSuperAdmin) {
        return (
            <div style={{
                height: 'calc(100vh - 120px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '2rem'
            }}>
                <div className="glass-panel animate-fade" style={{ padding: '4rem', maxWidth: '600px' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🛑</div>
                    <h1 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '1rem' }}>조직 운영 중단</h1>
                    <p style={{ fontSize: '1.1rem', color: 'var(--text-dim)', lineHeight: '1.6' }}>
                        현재 이 조직은 운영이 일시 중단되었습니다.<br />
                        자세한 내용은 조직 관리자에게 문의해 주세요.
                    </p>
                </div>
            </div>
        );
    }

    // 3. 소속은 있으나 필수 정보(부서, 연락처)가 비어있는 경우 (프로필 입력 강제)
    if (user && orgIds.length > 0 && activeProfile && !isSuperAdmin && !pathname.startsWith('/admin/super')) {
        const isProfileIncomplete = !activeProfile.department || !activeProfile.contact || activeProfile.department === "미지정" || activeProfile.contact === "미지정";

        if (isProfileIncomplete && pathname !== '/profile') {
            const handleForceUpdateProfile = async (e: React.FormEvent) => {
                e.preventDefault();
                const finalName = extraName || activeProfile.name || user.displayName || "";
                if (!finalName || !extraDept || !extraContact) {
                    showToast("모든 정보를 입력해 주세요.", "error");
                    return;
                }
                setIsSavingProfile(true);
                try {
                    const { updateDoc, doc, getDoc } = await import("firebase/firestore");
                    const userRef = doc(db, "users", user.uid);
                    const snap = await getDoc(userRef);
                    const currentProfiles = snap.data()?.profiles || {};

                    const updated = {
                        ...currentProfiles,
                        [activeOrgId]: {
                            ...currentProfiles[activeOrgId],
                            name: finalName,
                            department: extraDept,
                            contact: extraContact
                        }
                    };
                    await updateDoc(userRef, { profiles: updated });
                    showToast("소속 정보가 설정되었습니다.", "success");
                    // 상태 초기화
                    setExtraDept(""); setExtraContact("");
                } catch (err) {
                    showToast("저장 실패", "error");
                } finally {
                    setIsSavingProfile(false);
                }
            };

            return (
                <div style={{
                    height: 'calc(100vh - 120px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem'
                }}>
                    <div className="glass-panel animate-fade" style={{ padding: '3rem', maxWidth: '500px', width: '100%' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                        <h2 className="text-gradient" style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>추가 정보 입력 필요</h2>
                        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', fontSize: '0.95rem' }}>
                            EduHub를 원활하게 이용하기 위해<br />현재 소속의 부서와 연락처 정보를 입력해 주세요.
                        </p>
                        <form onSubmit={handleForceUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', textAlign: 'left' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>성함</label>
                                <input
                                    type="text"
                                    defaultValue={activeProfile.name || user.displayName || ""}
                                    onChange={e => setExtraName(e.target.value)}
                                    placeholder="성함을 입력하세요"
                                    className="glass-card" style={{ padding: '0.8rem', border: 'none' }} required
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>부서명</label>
                                <input
                                    type="text"
                                    value={extraDept}
                                    onChange={e => setExtraDept(e.target.value)}
                                    placeholder="부서명을 입력하세요"
                                    className="glass-card" style={{ padding: '0.8rem', border: 'none' }} required
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>연락처</label>
                                <input
                                    type="text"
                                    value={extraContact}
                                    onChange={e => setExtraContact(e.target.value)}
                                    placeholder="연락처를 입력하세요"
                                    className="glass-card" style={{ padding: '0.8rem', border: 'none' }} required
                                />
                            </div>
                            <button type="submit" className="btn-primary" style={{ padding: '1rem', marginTop: '1rem' }} disabled={isSavingProfile}>
                                {isSavingProfile ? "저장 중..." : "설정 완료하고 시작하기"}
                            </button>
                        </form>
                    </div>
                </div>
            );
        }
    }

    return <>{children}</>;
}
