"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, storage } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDate } from "@/utils/dateUtils";
import { compressImage } from "@/utils/fileUtils";

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

export default function SuperAdminNoticesPage() {
    const { isSuperAdmin, user, theme } = useAuth();
    const { showToast } = useToast();

    const [globalNotices, setGlobalNotices] = useState<Notice[]>([]);
    const [policies, setPolicies] = useState<any>({ fileLimit: "3" });

    const [isWritingNotice, setIsWritingNotice] = useState(false);
    const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
    const [noticeInfo, setNoticeInfo] = useState({ title: "", content: "" }); // To reduce state calls if strictly needed, but reusing existing states is fine if I just fix initialization.
    // Fix timezone issue:
    const getLocalISODate = () => {
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 10);
    };

    const [noticeTitle, setNoticeTitle] = useState("");
    const [noticeContent, setNoticeContent] = useState("");
    const [noticeStartDate, setNoticeStartDate] = useState(getLocalISODate());
    const [noticeEndDate, setNoticeEndDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [noticeFiles, setNoticeFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);

    useEffect(() => {
        if (!isSuperAdmin) return;

        const unsubNotices = onSnapshot(collection(db, "notices"), (snapshot) => {
            const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Notice[];
            // 전체 공지(global)만 필터링
            const globals = all.filter(n => n.orgId === "all").sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
            setGlobalNotices(globals);
        });

        return () => unsubNotices();
    }, [isSuperAdmin]);

    const handleGlobalNotice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!noticeTitle || !noticeContent) return;
        setIsUploading(true);
        try {
            const attachments = editingNotice ? [...(editingNotice.attachments || [])] : [];
            const limitVal = 50 * 1024 * 1024; // 50MB for Super Admin

            for (let file of noticeFiles) {
                file = await compressImage(file);
                if (file.size > limitVal) {
                    showToast(`${file.name} 용량 초과 (50MB 제한)`, "error");
                    setIsUploading(false); return;
                }
                const storageRef = ref(storage, `notices/super/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                attachments.push({ name: file.name, url, size: file.size });
            }

            const noticeData = {
                title: noticeTitle,
                content: noticeContent,
                startDate: noticeStartDate,
                endDate: noticeEndDate,
                attachments,
                updatedAt: serverTimestamp()
            };

            if (editingNotice) {
                await updateDoc(doc(db, "notices", editingNotice.id), noticeData);
                showToast("공지가 수정되었습니다.", "success");
            } else {
                await addDoc(collection(db, "notices"), {
                    ...noticeData, authorName: "시스템 관리자", authorUid: user?.uid,
                    orgId: "all", createdAt: serverTimestamp(), isPriority: true
                });
                showToast("발행 완료", "success");
            }
            resetNoticeForm();
        } catch (error) { showToast("오류 발생", "error"); } finally { setIsUploading(false); }
    };

    const resetNoticeForm = () => {
        setNoticeTitle(""); setNoticeContent(""); setNoticeFiles([]);
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        setNoticeStartDate(d.toISOString().slice(0, 10));
        setNoticeEndDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
        setIsWritingNotice(false); setEditingNotice(null);
    };

    const startEditNotice = (n: Notice) => {
        setEditingNotice(n);
        setNoticeTitle(n.title.replace(/^\[전체공지\]\s*/, ""));
        setNoticeContent(n.content);
        setNoticeStartDate(n.startDate.slice(0, 10));
        setNoticeEndDate(n.endDate.slice(0, 10));
        setIsWritingNotice(true);
    };

    const deleteNotice = async (id: string) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, "notices", id));
        showToast("삭제 완료", "info");
    };

    if (!isSuperAdmin) return <div style={{ padding: '4rem', textAlign: 'center' }}>권한이 없습니다.</div>;

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <div className="animate-fade">
                {!isWritingNotice ? (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                            <header>
                                <h1 className="text-gradient" style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.8rem' }}>📢 전체 공지 관리</h1>
                                <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>모든 사용자에게 노출되는 중요한 공지를 관리합니다.</p>
                            </header>
                            <button className="btn-primary" onClick={() => setIsWritingNotice(true)} style={{ padding: '0.8rem 2rem', borderRadius: '99px' }}>+ 새 공지 발행하기</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {globalNotices.length > 0 ? globalNotices.map(n => {
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const isExpired = todayStr > n.endDate;
                                const isFuture = todayStr < n.startDate;
                                const isNow = todayStr >= n.startDate && todayStr <= n.endDate;

                                return (
                                    <div key={n.id} className="glass-card" style={{
                                        padding: '1.5rem',
                                        opacity: isExpired ? (theme === 'light' ? 1 : 0.6) : 1,
                                        borderLeft: isNow ? '4px solid var(--primary)' : (isFuture ? '4px solid var(--secondary)' : '1px solid var(--border-glass)'),
                                        position: 'relative'
                                    }}>
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: isExpired ? 'var(--bg-surface)' : (isFuture ? 'var(--secondary)' : 'var(--primary)'), color: isExpired ? 'var(--text-dim)' : 'white', fontWeight: '600', border: isExpired ? '1px solid var(--border-glass)' : 'none' }}>
                                                    {isExpired ? '만료됨' : (isFuture ? '예약됨' : '게시중')}
                                                </span>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0, color: 'var(--text-main)' }}>{n.title}</h3>
                                            </div>
                                        </div>
                                        <div className="markdown-full" style={{ color: 'var(--text-main)', lineHeight: '1.7', marginBottom: '1rem' }}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.content}</ReactMarkdown>
                                        </div>
                                        {n.attachments && n.attachments.length > 0 && (
                                            <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {n.attachments.map((file, idx) => (
                                                    <a key={idx} href={file.url} target="_blank" rel="noreferrer" className="glass-card" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none' }}>
                                                        📎 {file.name}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.8rem', borderTop: '1px solid var(--border-glass)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem' }}>
                                                <span>👤 {n.authorName}</span>
                                                <span>🕒 작성: {formatDate(n.createdAt)}</span>
                                                <span style={{ opacity: 0.5 }}>|</span>
                                                <span>📅 게시: {formatDate(n.startDate)} ~ {formatDate(n.endDate)}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <button onClick={() => startEditNotice(n)} className="glass-card" style={{ padding: '0.4rem 0.8rem', borderRadius: '99px', fontSize: '0.8rem' }}>수정</button>
                                                <button onClick={() => deleteNotice(n.id)} className="glass-card" style={{ padding: '0.4rem 0.8rem', borderRadius: '99px', color: '#ff4444', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>삭제</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>발행된 전체 공지가 없습니다.</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="glass-panel" style={{ padding: '3rem', maxWidth: '900px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
                            <h2>{editingNotice ? '📝 전체 공지 수정' : '📢 새 전체 공지 발행'}</h2>
                            <button onClick={resetNoticeForm} className="glass-card" style={{ padding: '0.5rem 1rem', border: 'none' }}>취소</button>
                        </div>
                        <form onSubmit={handleGlobalNotice} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>공지 제목</label>
                                <input type="text" value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} className="glass-card" style={{ width: '100%', padding: '1rem', border: 'none' }} placeholder="제목을 입력하세요" required />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div><label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>게시 시작일</label><input type="date" value={noticeStartDate} onChange={e => setNoticeStartDate(e.target.value)} className="glass-card" style={{ width: '100%', padding: '1rem', border: 'none' }} required /></div>
                                <div><label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>게시 종료일</label><input type="date" value={noticeEndDate} onChange={e => setNoticeEndDate(e.target.value)} className="glass-card" style={{ width: '100%', padding: '1rem', border: 'none' }} required /></div>
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>공지 내용 (Markdown 지원)</label>
                                    <button type="button" onClick={() => setShowMarkdownHelp(!showMarkdownHelp)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: '50%', width: '20px', height: '20px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }} title="마크다운 문법 안내">?</button>
                                </div>
                                {showMarkdownHelp && (
                                    <div className="glass-card" style={{ padding: '1rem', marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                        <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>📝 마크다운 문법 안내</div>
                                        <div style={{ display: 'grid', gap: '0.3rem' }}>
                                            <div><code>**굵게**</code> → <strong>굵게</strong></div>
                                            <div><code>*기울임*</code> → <em>기울임</em></div>
                                            <div><code>[링크](URL)</code> → 링크 생성</div>
                                        </div>
                                    </div>
                                )}
                                <textarea value={noticeContent} onChange={e => setNoticeContent(e.target.value)} className="glass-card" style={{ width: '100%', padding: '1rem', border: 'none', minHeight: '300px' }} placeholder="공지 내용을 상세히 적어주세요." required />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>파일 첨부</label>
                                <input type="file" multiple onChange={e => setNoticeFiles(Array.from(e.target.files || []))} className="glass-card" style={{ width: '100%', padding: '1rem', border: 'none' }} />
                            </div>
                            <button type="submit" className="btn-primary" style={{ padding: '1.2rem', marginTop: '1rem' }} disabled={isUploading}>{isUploading ? '처리 중...' : (editingNotice ? '수정 사항 저장' : '공지 발행하기')}</button>
                        </form>
                    </div>
                )}
            </div>
        </main>
    );
}
