"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, setDoc, arrayUnion, getDoc } from "firebase/firestore";
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";

export default function InvitePage() {
    const { code } = useParams();
    const { showToast } = useToast();
    const router = useRouter();
    const [orgData, setOrgData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [step, setStep] = useState(1);
    const [userName, setUserName] = useState("");
    const [userDept, setUserDept] = useState("");
    const [userContact, setUserContact] = useState("");
    const [joining, setJoining] = useState(false);
    const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(null);

    // Email states
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isEmailSignMode, setIsEmailSignMode] = useState(false);
    const [pending, setPending] = useState(false);
    const [authMethod, setAuthMethod] = useState<'email' | 'google'>('email');

    useEffect(() => {
        async function checkInviteCode() {
            try {
                let q = query(collection(db, "organizations"), where("adminInviteCode", "==", code));
                let snapshot = await getDocs(q);

                let foundOrg: any = null;
                if (!snapshot.empty) {
                    foundOrg = { id: snapshot.docs[0].id, ...snapshot.docs[0].data(), invitedRole: "admin" };
                } else {
                    q = query(collection(db, "organizations"), where("userInviteCode", "==", code));
                    snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        foundOrg = { id: snapshot.docs[0].id, ...snapshot.docs[0].data(), invitedRole: "user" };
                    }
                }

                if (!foundOrg) {
                    setError("유효하지 않은 초대 코드입니다.");
                } else if (foundOrg.status === 'suspended') {
                    setError("해당 조직은 현재 운영이 중단된 상태입니다. 관리자에게 문의하세요.");
                } else {
                    setOrgData(foundOrg);
                }
            } catch (err) {
                console.error(err);
                setError("시스템 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        }

        if (code) checkInviteCode();
    }, [code]);

    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            await processPostAuth(user);
        } catch (err) {
            showToast("로그인에 실패했습니다.", "error");
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setPending(true);
        try {
            let user;
            if (isEmailSignMode) {
                if (!userName.trim()) {
                    showToast("성함을 입력해 주세요.", "error");
                    setPending(false);
                    return;
                }
                const res = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(res.user, { displayName: userName });
                user = res.user;
            } else {
                const res = await signInWithEmailAndPassword(auth, email, password);
                user = res.user;
            }
            await processPostAuth(user);
        } catch (err: any) {
            console.error(err);
            let msg = "오류가 발생했습니다.";
            if (err.code === 'auth/wrong-password') msg = "비밀번호가 틀렸습니다.";
            else if (err.code === 'auth/user-not-found') msg = "존재하지 않는 계정입니다.";
            showToast(msg, "error");
        } finally {
            setPending(false);
        }
    };

    const processPostAuth = async (user: any) => {
        setAuthenticatedEmail(user.email);
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            setUserName(userName || data.name || user.displayName || "");
            setUserDept(data.department || "");
            setUserContact(data.contact || "");

            if (data.orgIds?.includes(orgData.id)) {
                showToast("이미 가입된 조직입니다.", "info");
                router.push("/");
                return;
            }

            if (data.name && data.department && data.contact) {
                await finalizeJoin(user.uid, user.email, data.role || "user", data.profiles || {});
                return;
            }
        } else {
            setUserName(userName || user.displayName || "");
        }
        setStep(2);
    };
    const { setActiveOrgId } = useAuth(); // AuthContext 사용

    const finalizeJoin = async (uid: string, email: string | null, globalRole: string, existingProfiles: any = {}) => {
        setJoining(true);
        try {
            const userRef = doc(db, "users", uid);

            // 조직별 프로필 정보 생성
            const newProfiles = {
                ...existingProfiles,
                [orgData.id]: {
                    name: userName,
                    department: userDept,
                    contact: userContact,
                    role: orgData.invitedRole
                }
            };

            // 글로벌 role 보호: 기존 역할이 있으면 유지 (특히 superadmin), 없으면 기본 'user' 할당
            const finalGlobalRole = globalRole || "user";

            await setDoc(userRef, {
                email: email || authenticatedEmail || auth.currentUser?.email,
                orgIds: arrayUnion(orgData.id),
                profiles: newProfiles,
                // 메인 정보는 기존 정보가 없을 때만 현재 입력값으로 저장
                name: userName, // 이 페이지는 가입 폼이므로 입력된 정보 위주로 업데이트
                department: userDept,
                contact: userContact,
                role: finalGlobalRole,
                joinedAt: new Date().toISOString()
            }, { merge: true });

            setActiveOrgId(orgData.id); // 현재 조직을 가입한 조직으로 변경
            showToast(`${orgData.name} 조직에 합류되었습니다.`, "success");
            router.push("/");
        } catch (err) {
            console.error(err);
            showToast("가입 중 오류가 발생했습니다.", "error");
        } finally {
            setJoining(false);
        }
    };

    if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>가입 정보 확인 중...</div>;
    if (error) return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--accent)', lineHeight: '1.6' }}>{error}</div>;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <div className="glass-panel animate-fade" style={{ padding: '3rem', maxWidth: '500px', width: '100%' }}>
                {step === 1 ? (
                    <div style={{ textAlign: 'center' }}>
                        <h1 className="text-gradient" style={{ fontSize: '2.2rem', marginBottom: '1.5rem' }}>초대 확인</h1>
                        <div style={{ fontSize: '1.2rem', marginBottom: '2rem', lineHeight: '1.6' }}>
                            <strong style={{ color: 'var(--primary)', fontSize: '1.7rem' }}>{orgData?.name}</strong><br />
                            조직의 <span style={{ color: orgData?.invitedRole === 'admin' ? 'var(--accent)' : 'var(--secondary)', fontWeight: 'bold' }}>
                                {orgData?.invitedRole === 'admin' ? '운영 관리자' : '구성원'}
                            </span>{orgData?.invitedRole === 'admin' ? '로' : '으로'} 합류하시겠습니까?
                        </div>

                        <p style={{ fontSize: '0.95rem', color: 'var(--text-dim)', marginBottom: '1.2rem', wordBreak: 'keep-all' }}>
                            계정에 로그인하면 즉시 새로운 조직에 합류하게 됩니다.
                        </p>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.1)', padding: '0.3rem', borderRadius: '12px' }}>
                            <button
                                onClick={() => setAuthMethod('email')}
                                style={{
                                    flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none',
                                    background: authMethod === 'email' ? 'var(--bg-surface)' : 'transparent',
                                    color: authMethod === 'email' ? 'var(--text-main)' : 'var(--text-dim)',
                                    fontWeight: authMethod === 'email' ? 'bold' : 'normal',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    boxShadow: authMethod === 'email' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                ✉️ 이메일
                            </button>
                            <button
                                onClick={() => setAuthMethod('google')}
                                style={{
                                    flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none',
                                    background: authMethod === 'google' ? 'var(--bg-surface)' : 'transparent',
                                    color: authMethod === 'google' ? 'var(--text-main)' : 'var(--text-dim)',
                                    fontWeight: authMethod === 'google' ? 'bold' : 'normal',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    boxShadow: authMethod === 'google' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                G Google
                            </button>
                        </div>

                        {authMethod === 'email' && (
                            <>
                                <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.5rem' }}>
                                    {isEmailSignMode && (
                                        <input type="text" value={userName} onChange={e => setUserName(e.target.value)} placeholder="실명" className="glass-card" style={{ padding: '0.8rem' }} required />
                                    )}
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" className="glass-card" style={{ padding: '0.8rem' }} required />
                                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" className="glass-card" style={{ padding: '0.8rem' }} required />
                                    <button type="submit" className="btn-primary" style={{ padding: '1rem' }} disabled={pending}>
                                        {pending ? "처리 중..." : (isEmailSignMode ? "가입 후 합류하기" : "이메일 로그인 후 합류하기")}
                                    </button>
                                </form>

                                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem', cursor: 'pointer' }} onClick={() => setIsEmailSignMode(!isEmailSignMode)}>
                                    {isEmailSignMode ? "이미 계정이 있으신가요? 로그인하기" : "처음이신가요? 이메일로 가입하기"}
                                </div>
                            </>
                        )}

                        {authMethod === 'google' && (
                            <div style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
                                <button className="glass-card" onClick={handleGoogleLogin} style={{ width: '100%', padding: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', fontSize: '1rem', fontWeight: 'bold', border: '1px solid var(--border-glass)' }}>
                                    <img src="https://www.google.com/favicon.ico" alt="G" style={{ width: '20px' }} />
                                    Google 로그인 후 합류하기
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        <h2 style={{ marginBottom: '0.5rem', textAlign: 'center' }}>📋 프로필 정보 확인</h2>
                        <form onSubmit={(e) => { e.preventDefault(); finalizeJoin(auth.currentUser!.uid, authenticatedEmail || auth.currentUser?.email || null, "user"); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div className="input-group-v">
                                <label>실명</label><input type="text" value={userName} onChange={e => setUserName(e.target.value)} className="glass-card" required />
                            </div>
                            <div className="input-group-v">
                                <label>부서명</label><input type="text" value={userDept} onChange={e => setUserDept(e.target.value)} className="glass-card" required />
                            </div>
                            <div className="input-group-v">
                                <label>연락처</label><input type="text" value={userContact} onChange={e => setUserContact(e.target.value)} className="glass-card" required />
                            </div>
                            <button type="submit" className="btn-primary" style={{ padding: '1.2rem', marginTop: '1.5rem' }} disabled={joining}>
                                {joining ? "처리 중..." : "합류 완료하기"}
                            </button>
                        </form>
                    </div>
                )
                }
            </div >
            <style jsx>{`
                .input-group-v { display: flex; flex-direction: column; gap: 0.5rem; }
                .input-group-v label { font-size: 0.85rem; color: var(--text-dim); }
                .input-group-v input { padding: 1rem; border: none; color: white; outline: none; width: 100%; border-radius: 12px; }
            `}</style>
        </div >
    );
}
