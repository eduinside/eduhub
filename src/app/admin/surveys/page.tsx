"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import {
    collection, onSnapshot, query, where, orderBy, addDoc, serverTimestamp,
    deleteDoc, doc
} from "firebase/firestore";
import { formatDate } from "@/utils/dateUtils";

interface Question {
    id: string;
    type: 'text' | 'choice' | 'multiple';
    text: string;
    options?: string[];
}

export default function AdminSurveysPage() {
    const { user, orgId, isAdmin, isSuperAdmin, activeProfile } = useAuth();
    const { showToast } = useToast();

    const [surveys, setSurveys] = useState<any[]>([]);
    const [isCreating, setIsCreating] = useState(false);

    // New Survey Form
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [questions, setQuestions] = useState<Question[]>([]);

    useEffect(() => {
        if (!orgId) return;
        const q = query(collection(db, "surveys"), where("orgId", "==", orgId), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snapshot) => {
            setSurveys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, [orgId]);

    if (!isSuperAdmin) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
                <h2 style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>⚠️ 접근 권한 없음</h2>
                <p style={{ color: 'var(--text-dim)' }}>설문 관리는 시스템 관리자만 이용할 수 있습니다.</p>
            </div>
        );
    }

    const addQuestion = (type: 'text' | 'choice' | 'multiple') => {
        const newQ: Question = {
            id: Date.now().toString(),
            type,
            text: "",
            options: type !== 'text' ? ["옵션 1"] : undefined
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

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || questions.length === 0) {
            showToast("질문을 하나 이상 추가해 주세요.", "error");
            return;
        }

        try {
            await addDoc(collection(db, "surveys"), {
                title,
                description,
                endDate,
                questions,
                orgId,
                authorUid: user?.uid,
                authorName: activeProfile?.name || user?.displayName || "익명",
                createdAt: serverTimestamp(),
            });
            showToast("새 설문이 발행되었습니다.", "success");
            setIsCreating(false);
            resetForm();
        } catch (err) {
            showToast("오류 발생", "error");
        }
    };

    const resetForm = () => {
        setTitle(""); setDescription(""); setQuestions([]);
        setEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    };

    const handleDelete = async (id: string) => {
        if (!confirm("설문을 삭제하시겠습니까? 응답 데이터도 모두 삭제됩니다.")) return;
        await deleteDoc(doc(db, "surveys", id));
        showToast("삭제 완료", "info");
    };

    if (!isAdmin && !isSuperAdmin) return <div style={{ padding: '4rem', textAlign: 'center' }}>권한 없음</div>;

    return (
        <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📊 설문 관리 콘솔</h1>
                    <p style={{ color: 'var(--text-dim)' }}>구성원들의 의견 수렴을 위한 설문을 생성하고 관리합니다.</p>
                </div>
                <button onClick={() => setIsCreating(true)} className="btn-primary" style={{ padding: '0.8rem 2.5rem' }}>+ 새 설문 만들기</button>
            </header>

            {isCreating ? (
                <div className="glass-panel animate-fade" style={{ padding: '3rem', maxWidth: '800px', margin: '0 auto' }}>
                    <h2 style={{ marginBottom: '2rem' }}>📝 새 설문 기획</h2>
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
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {questions.map((q, idx) => (
                                    <div key={q.id} className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--border-glass)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 'bold' }}>문항 {idx + 1} ({q.type === 'text' ? '주관식' : (q.type === 'choice' ? '객관식' : '다중선택')})</span>
                                            <button type="button" onClick={() => removeQuestion(q.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}>삭제</button>
                                        </div>
                                        <input
                                            type="text" value={q.text} onChange={e => updateQuestionText(q.id, e.target.value)}
                                            className="glass-card" style={{ width: '100%', padding: '0.8rem', border: 'none', marginBottom: '1rem' }}
                                            placeholder="질문 내용을 입력하세요" required
                                        />

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
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-glass)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                <th style={{ padding: '1rem' }}>설문 제목</th>
                                <th style={{ padding: '1rem' }}>마감일</th>
                                <th style={{ padding: '1rem' }}>작성자</th>
                                <th style={{ padding: '1rem' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {surveys.map(s => (
                                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                    <td style={{ padding: '1rem' }}>{s.title}</td>
                                    <td style={{ padding: '1rem' }}>{formatDate(s.endDate)}</td>
                                    <td style={{ padding: '1rem' }}>{s.authorName}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>통계(준비중)</button>
                                            <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '1.2rem', cursor: 'pointer' }}>🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {surveys.length === 0 && <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>발행한 설문이 없습니다.</div>}
                </div>
            )}
        </main>
    );
}
