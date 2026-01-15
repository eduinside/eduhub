"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, storage } from "@/lib/firebase";
import {
    collection, onSnapshot, query, where, addDoc, serverTimestamp,
    deleteDoc, doc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { formatDate } from "@/utils/dateUtils";

interface Attachment {
    type: 'link' | 'file';
    url: string;
    name?: string;
}

interface Question {
    id: string;
    type: 'text' | 'choice' | 'multiple' | 'notice' | 'file';
    text: string;
    options?: string[];
    attachments?: Attachment[];
    attachment?: Attachment | null;
}

// Tab manager component
function TabManager({ onChange }: { onChange: (tab: 'inprogress' | 'completed' | 'my') => void }) {
    const searchParams = useSearchParams();

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam === 'completed' || tabParam === 'my') {
            onChange(tabParam);
        }
    }, [searchParams, onChange]);

    return null;
}

export default function SurveysPage() {
    const { user, orgId, activeProfile, isAdmin, loading } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();
    const pathname = usePathname();

    // Dynamic page title
    useEffect(() => {
        document.title = "설문조사 - EduHub";
    }, []);

    const [surveys, setSurveys] = useState<any[]>([]);
    const [respondedSurveyIds, setRespondedSurveyIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'inprogress' | 'completed' | 'my'>('inprogress');
    const [isCreating, setIsCreating] = useState(false);

    // New Survey Form
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [endDate, setEndDate] = useState("");
    const [questions, setQuestions] = useState<Question[]>([]);
    const [orgUploadLimit, setOrgUploadLimit] = useState<string>("3");

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.push(`/?redirect=${encodeURIComponent(pathname)}`);
        }
    }, [user, loading, pathname, router]);

    useEffect(() => {
        setEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    }, []);

    useEffect(() => {
        if (!orgId || !user) return;

        // 1. Fetch Surveys
        const fetchSurveys = async () => {
            // 1. Fetch User Groups in this Org
            const qGroups = query(collection(db, "groups"), where("orgId", "==", orgId), where("memberIds", "array-contains", user.uid));
            const snapGroups = await import("firebase/firestore").then(mod => mod.getDocs(qGroups));
            const myGroups = snapGroups.docs.map(d => ({ id: d.id, name: d.data().name }));
            const myGroupIds = myGroups.map(g => g.id);

            // 2. Build target IDs (Org + Groups)
            const targetIds = [orgId, ...myGroupIds];

            // Firestore 'in' limit is 10. If > 10, we might need multiple queries. For now, let's limit to first 9 groups + org.
            const safeTargetIds = targetIds.slice(0, 10);

            const q = query(collection(db, "surveys"), where("orgId", "in", safeTargetIds));
            const unsubSurveys = onSnapshot(q, (snapshot) => {
                const list = snapshot.docs.map(doc => {
                    const data = doc.data();
                    const today = new Date().toISOString().slice(0, 10);
                    const status = data.endDate >= today ? 'inprogress' : 'completed';
                    const groupName = myGroups.find(g => g.id === data.orgId)?.name;
                    return { id: doc.id, ...data, status, groupName };
                });

                // Default sort (will be re-sorted in render)
                list.sort((a: any, b: any) => a.endDate.localeCompare(b.endDate));

                setSurveys(list);
            });
            return unsubSurveys;
        };

        let unsub: any;
        fetchSurveys().then(fn => unsub = fn);

        // 2. Fetch User Responses
        const responsesQ = query(collection(db, "survey_responses"), where("userId", "==", user.uid));
        const unsubResponses = onSnapshot(responsesQ, (snapshot) => {
            const ids = snapshot.docs.map(doc => doc.data().surveyId);
            setRespondedSurveyIds(ids);
        });

        // 3. Org Settings
        const unsubOrg = onSnapshot(doc(db, "organizations", orgId), (snap) => {
            if (snap.exists()) {
                setOrgUploadLimit(snap.data().uploadLimit || "3");
            }
        });

        return () => { if (unsub) unsub(); unsubResponses(); unsubOrg(); };
    }, [orgId, user]);

    const addQuestion = (type: 'text' | 'choice' | 'multiple' | 'notice' | 'file') => {
        const newQ: Question = {
            id: Date.now().toString(),
            type,
            text: "",
            options: (type === 'choice' || type === 'multiple') ? ["옵션 1"] : undefined,
            attachments: []
        };
        setQuestions([...questions, newQ]);
    };

    const updateQuestionText = (id: string, text: string) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, text } : q));
    };

    const updateOption = (qId: string, optIdx: number, val: string) => {
        setQuestions(questions.map(q => {
            if (q.id === qId && q.options) {
                const newOpts = [...q.options];
                newOpts[optIdx] = val;
                return { ...q, options: newOpts };
            }
            return q;
        }));
    };

    const addOption = (qId: string) => {
        setQuestions(questions.map(q => {
            if (q.id === qId && q.options) {
                return { ...q, options: [...q.options, `옵션 ${q.options.length + 1}`] };
            }
            return q;
        }));
    };

    const removeQuestion = (id: string) => {
        setQuestions(questions.filter(q => q.id !== id));
    };

    const handleAddLink = (qId: string) => {
        const url = prompt("추가할 링크 주소를 입력하세요 (http:// 포함):");
        if (!url) return;
        setQuestions(questions.map(q => {
            if (q.id === qId) {
                const prev = q.attachments || (q.attachment ? [q.attachment] : []);
                return { ...q, attachments: [...prev, { type: 'link', url, name: url }], attachment: null };
            }
            return q;
        }));
    };

    const handleFileChange = async (qId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!user) {
            showToast("로그인이 필요합니다.", "error");
            return;
        }

        try {
            const storageRef = ref(storage, `surveys/${user.uid}/${Date.now()}_${file.name}`);
            showToast("파일 업로드 중...", "info");
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);

            setQuestions(questions.map(q => {
                if (q.id === qId) {
                    const prev = q.attachments || (q.attachment ? [q.attachment] : []);
                    return { ...q, attachments: [...prev, { type: 'file', url, name: file.name }], attachment: null };
                }
                return q;
            }));
            showToast("파일이 첨부되었습니다.", "success");
        } catch (err) {
            console.error(err);
            showToast("파일 업로드 실패 (권한 문제일 수 있음)", "error");
        }
    };

    const handleRemoveAttachment = (qId: string, idx: number) => {
        setQuestions(questions.map(q => {
            if (q.id === qId) {
                const prev = q.attachments || (q.attachment ? [q.attachment] : []);
                return { ...q, attachments: prev.filter((_, i) => i !== idx), attachment: null };
            }
            return q;
        }));
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId) {
            showToast("조직 정보가 확인되지 않습니다.", "error");
            return;
        }
        if (questions.length === 0) {
            showToast("질문을 하나 이상 추가해 주세요.", "error");
            return;
        }

        try {
            const sanitizedQuestions = questions.map(q => ({
                id: q.id,
                type: q.type,
                text: q.text,
                options: q.options || null,
                attachments: q.attachments || (q.attachment ? [q.attachment] : [])
            }));

            await addDoc(collection(db, "surveys"), {
                title,
                description,
                endDate,
                questions: sanitizedQuestions,
                orgId,
                authorUid: user?.uid,
                authorName: activeProfile?.name || user?.displayName || "익명",
                createdAt: serverTimestamp(),
            });
            showToast("새 설문이 발행되었습니다.", "success");
            setIsCreating(false);
            resetForm();
        } catch (err: any) {
            console.error("Create Survey Error:", err);
            showToast(`발행 실패: ${err.code || err.message}`, "error");
        }
    };

    const resetForm = () => {
        setTitle(""); setDescription(""); setQuestions([]);
        setEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    };

    const handleDuplicate = (survey: any) => {
        setTitle(`[복사] ${survey.title}`);
        setDescription(survey.description);
        setEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

        const copiedQuestions = survey.questions.map((q: any, idx: number) => ({
            ...q,
            id: Date.now().toString() + idx,
            attachments: q.attachments ? [...q.attachments] : (q.attachment ? [q.attachment] : [])
        }));
        setQuestions(copiedQuestions);
        setIsCreating(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast("설문 내용이 복사되었습니다.", "info");
    };

    const handleDelete = async (id: string, authorUid: string) => {
        if (authorUid !== user?.uid && !isAdmin) {
            showToast("삭제 권한이 없습니다.", "error");
            return;
        }
        if (!confirm("설문을 삭제하시겠습니까? 응답 데이터도 모두 삭제됩니다.")) return;

        try {
            await deleteDoc(doc(db, "surveys", id));
            showToast("삭제 완료", "info");
        } catch (e) {
            showToast("삭제 실패", "error");
        }
    };

    if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>로딩 중...</div>;
    if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>로딩 중...</div>;
    if (!user) return null;

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📝 설문조사</h1>
                    <p style={{ color: 'var(--text-dim)', fontSize: '1.2rem' }}>설문을 생성하고 구성원들의 의견을 수집합니다.</p>
                </div>
                {!isCreating && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="btn-primary"
                        style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        + 설문 만들기
                    </button>
                )}
            </header>

            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                {isCreating ? (
                    <div className="glass-panel animate-fade" style={{ padding: '3rem', maxWidth: '800px', margin: '0 auto' }}>
                        <h2 style={{ marginBottom: '2rem', fontSize: '1.5rem' }}>📝 새 설문 만들기</h2>
                        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>설문 제목</label>
                                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="glass-card" style={{ width: '100%', padding: '1rem', marginTop: '0.5rem' }} placeholder="예: [만족도 조사] 2024 하반기 워크숍" required />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>설문 설명</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} className="glass-card" style={{ width: '100%', padding: '1rem', marginTop: '0.5rem', minHeight: '100px' }} placeholder="설문의 목적과 안내 사항을 적어주세요." required />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>설문 마감일</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="glass-card" style={{ width: '100%', padding: '1rem', marginTop: '0.5rem' }} required />
                            </div>

                            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <h3 style={{ fontSize: '1.1rem' }}>질문 구성 ({questions.length})</h3>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button type="button" onClick={() => addQuestion('choice')} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>+ 객관식</button>
                                        <button type="button" onClick={() => addQuestion('multiple')} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>+ 다중선택</button>
                                        <button type="button" onClick={() => addQuestion('text')} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>+ 주관식</button>
                                        <button type="button" onClick={() => addQuestion('notice')} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>+ 설명/자료</button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {questions.map((q, idx) => (
                                        <div key={q.id} className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--border-glass)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                    {q.type === 'notice' ? '[설명/자료]' : (q.type === 'file' ? `문항 ${idx + 1} (파일 제출)` : `문항 ${idx + 1} (${q.type === 'text' ? '주관식' : (q.type === 'choice' ? '객관식' : '다중선택')})`)}
                                                </span>
                                                <button type="button" onClick={() => removeQuestion(q.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}>삭제</button>
                                            </div>
                                            <input
                                                type="text" value={q.text} onChange={e => updateQuestionText(q.id, e.target.value)}
                                                className="glass-card" style={{ width: '100%', padding: '0.8rem', border: 'none', marginBottom: '1rem' }}
                                                placeholder={q.type === 'notice' ? "섹션 제목이나 안내 문구를 입력하세요" : "질문 내용을 입력하세요"} required
                                            />

                                            {/* File Question UI */}
                                            {q.type === 'file' && (
                                                <div style={{ padding: '1.5rem', border: '2px dashed var(--border-glass)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-dim)', marginBottom: '1rem', background: 'rgba(0,0,0,0.02)' }}>
                                                    📁 응답자가 이 문항에서 파일을 업로드하게 됩니다.
                                                </div>
                                            )}

                                            {/* Attachments - only show for notice type */}
                                            {q.type === 'notice' && (
                                                <>
                                                    {(q.attachments || (q.attachment ? [q.attachment] : [])).length > 0 && (
                                                        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                            {(q.attachments || (q.attachment ? [q.attachment] : [])).map((att: any, attIdx: number) => (
                                                                <div key={attIdx} style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                                                                        <span>{att.type === 'link' ? "🔗" : "📁"}</span>
                                                                        <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                                                                            {att.name || att.url}
                                                                        </a>
                                                                    </div>
                                                                    <button type="button" onClick={() => handleRemoveAttachment(q.id, attIdx)} style={{ border: 'none', background: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.8rem' }}>삭제</button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1rem' }}>
                                                        <button type="button" onClick={() => handleAddLink(q.id)} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer' }}>🔗 링크 추가</button>
                                                        {orgUploadLimit !== 'blocked' && (
                                                            <label className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                                📁 파일 추가
                                                                <input type="file" hidden onChange={(e) => handleFileChange(q.id, e)} />
                                                            </label>
                                                        )}
                                                    </div>
                                                </>
                                            )}

                                            {q.options && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                    {q.options.map((opt, oIdx) => (
                                                        <div key={oIdx} style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <input
                                                                type="text" value={opt} onChange={e => updateOption(q.id, oIdx, e.target.value)}
                                                                className="glass-card" style={{ flex: 1, padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}
                                                            />
                                                        </div>
                                                    ))}
                                                    <button type="button" onClick={() => addOption(q.id)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.8rem', cursor: 'pointer' }}>+ 옵션 추가</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsCreating(false)} className="glass-card" style={{ flex: 1, padding: '1rem' }}>취소</button>
                                <button type="submit" className="btn-primary" style={{ flex: 2, padding: '1rem' }}>발행하기</button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-glass)' }}>
                            <button
                                onClick={() => setActiveTab('inprogress')}
                                style={{
                                    padding: '1rem', background: 'none', border: 'none', cursor: 'pointer',
                                    borderBottom: activeTab === 'inprogress' ? '2px solid var(--primary)' : 'none',
                                    color: activeTab === 'inprogress' ? 'var(--primary)' : 'var(--text-dim)',
                                    fontWeight: activeTab === 'inprogress' ? 'bold' : 'normal'
                                }}
                            >
                                진행중 ({surveys.filter(s => s.status === 'inprogress' && !respondedSurveyIds.includes(s.id)).length})
                            </button>
                            <button
                                onClick={() => setActiveTab('completed')}
                                style={{
                                    padding: '1rem', background: 'none', border: 'none', cursor: 'pointer',
                                    borderBottom: activeTab === 'completed' ? '2px solid var(--primary)' : 'none',
                                    color: activeTab === 'completed' ? 'var(--primary)' : 'var(--text-dim)',
                                    fontWeight: activeTab === 'completed' ? 'bold' : 'normal'
                                }}
                            >
                                응답완료 ({surveys.filter(s => respondedSurveyIds.includes(s.id)).length})
                            </button>
                            <button
                                onClick={() => setActiveTab('my')}
                                style={{
                                    padding: '1rem', background: 'none', border: 'none', cursor: 'pointer',
                                    borderBottom: activeTab === 'my' ? '2px solid var(--primary)' : 'none',
                                    color: activeTab === 'my' ? 'var(--primary)' : 'var(--text-dim)',
                                    fontWeight: activeTab === 'my' ? 'bold' : 'normal'
                                }}
                            >
                                내 설문 ({surveys.filter(s => s.authorUid === user.uid).length})
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {surveys.filter(s => {
                                if (activeTab === 'inprogress') return s.status === 'inprogress' && !respondedSurveyIds.includes(s.id);
                                if (activeTab === 'completed') return respondedSurveyIds.includes(s.id);
                                if (activeTab === 'my') return s.authorUid === user.uid;
                                return false;
                            }).sort((a, b) => {
                                if (activeTab === 'inprogress') return a.endDate.localeCompare(b.endDate); // Ascending
                                return b.endDate.localeCompare(a.endDate); // Descending for others
                            }).length > 0 ? (
                                surveys.filter(s => {
                                    if (activeTab === 'inprogress') return s.status === 'inprogress' && !respondedSurveyIds.includes(s.id);
                                    if (activeTab === 'completed') return respondedSurveyIds.includes(s.id);
                                    if (activeTab === 'my') return s.authorUid === user.uid;
                                    return false;
                                }).sort((a, b) => {
                                    if (activeTab === 'inprogress') return a.endDate.localeCompare(b.endDate); // Ascending
                                    return b.endDate.localeCompare(a.endDate); // Descending for others
                                }).map(survey => (
                                    <div key={survey.id} className="glass-panel" style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
                                                {(activeTab !== 'inprogress') && (
                                                    <span style={{
                                                        fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderRadius: '4px',
                                                        background: survey.status === 'inprogress' ? 'var(--accent)' : 'var(--bg-surface)',
                                                        color: survey.status === 'inprogress' ? 'black' : 'var(--text-dim)',
                                                        fontWeight: '600'
                                                    }}>
                                                        {survey.status === 'inprogress' ? "진행중" : "마감됨"}
                                                    </span>
                                                )}
                                                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{survey.title}</h3>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                                {survey.groupName ? (
                                                    <span style={{
                                                        fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
                                                        background: 'rgba(121, 80, 242, 0.15)', color: '#7950f2', border: '1px solid rgba(121, 80, 242, 0.3)'
                                                    }}>
                                                        그룹
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
                                                        background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)'
                                                    }}>
                                                        조직
                                                    </span>
                                                )}
                                                <span>·</span>
                                                <span>{formatDate(survey.endDate)}까지</span>
                                                <span>·</span>
                                                <span>{survey.groupName ? `${survey.groupName}(${survey.authorName})` : survey.authorName}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            {/* Status Button Logic */}
                                            {survey.status === 'inprogress' ? (
                                                !respondedSurveyIds.includes(survey.id) ? (
                                                    <button
                                                        onClick={() => router.push(`/surveys/${survey.id}?from=${activeTab}`)}
                                                        className="btn-primary"
                                                        style={{ padding: '0.8rem 2rem', borderRadius: '99px', cursor: 'pointer' }}
                                                    >
                                                        참여하기
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => router.push(`/surveys/${survey.id}?from=${activeTab}`)} // Edit response
                                                        className="glass-card"
                                                        style={{ padding: '0.8rem 2rem', borderRadius: '99px', cursor: 'pointer', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                                                    >
                                                        수정하기
                                                    </button>
                                                )
                                            ) : (
                                                <button
                                                    disabled
                                                    className="glass-card"
                                                    style={{ padding: '0.8rem 2rem', borderRadius: '99px', opacity: 0.5, cursor: 'not-allowed' }}
                                                >
                                                    마감됨
                                                </button>
                                            )}

                                            {/* Author Actions */}
                                            {survey.authorUid === user.uid && (
                                                <>
                                                    <button
                                                        onClick={() => router.push(`/surveys/${survey.id}/results?from=${activeTab}`)}
                                                        className="glass-card"
                                                        style={{ padding: '0.8rem', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}
                                                        title="결과 보기"
                                                    >
                                                        📊
                                                    </button>
                                                    <button
                                                        onClick={() => handleDuplicate(survey)}
                                                        className="glass-card"
                                                        style={{ padding: '0.8rem', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        title="복제하기"
                                                    >
                                                        📋
                                                    </button>
                                                    <button onClick={() => handleDelete(survey.id, survey.authorUid)} className="glass-card" style={{ padding: '0.8rem', borderRadius: '50%', color: '#ff4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        🗑️
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    {activeTab === 'inprogress' ? "진행 중인 설문이 없습니다." : (activeTab === 'completed' ? "참여한 설문이 없습니다." : "작성한 설문이 없습니다.")}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
