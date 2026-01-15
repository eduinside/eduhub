"use client";

import { useState, useEffect, use } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, addDoc, updateDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp, increment } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/utils/dateUtils";
import { compressImage } from "@/utils/fileUtils";

export default function SurveyDetailPage(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const { user, loading: authLoading } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const fromTab = searchParams.get('from') || 'inprogress';
    const returnTo = searchParams.get('returnTo');

    const [survey, setSurvey] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [answers, setAnswers] = useState<{ [key: string]: any }>({});
    const [responseId, setResponseId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [orgUploadLimit, setOrgUploadLimit] = useState<string>("3");
    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push(`/?redirect=${encodeURIComponent(pathname)}`);
            return;
        }

        const fetchSurvey = async () => {
            try {
                // 1. 설문 정보 가져오기
                const docRef = doc(db, "surveys", params.id);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    showToast("존재하지 않는 설문입니다.", "error");
                    router.push("/surveys");
                    return;
                }

                const sData = { id: docSnap.id, ...docSnap.data() } as any;

                // Fetch Group Name if applicable
                if (sData.orgId) {
                    try {
                        const groupSnap = await getDoc(doc(db, "groups", sData.orgId));
                        if (groupSnap.exists()) {
                            sData.groupName = groupSnap.data().name;
                        }
                    } catch (gErr) {
                        // Ignore
                    }
                }

                setSurvey(sData);

                // 2. 이미 참여했는지 확인
                try {
                    const q = query(
                        collection(db, "survey_responses"),
                        where("surveyId", "==", params.id),
                        where("userId", "==", user.uid)
                    );
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        const resDoc = querySnapshot.docs[0];
                        setResponseId(resDoc.id);
                        setAnswers(resDoc.data().responses || {});
                        setIsEditMode(true);
                    }
                } catch (resErr) {
                    console.error("Response check skipped:", resErr);
                }
            } catch (err: any) {
                console.error(err);
                showToast(`설문 불러오기 실패: ${err.message}`, "error");
            } finally {
                setLoading(false);
            }
        };

        fetchSurvey();
    }, [params.id, user, authLoading]);

    // Org Limit Effect
    useEffect(() => {
        if (!survey?.orgId) return;
        const unsubOrg = onSnapshot(doc(db, "organizations", survey.orgId), (snap) => {
            if (snap.exists()) {
                setOrgUploadLimit(snap.data().uploadLimit || "3");
            }
        });
        return () => unsubOrg();
    }, [survey?.orgId]);

    const handleAnswerChange = (qId: string, value: any, type: string) => {
        if (type === 'multiple') {
            const current = (answers[qId] as string[]) || [];
            if (current.includes(value)) {
                setAnswers({ ...answers, [qId]: current.filter(v => v !== value) });
            } else {
                setAnswers({ ...answers, [qId]: [...current, value] });
            }
        } else {
            setAnswers({ ...answers, [qId]: value });
        }
    };

    const handleFileUpload = async (qId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!user) return;

        try {
            // Check Capacity
            const orgId = survey.orgId;
            let limitBytes = 3 * 1024 * 1024;
            if (orgId) {
                const orgDoc = await getDoc(doc(db, "organizations", orgId));
                if (orgDoc.exists()) {
                    const l = orgDoc.data().uploadLimit || "3";
                    if (l === 'blocked') {
                        showToast("파일 업로드가 차단된 조직입니다.", "error");
                        return;
                    }
                    limitBytes = parseInt(l) * 1024 * 1024;
                }
            }

            const compressedFile = await compressImage(file);
            if (compressedFile.size > limitBytes) {
                showToast(`용량 초과! (${(limitBytes / 1024 / 1024).toFixed(0)}MB 제한)`, "error");
                return;
            }

            const storageRef = ref(storage, `surveys/responses/${survey.id}/${user.uid}/${Date.now()}_${compressedFile.name}`);
            showToast("파일 업로드 중...", "info");
            const snapshot = await uploadBytes(storageRef, compressedFile);
            const url = await getDownloadURL(snapshot.ref);

            // Update Stats
            if (orgId) {
                await updateDoc(doc(db, "organizations", orgId), {
                    "storageUsage.totalFiles": increment(1),
                    "storageUsage.totalBytes": increment(compressedFile.size)
                });
            }

            setAnswers({ ...answers, [qId]: { type: 'file', name: file.name, url } });
            showToast("파일이 첨부되었습니다.", "success");
        } catch (err) {
            console.error(err);
            showToast("파일 업로드 실패", "error");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const missing = survey.questions.find((q: any) => {
            if (q.type === 'notice') return false;
            const ans = answers[q.id];
            if (!ans) return true;
            if (Array.isArray(ans) && ans.length === 0) return true;
            return false;
        });

        if (missing) {
            showToast("모든 질문에 답변해주세요.", "error");
            return;
        }

        setSubmitting(true);
        try {
            if (responseId) {
                await updateDoc(doc(db, "survey_responses", responseId), {
                    responses: answers,
                    submittedAt: serverTimestamp(),
                    isUpdated: true
                });
                showToast("응답이 수정되었습니다.", "success");
            } else {
                await addDoc(collection(db, "survey_responses"), {
                    surveyId: params.id,
                    userId: user?.uid,
                    userName: user?.displayName || "익명",
                    responses: answers,
                    submittedAt: serverTimestamp()
                });
                showToast("설문에 참여해주셔서 감사합니다!", "success");
            }
            if (returnTo) {
                router.push(returnTo);
            } else {
                router.push("/surveys");
            }
        } catch (err) {
            console.error(err);
            showToast("제출 실패", "error");
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>로딩 중...</div>;
    if (!survey) return null;

    const today = new Date().toISOString().slice(0, 10);
    const isEnded = survey.endDate < today;

    if (isEnded) {
        return (
            <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
                <h2 style={{ marginBottom: '1rem', color: 'var(--text-dim)' }}>🔒 마감된 설문</h2>
                <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>참여 기간이 종료되었습니다.</p>
                {isEditMode && <p style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>회원님은 이미 참여하셨습니다.</p>}
                <button onClick={() => returnTo ? router.push(returnTo) : router.push(`/surveys?tab=${fromTab}`)} className="glass-card" style={{ padding: '0.8rem 2rem' }}>목록으로 돌아가기</button>
            </div>
        );
    }

    return (
        <main style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <header style={{ marginBottom: '3rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <button onClick={() => returnTo ? router.push(returnTo) : router.push(`/surveys?tab=${fromTab}`)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>← 돌아가기</button>
                </div>
                <h1 style={{
                    fontSize: '2.5rem',
                    fontWeight: '800',
                    marginBottom: '1rem',
                    background: 'linear-gradient(45deg, #2563eb, #7c3aed)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                }}>
                    {survey.title}
                </h1>
                <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'var(--accent)', color: 'white' }}>진행중</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>{formatDate(survey.endDate)}까지</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>·</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                        {survey.groupName ? `${survey.groupName}(${survey.authorName})` : (survey.authorName || "알 수 없음")}
                    </span>
                </div>
                <p style={{ color: 'var(--text-dim)', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '1.1rem' }}>{survey.description}</p>
                {isEditMode && (
                    <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
                        <p style={{ fontWeight: 'bold', color: 'var(--primary)' }}>✅ 이미 참여한 설문입니다.</p>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>내용을 수정하고 '수정하기' 버튼을 누르면 응답이 갱신됩니다.</p>
                    </div>
                )}
            </header>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {survey.questions.map((q: any, idx: number) => {
                    if (q.type === 'notice') {
                        return (
                            <div key={q.id} className="glass-panel" style={{ padding: '2rem', borderLeft: '4px solid var(--primary)' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{q.text}</div>
                                {(q.attachments || (q.attachment ? [q.attachment] : [])).map((att: any, attIdx: number) => (
                                    <div key={attIdx} style={{ marginBottom: '1rem', padding: '0.8rem', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '1.2rem' }}>{att.type === 'link' ? '🔗' : '📁'}</span>
                                        {att.type === 'link' ? (
                                            <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline', wordBreak: 'break-all' }}>{att.name || att.url}</a>
                                        ) : (
                                            <a href={att.url} target="_blank" rel="noopener noreferrer" download style={{ color: 'var(--text-main)', textDecoration: 'underline', wordBreak: 'break-all' }}>{att.name || "첨부파일 다운로드"}</a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    }

                    return (
                        <div key={q.id} className="glass-panel" style={{ padding: '2rem' }}>
                            <div style={{ marginBottom: '1rem', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                <span style={{ color: 'var(--primary)', marginRight: '0.5rem' }}>
                                    {q.type === 'file' ? `문항 ${idx + 1} (파일 제출)` : `Q${idx + 1}.`}
                                </span>
                                {q.text}
                                {q.type === 'multiple' && <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginLeft: '0.5rem', fontWeight: 'normal' }}>(중복 선택 가능)</span>}
                            </div>

                            {q.type === 'file' && (
                                <div style={{ padding: '2rem', border: '2px dashed var(--border-glass)', borderRadius: '12px', textAlign: 'center', background: 'rgba(0,0,0,0.02)' }}>
                                    {orgUploadLimit !== 'blocked' ? (
                                        <>
                                            <input type="file" id={`file-${q.id}`} onChange={(e) => handleFileUpload(q.id, e)} style={{ display: 'none' }} />
                                            <label htmlFor={`file-${q.id}`} className="glass-card" style={{ cursor: 'pointer', padding: '0.8rem 2rem', borderRadius: '99px', display: 'inline-block', fontWeight: 'bold', color: 'var(--primary)' }}>
                                                📁 파일 선택
                                            </label>
                                        </>
                                    ) : (
                                        <div style={{ color: '#ff4444', fontSize: '0.9rem' }}>⚠️ 이 조직은 현재 파일 제출 기능이 제한되어 있습니다.</div>
                                    )}
                                    {answers[q.id] && (
                                        <div style={{ marginTop: '1rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                            ✅ {answers[q.id].name}
                                        </div>
                                    )}
                                </div>
                            )}

                            {q.type === 'text' && (
                                <textarea
                                    className="glass-card"
                                    style={{ width: '100%', minHeight: '100px', padding: '1rem' }}
                                    placeholder="답변을 입력해주세요."
                                    value={answers[q.id] || ""}
                                    onChange={e => handleAnswerChange(q.id, e.target.value, 'text')}
                                    required
                                />
                            )}

                            {q.type === 'choice' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    {q.options?.map((opt: string, i: number) => (
                                        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer', padding: '0.5rem', borderRadius: '8px', background: answers[q.id] === opt ? 'var(--bg-elevated)' : 'transparent' }}>
                                            <input
                                                type="radio"
                                                name={q.id}
                                                value={opt}
                                                checked={answers[q.id] === opt}
                                                onChange={() => handleAnswerChange(q.id, opt, 'choice')}
                                                style={{ accentColor: 'var(--primary)', transform: 'scale(1.2)' }}
                                                required
                                            />
                                            <span>{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {q.type === 'multiple' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    {q.options?.map((opt: string, i: number) => (
                                        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer', padding: '0.5rem', borderRadius: '8px', background: (answers[q.id] as string[])?.includes(opt) ? 'var(--bg-elevated)' : 'transparent' }}>
                                            <input
                                                type="checkbox"
                                                value={opt}
                                                checked={(answers[q.id] as string[])?.includes(opt)}
                                                onChange={() => handleAnswerChange(q.id, opt, 'multiple')}
                                                style={{ accentColor: 'var(--primary)', transform: 'scale(1.2)' }}
                                            />
                                            <span>{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                    style={{ padding: '1.2rem', fontSize: '1.1rem', marginTop: '2rem', opacity: submitting ? 0.7 : 1 }}
                >
                    {submitting ? "처리 중..." : (isEditMode ? "수정하기" : "제출하기")}
                </button>
            </form>
        </main>
    );
}
