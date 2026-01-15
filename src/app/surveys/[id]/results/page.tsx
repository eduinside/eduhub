"use client";

import { useState, useEffect, use } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import ImagePreviewModal from "@/components/ImagePreviewModal";

export default function SurveyResultsPage(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const { user, loading: authLoading, isAdmin } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const returnTo = searchParams.get('returnTo');

    const [survey, setSurvey] = useState<any>(null);
    const [responses, setResponses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [userTab, setUserTab] = useState<'responded' | 'unresponded'>('responded');

    // Image Preview State
    const [previewImage, setPreviewImage] = useState<{ url: string, name: string } | null>(null);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push("/surveys");
            return;
        }

        const fetchData = async () => {
            try {
                const docRef = doc(db, "surveys", params.id);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    showToast("설문을 찾을 수 없습니다.", "error");
                    router.push("/surveys");
                    return;
                }

                const sData = { id: docSnap.id, ...docSnap.data() } as any;

                // Only Survey Author can view results
                if (sData.authorUid !== user.uid) {
                    showToast("결과를 볼 권한이 없습니다.", "error");
                    router.push("/surveys");
                    return;
                }

                setSurvey(sData);

                const q = query(collection(db, "survey_responses"), where("surveyId", "==", params.id), orderBy("submittedAt", "desc"));
                const querySnapshot = await getDocs(q);
                const resList = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setResponses(resList);

                if (sData.orgId) {
                    try {
                        // Check if orgId is actually a Group
                        const groupDoc = await getDoc(doc(db, "groups", sData.orgId));

                        if (groupDoc.exists()) {
                            // It is a Group Survey
                            const groupData = groupDoc.data();
                            setSurvey((prev: any) => ({ ...prev, groupName: groupData.name }));
                            const memberIds = groupData.memberIds || [];

                            if (memberIds.length > 0) {
                                // Fetch all members of the group
                                // This might require chunking if > 10, but assuming small groups for now or simple loop
                                // Using loop for stability or 'in' query if < 30 (limit 10 for 'in' usually, but doc per id is safe)
                                const memberPromises = memberIds.map((uid: string) => getDoc(doc(db, "users", uid)));
                                const memberSnaps = await Promise.all(memberPromises);
                                const uList = memberSnaps.map(snap => {
                                    if (!snap.exists()) return null;
                                    const d = snap.data();
                                    const pName = d.profiles?.[groupData.orgId]?.name || d.name || "이름 없음"; // Group's parent Org profile
                                    return { uid: snap.id, ...d, name: pName };
                                }).filter(Boolean);
                                setAllUsers(uList);
                            }
                        } else {
                            // It is an Org Survey (existing logic)
                            const usersQ = query(collection(db, "users"), where("orgIds", "array-contains", sData.orgId));
                            const usersSnap = await getDocs(usersQ);
                            const uList = usersSnap.docs.map(d => {
                                const uData = d.data();
                                const pName = uData.profiles?.[sData.orgId]?.name || uData.name || "이름 없음";
                                return { uid: d.id, ...uData, name: pName };
                            });
                            setAllUsers(uList);
                        }
                    } catch (e) {
                        console.error("Failed to fetch users:", e);
                    }
                }

            } catch (err: any) {
                console.error(err);
                showToast(`데이터 로딩 실패: ${err.message}`, "error");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [params.id, user, authLoading]);

    const handleDownloadExcel = () => {
        if (!responses.length) {
            showToast("다운로드할 응답이 없습니다.", "error");
            return;
        }

        let csvContent = "\uFEFF";
        const headers = ["참여자", "제출일시"];
        survey.questions.forEach((q: any, i: number) => {
            if (q.type !== 'notice') {
                headers.push(`Q${i + 1}. ${q.text.replace(/,/g, " ")}`);
            }
        });
        csvContent += headers.join(",") + "\n";

        responses.forEach((r: any) => {
            const row = [
                r.userName || "익명",
                r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString() : new Date().toLocaleString()
            ];
            survey.questions.forEach((q: any) => {
                if (q.type !== 'notice') {
                    let ans = r.responses[q.id];

                    if (q.type === 'file' && ans) {
                        const files = Array.isArray(ans) ? ans : [ans];
                        ans = files.map((f: any) => f.name).join(" | ");
                    } else if (Array.isArray(ans)) {
                        ans = ans.join(" | ");
                    }

                    if (!ans) ans = "";
                    const ansStr = String(ans).replace(/"/g, '""');
                    row.push(`"${ansStr}"`);
                }
            });
            csvContent += row.join(",") + "\n";
        });

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${survey.title}_결과.csv`;
        link.click();
    };

    const handleDownloadZip = async () => {
        const fileQuestions = survey.questions.filter((q: any) => q.type === 'file');
        if (fileQuestions.length === 0) {
            showToast("파일 제출 문항이 없습니다.", "info");
            return;
        }

        const totalToDownload = fileQuestions.reduce((acc: number, q: any) => {
            return acc + responses.reduce((rAcc: number, r: any) => {
                const ans = r.responses[q.id];
                if (ans) {
                    const files = Array.isArray(ans) ? ans : (ans.url ? [ans] : []);
                    return rAcc + files.filter((f: any) => f.url).length;
                }
                return rAcc;
            }, 0);
        }, 0);

        if (totalToDownload === 0) {
            showToast("다운로드할 파일이 없습니다.", "info");
            return;
        }

        showToast(`총 ${totalToDownload}개의 파일을 압축 중입니다...`, "info");

        const zip = new JSZip();
        const rootFolderName = survey.title.replace(/[\/\*\\\:\?\"\<\>\|]/g, "_");
        const folder = zip.folder(rootFolderName) || zip;

        let downloadedCount = 0;
        let failedCount = 0;
        const promises: Promise<void>[] = [];

        for (const q of fileQuestions) {
            const qIndex = survey.questions.indexOf(q);
            const qFolderName = `Q${qIndex + 1}_${q.text.replace(/[\/\*\\\:\?\"\<\>\|]/g, "_").slice(0, 15)}`;
            const qFolder = folder.folder(qFolderName) || folder;

            for (const r of responses) {
                const ans = r.responses[q.id];
                if (ans) {
                    const files = Array.isArray(ans) ? ans : (ans.url ? [ans] : []);
                    for (const file of files) {
                        if (file.url) {
                            const p = (async () => {
                                try {
                                    // CORS 이슈를 대비해 fetch 시도
                                    const response = await fetch(file.url, { method: 'GET' });
                                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                                    const blob = await response.blob();
                                    const safeUserName = (r.userName || "익명").replace(/[\/\*\\\:\?\"\<\>\|]/g, "_");
                                    const safeFileName = file.name.replace(/[\/\*\\\:\?\"\<\>\|]/g, "_");
                                    const fileName = `${safeUserName}_${safeFileName}`;

                                    qFolder.file(fileName, blob);
                                    downloadedCount++;
                                } catch (e) {
                                    console.error(`Failed to download ${file.name}:`, e);
                                    failedCount++;
                                }
                            })();
                            promises.push(p);
                        }
                    }
                }
            }
        }

        await Promise.all(promises);

        if (downloadedCount === 0) {
            showToast("파일을 가져오는 데 실패했습니다. CORS 정책이나 네트워크 상태를 확인해 주세요.", "error");
            return;
        }

        if (failedCount > 0) {
            showToast(`${failedCount}개의 파일 다운로드에 실패했지만, 나머지 ${downloadedCount}개를 압축합니다.`, "info");
        }

        try {
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `${rootFolderName}_첨부파일.zip`);
            showToast("압축 파일 다운로드가 시작되었습니다.", "success");
        } catch (err) {
            console.error("ZIP Generation error:", err);
            showToast("압축 파일 생성 중 오류가 발생했습니다.", "error");
        }
    };

    if (loading || authLoading) return <div style={{ padding: '4rem', textAlign: 'center' }}>로딩 중...</div>;
    if (!survey) return null;

    // 통계 계산
    const stats = survey.questions.map((q: any) => {
        if (q.type === 'notice') return null; // Skip notice

        if (q.type === 'text' || q.type === 'file') {
            const rawAnswers = responses.map(r => r.responses[q.id]).filter(Boolean);
            let answers = rawAnswers;
            if (q.type === 'file') {
                answers = rawAnswers.flatMap(ans => Array.isArray(ans) ? ans : [ans]);
            }
            return { ...q, type: q.type, answers };
        } else {
            const counts: { [key: string]: number } = {};
            (q.options || []).forEach((opt: string) => counts[opt] = 0);

            responses.forEach(r => {
                const ans = r.responses[q.id];
                if (Array.isArray(ans)) {
                    ans.forEach(a => { if (counts[a] !== undefined) counts[a]++ });
                } else if (ans && counts[ans] !== undefined) {
                    counts[ans]++;
                }
            });
            return { ...q, counts, total: responses.length };
        }
    }).filter(Boolean);

    // 응답자 분석
    const respondedUserIds = responses.map(r => r.userId).filter(Boolean);
    const respondedUsersList = allUsers.filter(u => respondedUserIds.includes(u.uid));
    const unrespondedUsersList = allUsers.filter(u => !respondedUserIds.includes(u.uid));
    const participationRate = allUsers.length > 0 ? Math.round((respondedUsersList.length / allUsers.length) * 100) : 0;

    // 파일 질문 존재 여부 확인
    const hasFileQuestion = survey.questions.some((q: any) => q.type === 'file');

    return (
        <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) 300px', gap: '2rem' }}>
            <div className="left-column">
                <header style={{ marginBottom: '3rem' }}>
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button onClick={() => returnTo ? router.push(returnTo) : router.back()} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>← 돌아가기</button>
                    </div>
                    <h1 style={{
                        fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem',
                        background: 'linear-gradient(45deg, #2563eb, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                    }}>{survey.title}</h1>
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        {survey.groupName ? (
                            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(121, 80, 242, 0.15)', color: '#7950f2', border: '1px solid rgba(121, 80, 242, 0.3)' }}>그룹</span>
                        ) : (
                            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>조직</span>
                        )}
                        <span>·</span>
                        <span>{survey.endDate}까지</span>
                        <span>·</span>
                        <span>{survey.groupName ? `${survey.groupName}(${survey.authorName})` : (survey.authorName || "알 수 없음")}</span>
                    </div>
                    <div style={{ color: 'var(--text-dim)' }}>
                        총 {responses.length}명 응답 완료
                    </div>
                </header>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {stats.map((stat: any, idx: number) => (
                        <div key={idx} className="glass-panel" style={{ padding: '2rem' }}>
                            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                                <span style={{ color: 'var(--primary)', marginRight: '0.5rem' }}>Q{idx + 1}.</span>
                                {stat.text}
                            </h3>

                            {stat.type === 'text' ? (
                                <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                                    {stat.answers.length > 0 ? (
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            {stat.answers.map((ans: string, i: number) => (
                                                <li key={i} style={{ paddingBottom: '0.8rem', borderBottom: '1px solid var(--border-glass)' }}>{ans}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>답변이 없습니다.</p>
                                    )}
                                </div>
                            ) : stat.type === 'file' ? (
                                <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                                    <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>총 {stat.answers.length}개의 파일이 제출되었습니다.</p>
                                    {stat.answers.length > 0 ? (
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {stat.answers.map((ans: any, i: number) => (
                                                <li key={i} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                                        📁 {ans.name}
                                                    </span>
                                                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                                                        {/\.(jpg|jpeg|png|webp|heic)$/i.test(ans.name || "") ? (
                                                            <button
                                                                onClick={() => setPreviewImage({ url: ans.url, name: ans.name })}
                                                                className="btn-primary"
                                                                style={{
                                                                    padding: '0.3rem 0.8rem',
                                                                    fontSize: '0.75rem',
                                                                    borderRadius: '8px',
                                                                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                                                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.2)'
                                                                }}
                                                            >
                                                                🖼️ 미리보기
                                                            </button>
                                                        ) : (
                                                            <a
                                                                href={ans.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="glass-card"
                                                                style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem', color: 'var(--text-main)', textDecoration: 'none' }}
                                                            >
                                                                🔗 보기
                                                            </a>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>제출된 파일이 없습니다.</p>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        {Object.entries(stat.counts).map(([opt, count]: [string, any], i) => {
                                            const percentage = stat.total > 0 ? Math.round((count / stat.total) * 100) : 0;
                                            return (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                                                            <span>{opt}</span>
                                                            <span style={{ fontWeight: 'bold' }}>{count}명 ({percentage}%)</span>
                                                        </div>
                                                        <div style={{ background: 'rgba(0,0,0,0.05)', borderRadius: '4px', height: '10px', overflow: 'hidden' }}>
                                                            <div style={{ width: `${percentage}%`, background: 'var(--primary)', height: '100%', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <aside>
                <div className="glass-panel" style={{ padding: '1.5rem', position: 'sticky', top: '5rem' }}>
                    {(survey.authorUid === user?.uid || isAdmin) && (
                        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <button onClick={handleDownloadExcel} className="glass-card" style={{ padding: '0.8rem', width: '100%', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: '600' }}>
                                📊 결과 엑셀로 저장
                            </button>
                            {hasFileQuestion && (
                                <button onClick={handleDownloadZip} className="glass-card" style={{ padding: '0.8rem', width: '100%', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: '600' }}>
                                    📦 첨부파일 다운로드 (ZIP)
                                </button>
                            )}
                        </div>
                    )}

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>응답 현황</h3>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                            <span>참여율</span>
                            <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{participationRate}%</span>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.05)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                            <div style={{ width: `${participationRate}%`, background: 'var(--primary)', height: '100%', borderRadius: '4px' }}></div>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.5rem', textAlign: 'right' }}>
                            총 {allUsers.length}명 중 {respondedUsersList.length}명 응답
                        </p>
                    </div>

                    <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '0.2rem', marginBottom: '1rem' }}>
                        <button
                            onClick={() => setUserTab('responded')}
                            style={{
                                flex: 1, padding: '0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                                background: userTab === 'responded' ? 'white' : 'transparent',
                                color: userTab === 'responded' ? 'black' : 'var(--text-dim)',
                                boxShadow: userTab === 'responded' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none',
                                fontWeight: userTab === 'responded' ? 'bold' : 'normal'
                            }}
                        >
                            응답 ({respondedUsersList.length})
                        </button>
                        <button
                            onClick={() => setUserTab('unresponded')}
                            style={{
                                flex: 1, padding: '0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                                background: userTab === 'unresponded' ? 'white' : 'transparent',
                                color: userTab === 'unresponded' ? 'black' : 'var(--text-dim)',
                                boxShadow: userTab === 'unresponded' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none',
                                fontWeight: userTab === 'unresponded' ? 'bold' : 'normal'
                            }}
                        >
                            미응답 ({unrespondedUsersList.length})
                        </button>
                    </div>

                    <div style={{ overflowY: 'auto', maxHeight: '500px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(userTab === 'unresponded' ? unrespondedUsersList : respondedUsersList).map((u: any, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.02)' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                                    {u.name?.charAt(0) || "익"}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{u.name || "알 수 없음"}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{u.email}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            {/* Image Preview Modal */}
            <ImagePreviewModal
                isOpen={!!previewImage}
                onClose={() => setPreviewImage(null)}
                imageUrl={previewImage?.url || ""}
                fileName={previewImage?.name}
            />
        </main>
    );
}
