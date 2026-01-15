'use client';

import { useRef, useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function LandingPage({ children }: { children: React.ReactNode }) {
  const loginRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({ name: '', contact: '', content: '' });
  const [submitting, setSubmitting] = useState(false);

  // Theme & QnA State
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('auto');
  const [openQnaIndex, setOpenQnaIndex] = useState<number | null>(null);

  const QNA_ITEMS = [
    { q: "EduHub는 어떤 서비스인가요?", a: "교육 기관 내 구성원들이 공지, 설문, 그룹 활동, 자원 예약 등을 통합적으로 관리할 수 있는 스마트 협업 플랫폼입니다." },
    { q: "무료로 사용할 수 있나요?", a: "네, 현재 모든 기능이 무료로 제공되고 있으며, 학교 및 비영리 교육 기관을 위해 최적화되어 있습니다." },
    { q: "모바일에서도 사용할 수 있나요?", a: "물론입니다. PWA(설치형 웹앱) 기술을 지원하여 PC, 태블릿, 스마트폰 등 모든 기기에서 앱처럼 설치해 사용하실 수 있습니다." },
    { q: "초대 코드는 어떻게 받나요?", a: "소속된 학교나 기관의 관리자에게 문의하시면 발급받을 수 있습니다. 하단의 '가입 문의하기' 버튼을 통해 관리자에게 직접 문의할 수도 있습니다." },
  ];

  /* Theme Logic */
  useEffect(() => {
    const saved = localStorage.getItem('theme') as any;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    if (theme === 'auto') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('auto');
  };

  const getThemeIcon = () => {
    if (theme === 'auto') return '🌓';
    if (theme === 'light') return '☀️';
    return '🌙';
  };

  const toggleQna = (idx: number) => {
    setOpenQnaIndex(openQnaIndex === idx ? null : idx);
  };

  const scrollToLogin = () => {
    loginRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInquiry = () => {
    setShowInquiryModal(true);
  };

  const submitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryForm.name.trim() || !inquiryForm.contact.trim() || !inquiryForm.content.trim()) {
      showToast("모든 항목을 입력해 주세요.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "feedback"), {
        type: 'guest',
        orgId: 'super',
        authorName: inquiryForm.name,
        contact: inquiryForm.contact,
        content: inquiryForm.content,
        status: 'pending',
        createdAt: serverTimestamp(),
        isGuest: true
      });
      showToast("문의가 접수되었습니다. 관리자가 확인 후 답변드리겠습니다.", "success");
      setShowInquiryModal(false);
      setInquiryForm({ name: '', contact: '', content: '' });
    } catch (error) {
      console.error(error);
      showToast("문의 전송 중 오류가 발생했습니다.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="landing-container">
      {/* 1. Hero Section */}
      <section className="hero-section">
        <div className="hero-content animate-fade-in-up">
          <div className="badge">EduHub Workspace</div>
          <h1 className="hero-title">
            학교와 교육 기관을 위한<br />
            <span className="text-gradient">스마트 협업 플랫폼</span>
          </h1>
          <p className="hero-subtitle">
            복잡한 설정 없이 공지, 설문, 예약, 그룹 활동을 한 곳에서.<br />
            지금 바로 시작해보세요.
          </p>
          <button onClick={scrollToLogin} className="cta-button">
            시작하기
          </button>
        </div>
        <div className="hero-visual animate-fade-in">
          {/* Abstract Dashboard Graphic */}
          <div className="glass-card visual-card">
            <div className="card-header">
              <div className="dot red"></div>
              <div className="dot yellow"></div>
              <div className="dot green"></div>
            </div>
            <div className="card-body">
              <div className="skeleton-line w-75"></div>
              <div className="skeleton-line w-50"></div>
              <div className="skeleton-grid">
                <div className="skeleton-box"></div>
                <div className="skeleton-box"></div>
                <div className="skeleton-box"></div>
              </div>
            </div>
            <div className="floating-badge badge-1">📢 실시간 공지</div>
            <div className="floating-badge badge-2">📊 간편한 설문</div>
          </div>
        </div>
      </section>

      {/* 2. Features Grid */}
      <section className="features-section">
        <h2 className="section-title">주요 기능 둘러보기</h2>
        <div className="features-grid">
          <div className="feature-card glass-card">
            <div className="icon-wrapper">📢</div>
            <h3>실시간 공지사항</h3>
            <p>중요 공지는 팝업으로 알림.<br />놓치는 내용 없이 정확하게 전달하세요.</p>
          </div>
          <div className="feature-card glass-card">
            <div className="icon-wrapper">📊</div>
            <h3>간편한 설문조사</h3>
            <p>다양한 문항과 파일 제출 지원.<br />결과 통계와 엑셀 다운로드까지.</p>
          </div>
          <div className="feature-card glass-card">
            <div className="icon-wrapper">📅</div>
            <h3>스마트 자원 예약</h3>
            <p>중복 없는 회의실/기자재 예약.<br />승인 프로세스로 체계적인 관리.</p>
          </div>
          <div className="feature-card glass-card">
            <div className="icon-wrapper">👥</div>
            <h3>소모임 그룹</h3>
            <p>동아리, 학년부별 소통 공간.<br />공개/비공개 설정으로 유연하게.</p>
          </div>
        </div>
      </section>

      {/* 3. Why EduHub */}
      <section className="why-section">
        <div className="why-content glass-panel">
          <div className="why-item">
            <span className="check-icon">✓</span>
            <div>
              <h4>모든 업무를 한 곳에서</h4>
              <p>여러 앱을 오갈 필요 없이 EduHub 하나로 해결하세요.</p>
            </div>
          </div>
          <div className="why-item">
            <span className="check-icon">✓</span>
            <div>
              <h4>누구나 쉽게 사용</h4>
              <p>직관적인 디자인으로 별도 교육 없이 바로 사용 가능합니다.</p>
            </div>
          </div>
          <div className="why-item">
            <span className="check-icon">✓</span>
            <div>
              <h4>설치형 웹앱 (PWA)</h4>
              <p>PC, 모바일 어디서나 앱처럼 설치해서 사용하세요.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="qna-section">
        <h2 className="section-title">자주 묻는 질문</h2>
        <div className="qna-list">
          {QNA_ITEMS.map((item, idx) => (
            <div key={idx} className="qna-item glass-card" onClick={() => toggleQna(idx)} style={{ overflow: 'hidden' }}>
              <div className="qna-question">
                <span>Q. {item.q}</span>
                <span style={{ transform: openQnaIndex === idx ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>▼</span>
              </div>
              <div className={`qna-answer ${openQnaIndex === idx ? 'open' : ''}`}>
                <p>{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Login Redirect Section */}
      <section ref={loginRef} className="login-section-wrapper">
        <h2 className="section-title">지금 바로 시작하세요</h2>

        <div style={{ marginBottom: '2rem' }}>
          <button onClick={handleInquiry} className="glass-card bounce-hover" style={{ padding: '0.8rem 1.5rem', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto', cursor: 'pointer', fontSize: '0.95rem', color: 'var(--text-main)', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
            <span style={{ fontSize: '1.2rem' }}>🙋</span>
            관리자에게 문의하기
          </button>
        </div>

        <div className="login-frame">
          {children}
        </div>
      </section>

      {showInquiryModal && (
        <div className="modal-overlay">
          <div className="glass-panel animate-fade modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>🙋 가입 및 이용 문의</h3>
              <button onClick={() => setShowInquiryModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
              관리자에게 전달될 내용을 입력해 주세요.<br />
              연락처를 정확히 입력해주셔야 답변을 받으실 수 있습니다.
            </p>
            <form onSubmit={submitInquiry} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="text"
                placeholder="성함"
                className="glass-card"
                value={inquiryForm.name}
                onChange={e => setInquiryForm({ ...inquiryForm, name: e.target.value })}
                required
                style={{ padding: '0.8rem' }}
              />
              <input
                type="text"
                placeholder="연락처 (이메일 또는 전화번호)"
                className="glass-card"
                value={inquiryForm.contact}
                onChange={e => setInquiryForm({ ...inquiryForm, contact: e.target.value })}
                required
                style={{ padding: '0.8rem' }}
              />
              <textarea
                placeholder="문의 내용 (초대 코드 요청 등)"
                className="glass-card"
                rows={4}
                value={inquiryForm.content}
                onChange={e => setInquiryForm({ ...inquiryForm, content: e.target.value })}
                required
                style={{ padding: '0.8rem', resize: 'none', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowInquiryModal(false)} className="glass-card" style={{ flex: 1, padding: '0.8rem', cursor: 'pointer' }}>취소</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '0.8rem' }} disabled={submitting}>
                  {submitting ? "전송 중..." : "문의하기"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button className="theme-toggle-btn glass-card bounce-hover" onClick={toggleTheme} title={`테마 변경 (${theme})`}>
        {getThemeIcon()}
      </button>

      <style jsx>{`
        .landing-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }

        /* Hero */
        .hero-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4rem 0 6rem;
          gap: 2rem;
          min-height: 80vh;
        }
        .hero-content {
          flex: 1;
          max-width: 600px;
        }
        .badge {
          display: inline-block;
          padding: 0.4rem 1rem;
          background: rgba(var(--primary-rgb), 0.1);
          color: var(--primary);
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
          border: 1px solid rgba(var(--primary-rgb), 0.2);
        }
        .hero-title {
          font-size: 3.5rem;
          line-height: 1.2;
          font-weight: 800;
          margin-bottom: 1.5rem;
          letter-spacing: -0.02em;
        }
        .text-gradient {
          background: linear-gradient(135deg, #6e8efb, #a777e3);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-subtitle {
          font-size: 1.2rem;
          color: var(--text-dim);
          margin-bottom: 2.5rem;
          line-height: 1.6;
        }
        .cta-button {
          padding: 1rem 2.5rem;
          font-size: 1.1rem;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, var(--primary), var(--accent));
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 15px rgba(var(--primary-rgb), 0.3);
        }
        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(var(--primary-rgb), 0.4);
        }

        /* Feature Visual with CSS Art */
        .hero-visual {
          flex: 1;
          display: flex;
          justify-content: center;
          position: relative;
        }
        .visual-card {
          width: 360px;
          height: 240px;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1.5rem;
          position: relative;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          transform: perspective(1000px) rotateY(-10deg) rotateX(5deg);
        }
        .card-header {
          display: flex;
          gap: 6px;
          margin-bottom: 1.5rem;
        }
        .dot { width: 10px; height: 10px; border-radius: 50%; opacity: 0.7; }
        .red { background: #ff5f56; }
        .yellow { background: #ffbd2e; }
        .green { background: #27c93f; }
        .skeleton-line {
          height: 10px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          margin-bottom: 10px;
        }
        .w-75 { width: 75%; }
        .w-50 { width: 50%; }
        .skeleton-grid {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        .skeleton-box {
          flex: 1;
          height: 60px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }
        .floating-badge {
          position: absolute;
          padding: 0.6rem 1rem;
          background: rgba(30, 30, 40, 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 30px;
          font-size: 0.9rem;
          font-weight: 600;
          box-shadow: 0 10px 20px rgba(0,0,0,0.3);
          animation: float 3s ease-in-out infinite;
        }
        .badge-1 { top: -20px; right: -20px; animation-delay: 0s; }
        .badge-2 { bottom: -20px; left: -20px; animation-delay: 1.5s; }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        /* Features Section */
        .features-section {
          padding: 6rem 0;
          text-align: center;
        }
        .section-title {
          font-size: 2.2rem;
          margin-bottom: 3rem;
          font-weight: 700;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 2rem;
        }
        .feature-card {
          padding: 2.5rem 1.5rem;
          text-align: left;
          transition: transform 0.3s;
        }
        .feature-card:hover {
          transform: translateY(-5px);
        }
        .icon-wrapper {
          font-size: 2.5rem;
          margin-bottom: 1.5rem;
        }
        .feature-card h3 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
          color: var(--text-main);
        }
        .feature-card p {
          font-size: 0.95rem;
          color: var(--text-dim);
          line-height: 1.6;
        }

        /* Why Section */
        .why-section {
          margin-bottom: 6rem;
        }
        .why-content {
          padding: 3rem;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
          background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
        }
        .why-item {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }
        .check-icon {
          color: var(--primary);
          font-weight: bold;
          font-size: 1.2rem;
          padding-top: 2px;
        }
        .why-item h4 {
          font-size: 1.1rem;
          margin-bottom: 0.5rem;
          color: var(--text-main);
        }
        .why-item p {
          font-size: 0.9rem;
          color: var(--text-dim);
          line-height: 1.5;
        }

        /* Login Section */
        .login-section-wrapper {
          padding: 4rem 0 6rem;
          text-align: center;
        }
        .login-subtitle {
          color: var(--text-dim);
          margin-bottom: 2rem;
        }
        .login-frame {
          max-width: 480px;
          margin: 0 auto;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .hero-section {
            flex-direction: column;
            text-align: center;
            padding-top: 2rem;
          }
          .hero-content {
            margin: 0 auto;
          }
          .hero-title {
            font-size: 2.5rem;
          }
          .hero-visual {
            width: 100%;
            margin-top: 2rem;
          }
          .visual-card {
            width: 100%;
            max-width: 320px;
          }
        }
        
        .bounce-hover { transition: transform 0.2s; }
        .bounce-hover:hover { transform: translateY(-3px); }

        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }
        .modal-content {
          width: 100%;
          max-width: 420px;
          padding: 2rem;
          background: #1e1e24;
          border: 1px solid var(--border-glass);
        }

        /* QnA Styles */
        .qna-section { padding: 4rem 0; }
        .qna-list { max-width: 800px; margin: 0 auto; text-align: left; }
        .qna-item { margin-bottom: 1rem; cursor: pointer; border: 1px solid var(--border-glass); }
        .qna-question { 
          padding: 1.2rem; 
          font-weight: 600; 
          display: flex; 
          justify-content: space-between; 
          align-items: center;
          color: var(--text-main);
        }
        .qna-answer {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-out, padding 0.3s ease;
          background: rgba(0,0,0,0.1);
        }
        .qna-answer.open {
          max-height: 200px;
          padding: 1.2rem;
          border-top: 1px solid var(--border-glass);
        }
        .qna-answer p { color: var(--text-dim); line-height: 1.6; font-size: 0.95rem; }

        /* Theme Toggle */
        .theme-toggle-btn {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          cursor: pointer;
          z-index: 9999;
          border: 1px solid var(--border-glass);
          background: var(--bg-card);
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>
  );
}
