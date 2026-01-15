"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, auth } from "@/lib/firebase";
import { collection, onSnapshot, query, where, orderBy, getDocs, doc, setDoc, arrayUnion, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from "firebase/auth";
import { useGroupStatus } from "@/hooks/useGroupStatus";
import { formatDate } from "@/utils/dateUtils";
import { APP_CONFIG } from "@/config/app";
import LandingPage from "@/components/LandingPage";

// Redirect handler component wrapped in Suspense
function RedirectHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {
    const redirect = searchParams.get('redirect');
    if (user && redirect) {
      router.push(redirect);
    }
  }, [user, searchParams, router]);

  return null;
}

interface SimpleNotice {
  id: string;
  title: string;
  content: string;
  isPriority?: boolean;
  startDate: string;
  endDate: string;
  orgId: string;
  authorRole?: string;
}

export default function Home() {
  const { user, orgId, orgIds, loading, isAdmin, isSuperAdmin, activeProfile } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const updatedGroupIds = useGroupStatus();
  const [todayNotices, setTodayNotices] = useState<SimpleNotice[]>([]);
  const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [readNoticeIds, setReadNoticeIds] = useState<string[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);

  const [userName, setUserName] = useState("");
  const [userDept, setUserDept] = useState("");
  const [userContact, setUserContact] = useState("");

  // Email Login States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignMode, setIsSignMode] = useState(false); // false: login, true: signup
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (user && !userName) {
      setUserName(user.displayName || "");
    }
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      // Update/Create user doc with provider info
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        name: user.displayName || "익명",
        email: user.email,
        provider: 'google.com',
        lastLogin: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error(err);
      showToast("로그인 실패", "error");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setPending(true);
    try {
      if (isSignMode) {
        // Sign Up Validation
        if (!userName.trim()) {
          showToast("성함을 입력해 주세요.", "error");
          setPending(false);
          return;
        }
        if (!inviteCode.trim()) {
          showToast("조직 초대 코드를 입력해 주세요.", "error");
          setPending(false);
          return;
        }

        // Verify Invite Code before creation
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
          setPending(false);
          return;
        }

        targetOrgId = snapshot.docs[0].id;
        const orgData = snapshot.docs[0].data();
        if (orgData.status === 'suspended') {
          showToast("운영이 중단된 조직입니다.", "error");
          setPending(false);
          return;
        }

        // Create Account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: userName });

        // Create User Doc & Join Org
        await setDoc(doc(db, "users", userCredential.user.uid), {
          name: userName,
          email: email,
          role: "user",
          provider: 'password',
          orgIds: [targetOrgId],
          profiles: {
            [targetOrgId]: {
              name: userName,
              department: "미지정",
              contact: "미지정",
              role: role,
              joinedAt: serverTimestamp()
            }
          },
          createdAt: serverTimestamp()
        });
        showToast("회원가입 및 조직 합류 성공!", "success");
      } else {
        // Login
        const result = await signInWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", result.user.uid), {
          provider: 'password',
          lastLogin: serverTimestamp()
        }, { merge: true });
        showToast("로그인 성공!", "success");
      }
    } catch (err: any) {
      console.error(err);
      let msg = "오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

      switch (err.code) {
        case 'auth/invalid-email':
          msg = "유효하지 않은 이메일 형식입니다.";
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          msg = "이메일 주소 또는 비밀번호를 확인해 주세요.";
          break;
        case 'auth/email-already-in-use':
          msg = "이미 가입되어 있는 이메일입니다.";
          break;
        case 'auth/weak-password':
          msg = "보안을 위해 비밀번호는 6자리 이상으로 설정해 주세요.";
          break;
        case 'auth/too-many-requests':
          msg = "비정상적인 접근 시도가 많아 일시적으로 차단되었습니다. 잠시 후 다시 시도해 주세요.";
          break;
        case 'auth/user-disabled':
          msg = "사용이 중지된 계정입니다. 관리자에게 문의해 주세요.";
          break;
      }
      showToast(msg, "error");
    } finally {
      setPending(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      showToast("이메일을 먼저 입력해 주세요.", "info");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast("비밀번호 재설정 이메일을 보냈습니다.", "success");
    } catch (err) {
      showToast("메일 발송 실패", "error");
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode || !user) return;

    if (!userName.trim() || !userDept.trim() || !userContact.trim()) {
      showToast("모든 정보를 입력해 주세요.", "error");
      return;
    }

    setJoining(true);

    try {
      let q = query(collection(db, "organizations"), where("adminInviteCode", "==", inviteCode.trim()));
      let snapshot = await getDocs(q);
      let role = "user";
      let targetOrgId = "";
      let orgName = "";
      let orgStatus = "active";

      if (!snapshot.empty) {
        role = "admin";
        targetOrgId = snapshot.docs[0].id;
        orgName = snapshot.docs[0].data().name;
        orgStatus = snapshot.docs[0].data().status || "active";
      } else {
        q = query(collection(db, "organizations"), where("userInviteCode", "==", inviteCode.trim()));
        snapshot = await getDocs(q);
        if (snapshot.empty) {
          showToast("유효하지 않은 초대 코드입니다.", "error");
          setJoining(false); return;
        }
        targetOrgId = snapshot.docs[0].id;
        orgName = snapshot.docs[0].data().name;
        orgStatus = snapshot.docs[0].data().status || "active";
      }

      if (orgStatus === 'suspended') {
        showToast("해당 조직은 현재 운영이 중단되어 합류할 수 없습니다.", "error");
        setJoining(false); return;
      }

      if (orgIds.includes(targetOrgId)) {
        showToast("이미 가입된 조직입니다.", "info");
        setJoining(false); return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const data = userSnap.exists() ? userSnap.data() : {};

      const currentProfiles = data.profiles || {};
      const newProfiles = {
        ...currentProfiles,
        [targetOrgId]: {
          name: userName,
          department: userDept,
          contact: userContact,
          role: role // 해당 조직에서의 역할 저장
        }
      };

      // 글로벌 role 보호: 기존 role이 있으면 유지 (특히 superadmin), 없으면 기본 'user' 할당
      const finalGlobalRole = data.role || 'user';

      await setDoc(userRef, {
        email: user.email,
        orgIds: arrayUnion(targetOrgId),
        profiles: newProfiles,
        // 메인 정보는 기존 정보가 없을 때만 현재 입력값으로 저장
        name: data.name || userName,
        role: finalGlobalRole,
        joinedAt: data.joinedAt || new Date().toISOString()
      }, { merge: true });

      showToast(`${orgName} 조직에 합류했습니다!`, "success");
      setInviteCode(""); setUserName(""); setUserDept(""); setUserContact("");
      router.refresh();
    } catch (error) {
      console.error(error);
      showToast("가입 중 오류가 발생했습니다.", "error");
    } finally {
      setJoining(false);
    }
  };

  /* Dashboard Stats State */
  const [pendingSurveyCount, setPendingSurveyCount] = useState(0);
  const [todayResvCount, setTodayResvCount] = useState({ total: 0, reservedResources: 0 });
  const [myApprovalCount, setMyApprovalCount] = useState(0);
  const [publicGroupCount, setPublicGroupCount] = useState(0);
  const [myGroupCount, setMyGroupCount] = useState(0);
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    if (!orgId) { setOrgName(""); return; }
    const fetchOrgName = async () => {
      const orgDoc = await getDoc(doc(db, "organizations", orgId));
      if (orgDoc.exists()) setOrgName(orgDoc.data().name || "");
    };
    fetchOrgName();
  }, [orgId]);

  useEffect(() => {
    if (!user || !orgId) return;

    /* 1. Notices & Read Status Logic (Existing) */
    const q = query(collection(db, "notices"), orderBy("startDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allNotices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SimpleNotice[];
      const now = new Date().toISOString().slice(0, 10);
      const filtered = allNotices.filter(n => (n.orgId === orgId || n.orgId === "all" || myGroupIds.includes(n.orgId)) && (now >= n.startDate && now <= n.endDate));
      const sorted = filtered.sort((a, b) => {
        if (a.orgId === "all" && b.orgId !== "all") return 1;
        if (a.orgId !== "all" && b.orgId === "all") return -1;
        const aIsAdmin = a.authorRole === 'admin' || a.authorRole === 'superadmin';
        const bIsAdmin = b.authorRole === 'admin' || b.authorRole === 'superadmin';
        if (aIsAdmin && !bIsAdmin) return -1;
        if (!aIsAdmin && bIsAdmin) return 1;
        return b.startDate.localeCompare(a.startDate);
      });
      setTodayNotices(sorted);
      setNoticesLoading(false);
    });

    const userRef = doc(db, "users", user.uid);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const rids = snap.data().readNoticeIds || [];
        setReadNoticeIds(rids);
      }
    });

    /* 2. Survey Stats Logic */
    const loadSurveyStats = async () => {
      const today = new Date().toISOString().slice(0, 10);
      try {
        // 1. Fetch User Groups in this Org
        const qGroups = query(collection(db, "groups"), where("orgId", "==", orgId), where("memberIds", "array-contains", user.uid));
        const snapGroups = await getDocs(qGroups);
        const myGroupIds = snapGroups.docs.map(d => d.id);

        // 2. Build target IDs (Org + Global + Groups)
        const targetIds = [orgId, "all", ...myGroupIds];

        // 3. Fetch active surveys
        const surveysQ = query(collection(db, "surveys"), where("endDate", ">=", today));
        const surveysSnap = await getDocs(surveysQ);

        // Firestore 'in' query limit is 10. For the dashboard summary, we filter in-memory to keep it simple 
        // and avoid complex chunking for just a count.
        const activeSurveys = surveysSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(s => targetIds.includes(s.orgId));

        if (activeSurveys.length > 0) {
          // Check my responses
          const responsesQ = query(collection(db, "survey_responses"), where("userId", "==", user.uid));
          const responsesSnap = await getDocs(responsesQ);
          const myRespondedSurveyIds = responsesSnap.docs.map(d => d.data().surveyId);

          const pending = activeSurveys.filter(s => !myRespondedSurveyIds.includes(s.id)).length;
          setPendingSurveyCount(pending);
        } else {
          setPendingSurveyCount(0);
        }
      } catch (e) {
        console.error("Survey stats error:", e);
      }
    };
    loadSurveyStats();

    /* 3. Reservation Stats Logic */
    const loadResvStats = async () => {
      const today = new Date().toISOString().slice(0, 10);
      try {
        // Today's reservations
        const resvQ = query(collection(db, "reservations"), where("orgId", "==", orgId), where("date", "==", today));
        const resvSnap = await getDocs(resvQ);
        const todayResvs = resvSnap.docs.map(d => d.data());

        const total = todayResvs.filter((r: any) => r.status !== 'rejected').length;
        const uniqueResources = new Set(todayResvs.filter((r: any) => r.status !== 'rejected').map((r: any) => r.resourceId)).size;
        setTodayResvCount({ total, reservedResources: uniqueResources });

        // My approval (pending) count
        // First identify resources I manage
        const resourcesQ = query(collection(db, "resources"), where("orgId", "==", orgId), where("managers", "array-contains", user.uid));
        const resourcesSnap = await getDocs(resourcesQ);
        const myResourceIds = resourcesSnap.docs.map(d => d.id);

        if (myResourceIds.length > 0) {
          const pendingQ = query(collection(db, "reservations"), where("orgId", "==", orgId), where("status", "==", "pending"));
          const pendingSnap = await getDocs(pendingQ);
          const myPending = pendingSnap.docs.filter(d => myResourceIds.includes(d.data().resourceId)).length;
          setMyApprovalCount(myPending);
        } else {
          setMyApprovalCount(0);
        }

      } catch (e) {
        console.error("Resv stats error:", e);
      }
    };
    loadResvStats();

    /* 4. Group Stats Logic */
    const qGroups = query(collection(db, "groups"), where("orgId", "==", orgId));
    const unsubGroups = onSnapshot(qGroups, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })); // ID 포함
      setPublicGroupCount(all.filter((g: any) => g.isPublic).length);
      const myGroups = all.filter((g: any) => g.memberIds?.includes(user.uid));
      setMyGroupCount(myGroups.length);
      setMyGroupIds(myGroups.map((g: any) => g.id)); // ID가 없는 경우 대비해 any로 처리했으나, snapshot doc에서 가져올 때 id를 포함해야 함.
    });

    return () => { unsubscribe(); unsubUser(); unsubGroups(); };
  }, [user, orgId, myGroupIds]);

  /* ... (Existing Popup Logic) */
  useEffect(() => {
    if (todayNotices.length > 0) {
      const hasUnreadGlobal = todayNotices.some(n => n.orgId === 'all' && !readNoticeIds.includes(n.id));
      if (hasUnreadGlobal) setShowPopup(true);
    }
  }, [todayNotices, readNoticeIds]);
  /* ... */

  /* ... (Existing markAsRead, closePopup functions) */
  /* Copied here for context but not modified in replacement if they are outside the range, 
     but looking at the code block, I need to include them or respect the range.
     The 'useEffect' replacement covers lines 151-181.
     The render part is below. I will replace the whole useEffect block and the render block in one go? 
     No, tool says contiguous. I'll replace the main logic first. */

  /* Wait, I cannot do multiple replacements easily if they are far apart.
     Let's check the line numbers again.
     useEffect is 148-181.
     Render grid is 298-302.
     I should use multi_replace.
  */


  useEffect(() => {
    if (todayNotices.length > 0) {
      const hasUnreadGlobal = todayNotices.some(n => n.orgId === 'all' && !readNoticeIds.includes(n.id));
      if (hasUnreadGlobal) setShowPopup(true);
    }
  }, [todayNotices, readNoticeIds]);

  const markAsRead = async (noticeId: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        readNoticeIds: arrayUnion(noticeId)
      });
    } catch (err) {
      console.error(err);
    }
  };

  const closePopup = async () => {
    // 현재 팝업에 표시된 모든 공지를 읽음 처리
    const globalNoticeIds = todayNotices.filter(n => n.orgId === 'all').map(n => n.id);
    for (const id of globalNoticeIds) {
      await markAsRead(id);
    }
    setShowPopup(false);
  };

  if (loading) return null;

  return (
    <>
      <Suspense fallback={null}>
        <RedirectHandler />
      </Suspense>
      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {showPopup && todayNotices.filter(n => n.orgId === 'all').length > 0 && (
          <div className="modal-overlay">
            <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '600px', padding: '2.5rem', textAlign: 'center', border: '1px solid var(--accent)' }}>
              <span style={{ fontSize: '2.5rem', marginBottom: '1rem', display: 'block' }}>📢</span>
              <h2 style={{ marginBottom: '1rem', color: 'var(--accent)' }}>시스템 통합 공지</h2>
              <div style={{ textAlign: 'left', marginBottom: '2rem', maxHeight: '300px', overflowY: 'auto' }}>
                {todayNotices.filter(n => n.orgId === 'all').map(n => (
                  <div key={n.id} style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
                    <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.8rem' }}>{n.title}</p>
                    <div className="markdown-mini"><ReactMarkdown remarkPlugins={[remarkGfm]}>{n.content}</ReactMarkdown></div>
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={closePopup} style={{ width: '100%', padding: '1rem' }}>확인했습니다</button>
            </div>
          </div>
        )}

        {user && (
          <section className="animate-fade" style={{ marginBottom: '4rem', textAlign: 'center' }}>
            <h1 className="text-gradient" style={{ fontSize: '3.5rem', fontWeight: '700', marginBottom: '1rem' }}>EduHub Workspace</h1>
            <p style={{ color: 'var(--text-dim)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>{orgName ? `${orgName} 구성원의 효율적인 업무를 돕는 협업 플랫폼입니다.` : '구성원의 효율적인 업무를 돕는 협업 플랫폼입니다.'}</p>
          </section>
        )}

        {!user ? (
          <LandingPage>
            <section className="glass-panel animate-fade" style={{ padding: '3rem', textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
              <h2 style={{ marginBottom: '0.5rem' }}>{isSignMode ? "🚀 회원가입" : "👋 반가워요!"}</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>이메일 또는 Google 계정으로 간편하게</p>

              <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                {isSignMode && (
                  <>
                    <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="성함" className="glass-card" style={{ padding: '1rem' }} required />
                    <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="조직 초대 코드 (필수)" className="glass-card" style={{ padding: '1rem', border: '1px solid var(--primary-light)' }} required />
                  </>
                )}
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 주소" className="glass-card" style={{ padding: '1rem' }} required />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" className="glass-card" style={{ padding: '1rem' }} required />

                <button type="submit" className="btn-primary" style={{ padding: '1rem', fontSize: '1.1rem' }} disabled={pending}>
                  {pending ? "처리 중..." : (isSignMode ? "가입하기" : "로그인")}
                </button>
              </form>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.9rem', marginBottom: '2rem' }}>
                <span style={{ color: 'var(--text-dim)' }}>
                  {isSignMode ? "이미 계정이 있으신가요?" : "아직 계정이 없으신가요?"}
                </span>
                <button onClick={() => { setIsSignMode(!isSignMode); setUserName(""); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }}>
                  {isSignMode ? "로그인하기" : "회원가입"}
                </button>
              </div>

              {!isSignMode && (
                <button onClick={handleResetPassword} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '1rem' }}>
                  비밀번호를 잊으셨나요?
                </button>
              )}

              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>또는 소셜 계정으로 로그인</p>
                <button onClick={handleLogin} className="glass-card" style={{ padding: '0.8rem 2rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <img src="https://www.google.com/favicon.ico" alt="google" style={{ width: '16px' }} />
                  Google로 시작하기
                </button>
              </div>
            </section>
          </LandingPage>
        ) : (orgIds.length === 0 && !loading) ? (
          <section className="glass-panel animate-fade" style={{ padding: '3rem', maxWidth: '600px', margin: '0 auto 3rem' }}>
            <h2 style={{ marginBottom: '1rem', textAlign: 'center' }}>🚀 조직 합류하기</h2>
            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>합류할 조직에서 사용할 정보를 입력해 주세요.</p>
            <form onSubmit={handleJoinByCode} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-row"><label>초대 코드</label><input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="전달받은 코드" className="glass-card" disabled={joining} required /></div>
              <div className="input-row"><label>성함</label><input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="실명 입력" className="glass-card" disabled={joining} required /></div>
              <div className="input-row"><label>부서명</label><input type="text" value={userDept} onChange={(e) => setUserDept(e.target.value)} placeholder="예시: 교무부, 3학년부" className="glass-card" disabled={joining} required /></div>
              <div className="input-row"><label>연락처</label><input type="text" value={userContact} onChange={(e) => setUserContact(e.target.value)} placeholder="내선 또는 휴대전화" className="glass-card" disabled={joining} required /></div>
              <button type="submit" className="btn-primary" style={{ padding: '1.2rem', marginTop: '1.5rem', fontSize: '1.1rem' }} disabled={joining}>{joining ? "처리 중..." : "합류하기"}</button>
            </form>
          </section>
        ) : (
          <>
            {/* Quick Stats Grid - Moved to Top & Simplified */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              {/* 1. 설문조사 */}
              <Link href="/surveys" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="glass-card animate-fade" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%', transition: 'transform 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '2rem' }}>📊</span>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '0.2rem' }}>설문조사</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>참여 대기</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: '800', color: pendingSurveyCount > 0 ? 'var(--primary)' : 'var(--text-dim)', lineHeight: 1 }}>
                      {pendingSurveyCount}
                    </span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginLeft: '0.2rem' }}>건</span>
                  </div>
                </div>
              </Link>

              {/* 2. 예약현황 */}
              <Link href="/reservations" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="glass-card animate-fade" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%', animationDelay: '0.1s', transition: 'transform 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '2rem' }}>📅</span>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '0.2rem' }}>예약현황</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                        내 승인 대기 <span style={{ color: myApprovalCount > 0 ? 'var(--accent)' : 'inherit', fontWeight: 'bold' }}>{myApprovalCount}건</span>
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1 }}>
                      {todayResvCount.total}
                    </span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginLeft: '0.2rem' }}>건</span>
                  </div>
                </div>
              </Link>

              {/* 3. 그룹 */}
              <Link href="/groups" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="glass-card animate-fade" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%', animationDelay: '0.2s', transition: 'transform 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '2rem' }}>👥</span>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '0.2rem' }}>내 그룹</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>업데이트된 그룹 <span style={{ color: updatedGroupIds.length > 0 ? '#ff4444' : 'inherit', fontWeight: 'bold' }}>{updatedGroupIds.length}개</span></p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1 }}>
                      {myGroupCount}
                    </span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginLeft: '0.2rem' }}>개</span>
                  </div>
                </div>
              </Link>
            </div>

            <section className={`glass-panel ${!noticesLoading ? 'animate-fade' : ''}`} style={{ padding: '2rem', marginBottom: '3rem', minHeight: '300px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem' }}>📢 {formatDate(new Date())}</h2>
                <button className="glass-card" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }} onClick={() => { const d = new Date(); const dateStr = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); router.push(`/notice/${dateStr}`); }}>더 보기</button>
              </div>

              {noticesLoading ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                  공지사항을 불러오는 중...
                </div>
              ) : todayNotices.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  {todayNotices.map((notice, idx) => {
                    const isRead = readNoticeIds.includes(notice.id);
                    const isAll = notice.orgId === 'all';
                    const isOrg = notice.orgId === orgId;
                    const isGroup = !isAll && !isOrg;

                    return (
                      <div
                        key={notice.id}
                        className="glass-card"
                        onClick={() => markAsRead(notice.id)}
                        style={{
                          padding: '1.2rem',
                          borderLeft: isAll ? '4px solid var(--accent)' : (isGroup ? '4px solid #7950f2' : '4px solid var(--primary)'),
                          opacity: isRead ? 0.6 : 1,
                          transition: 'all 0.3s',
                          cursor: 'pointer',
                          position: 'relative',
                          animation: `fadeIn 0.5s ease-out ${idx * 0.05}s backwards`,
                          transform: isRead ? 'scale(0.99)' : 'scale(1)'
                        }}
                      >
                        {isRead && <span style={{ position: 'absolute', top: '0.8rem', right: '1rem', fontSize: '0.7rem', color: 'var(--text-dim)', border: '1px solid var(--border-glass)', padding: '2px 6px', borderRadius: '4px' }}>읽음</span>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: isAll ? 'rgba(255, 68, 68, 0.1)' : (isGroup ? 'rgba(121, 80, 242, 0.1)' : 'rgba(37, 99, 235, 0.1)'),
                            color: isAll ? 'var(--accent)' : (isGroup ? '#7950f2' : 'var(--primary)'),
                            fontWeight: 'bold'
                          }}>
                            {isAll ? '전체' : (isGroup ? '그룹' : '조직')}
                          </span>
                          <p style={{ fontWeight: '600', margin: 0, fontSize: '1.05rem' }}>{notice.title}</p>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', paddingLeft: '0.2rem', lineHeight: '1.5' }}>
                          <p style={{ margin: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {notice.content.replace(/[#*`]/g, '').slice(0, 100)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>📭</div>
                  오늘 예정된 공지사항이 없습니다.
                </div>
              )}
            </section>
          </>
        )}
        <style jsx>{`
        .markdown-mini :global(p) { margin: 0; }
        .input-row { display: flex; align-items: center; gap: 1.5rem; }
        .input-row label { width: 100px; font-size: 0.95rem; color: var(--text-dim); flex-shrink: 0; }
        .input-row input { flex: 1; padding: 0.9rem 1.2rem; border: none; color: white; outline: none; }
      `}</style>
      </main>
    </>
  );
}
