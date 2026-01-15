"use client";

import { useState, useEffect, use } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, storage } from "@/lib/firebase";
import {
    collection, onSnapshot, query, where, orderBy, addDoc, serverTimestamp,
    deleteDoc, doc, updateDoc, getDoc, arrayUnion, getDocs, increment
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, listAll, getMetadata } from "firebase/storage";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import { useRouter, usePathname } from "next/navigation";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { formatDate } from "@/utils/dateUtils";
import { compressImage } from "@/utils/fileUtils";

// --- Interfaces ---

interface Notice {
    id: string;
    title: string;
    content: string;
    authorName: string;
    authorUid: string;
    authorRole: string;
    createdAt: any;
    startDate: string;
    endDate: string;
    orgId: string;
    attachments?: any[];
}

// 설문 관련 인터페이스
type SurveyType = 'link' | 'file' | 'question';
interface SurveyQuestion {
    id: string;
    text: string;
    type: 'radio' | 'text';
    options?: string[]; // 객관식 보기
}
interface Survey {
    id: string;
    orgId: string;
    title: string;
    description: string;
    creatorUid: string;
    creatorName: string;
    endDate: string;
    types: SurveyType[];
    linkUrl?: string;
    questions?: SurveyQuestion[];
    attachmentUrls?: { name: string, url: string }[]; // 설명용 첨부파일
    createdAt: any;
}
interface SurveyResponse {
    id: string; // doc id
    surveyId: string;
    userId: string;
    userName: string;
    answers: { [qId: string]: string }; // questionId: answer
    attachedFiles?: { name: string, url: string }[]; // 사용자가 제출한 파일
    submittedAt: any;
}

// 예약 Interface (간단 보기용)
interface SimpleReservation {
    id: string;
    resourceName: string;
    userName: string;
    startTime: string;
    endTime: string;
}

export default function NoticesPage({ params }: { params: Promise<{ date: string }> }) {
    const { user, orgId, isAdmin, isSuperAdmin, activeProfile, loading: authLoading } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();
    const pathname = usePathname();

    const unwrappedParams = use(params);

    // --- Date Parsing ---
    const getInitialDate = () => {
        const dateParam = unwrappedParams.date;
        if (dateParam && /^\d{8}$/.test(dateParam)) {
            const year = dateParam.slice(0, 4);
            const month = dateParam.slice(4, 6);
            const day = dateParam.slice(6, 8);
            return `${year}-${month}-${day}`;
        }
        return new Date().toISOString().slice(0, 10);
    };
    const [selectedDate, setSelectedDate] = useState(getInitialDate());

    // --- Data States ---
    const [notices, setNotices] = useState<Notice[]>([]);
    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [myResponses, setMyResponses] = useState<string[]>([]); // surveyIds that I responded to
    const [todayReservations, setTodayReservations] = useState<SimpleReservation[]>([]);
    const [readNoticeIds, setReadNoticeIds] = useState<string[]>([]);

    // --- Modal States ---
    const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
    const [editingNotice, setEditingNotice] = useState<Notice | null>(null);

    const [isSurveyCreateModalOpen, setIsSurveyCreateModalOpen] = useState(false);
    const [isSurveyParticipateModalOpen, setIsSurveyParticipateModalOpen] = useState(false);
    const [isSurveyResultModalOpen, setIsSurveyResultModalOpen] = useState(false);

    const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);

    // Image Preview State
    const [previewImage, setPreviewImage] = useState<{ url: string, name: string } | null>(null);

    // --- Forms & Inputs ---

    // Notice Form
    const [nTitle, setNTitle] = useState("");
    const [nContent, setNContent] = useState("");
    const [nStartDate, setNStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [nEndDate, setNEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [nFiles, setNFiles] = useState<File[]>([]);

    // Survey Create Form
    const [sTitle, setSTitle] = useState("");
    const [sDesc, setSDesc] = useState("");
    const [sEndDate, setSEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [sTypes, setSTypes] = useState<SurveyType[]>([]);
    const [sLink, setSLink] = useState("");
    const [sFiles, setSFiles] = useState<File[]>([]); // 설명용
    const [sQuestions, setSQuestions] = useState<SurveyQuestion[]>([]);
    const [newQText, setNewQText] = useState("");
    const [newQType, setNewQType] = useState<'radio' | 'text'>('text');
    const [newQOptions, setNewQOptions] = useState(""); // 쉼표로 구분

    // Survey Participate Form
    const [myAnswers, setMyAnswers] = useState<{ [key: string]: string }>({});
    const [mySubmitFiles, setMySubmitFiles] = useState<File[]>([]);

    // Survey Result View
    const [currentResponses, setCurrentResponses] = useState<SurveyResponse[]>([]);

    // Loading & Config
    const [isUploading, setIsUploading] = useState(false);
    const [fileLimit, setFileLimit] = useState<number | 'disabled'>(3);
    const [orgUploadLimit, setOrgUploadLimit] = useState<string>("3");
    const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);

    // --- Effects ---

    // --- Integration States ---
    const [allFetchedNotices, setAllFetchedNotices] = useState<Notice[]>([]);
    const [myGroupMap, setMyGroupMap] = useState<{ [id: string]: string }>({});

    // --- Effects ---

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push(`/?redirect=${encodeURIComponent(pathname)}`);
            return;
        }
        if (!orgId) return;

        // 1. Fetch Groups (Integrated Feed)
        const qGroups = query(collection(db, "groups"), where("memberIds", "array-contains", user.uid));
        const unsubGroups = onSnapshot(qGroups, (snap) => {
            const groupIds = snap.docs.map(d => d.id);
            const groupMap: any = {};
            snap.docs.forEach(d => groupMap[d.id] = d.data().name);
            setMyGroupMap(groupMap);
        });

        // 2. Fetch All Notices (For sorting and filtering client-side)
        const qNotice = query(collection(db, "notices"), orderBy("startDate", "desc"));
        const unsubNotice = onSnapshot(qNotice, (snapshot) => {
            const allNotices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Notice[];
            setAllFetchedNotices(allNotices);
        });

        // 3. Surveys
        // 3. Surveys (Fetch active ones for valid Org or Groups)
        const todayStr = new Date().toISOString().slice(0, 10);
        // Note: Fetching all active surveys might be heavy in production, but suitable here.
        // Optimally we'd use 'in' query if groups are few, or composite index.
        const qSurvey = query(collection(db, "surveys"), where("endDate", ">=", todayStr), orderBy("endDate", "asc"));
        const unsubSurvey = onSnapshot(qSurvey, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Survey[];
            setSurveys(list);
        });

        // 4. My Responses
        const qResponse = query(collection(db, "survey_responses"), where("userId", "==", user.uid));
        const unsubResponse = onSnapshot(qResponse, (snapshot) => {
            const list = snapshot.docs.map(doc => doc.data().surveyId);
            setMyResponses(list);
        });

        // 5. Reservations (Today)
        const qResv = query(collection(db, "reservations"), where("orgId", "==", orgId), where("date", "==", selectedDate));
        const unsubResv = onSnapshot(qResv, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                id: doc.id,
                resourceName: doc.data().resourceName,
                userName: doc.data().userName,
                startTime: doc.data().startTime,
                endTime: doc.data().endTime
            })) as SimpleReservation[];
            list.sort((a, b) => a.startTime.localeCompare(b.startTime));
            setTodayReservations(list);
        });

        const userRef = doc(db, "users", user.uid);
        const unsubUser = onSnapshot(userRef, (snap) => {
            if (snap.exists()) setReadNoticeIds(snap.data().readNoticeIds || []);
        });

        // 7. Get Org Upload Limit
        const unsubOrg = onSnapshot(doc(db, "organizations", orgId), (snap) => {
            if (snap.exists()) {
                setOrgUploadLimit(snap.data().uploadLimit || "3");
            }
        });

        return () => { unsubGroups(); unsubNotice(); unsubSurvey(); unsubResponse(); unsubResv(); unsubUser(); unsubOrg(); };
    }, [orgId, selectedDate, user, authLoading, pathname, router]);

    // Filter & Sort Notices
    useEffect(() => {
        const filtered = allFetchedNotices.filter(n => {
            const isOrgMatch = n.orgId === orgId || n.orgId === "all";
            const isGroupMatch = !!myGroupMap[n.orgId];
            const isDateMatch = selectedDate >= n.startDate && selectedDate <= n.endDate;
            return (isOrgMatch || isGroupMatch) && isDateMatch;
        });
        const sorted = filtered.sort((a, b) => {
            const getWeight = (n: Notice) => {
                if (n.orgId === orgId) return 0;
                if (myGroupMap[n.orgId]) return 1;
                if (n.orgId === "all") return 2;
                return 3;
            };
            const wA = getWeight(a);
            const wB = getWeight(b);
            if (wA !== wB) return wA - wB;
            return b.startDate.localeCompare(a.startDate); // Latest first within category
        });
        setNotices(sorted);
    }, [allFetchedNotices, myGroupMap, orgId, selectedDate]);

    useEffect(() => {
        const dateParam = unwrappedParams.date;
        if (dateParam && /^\d{8}$/.test(dateParam)) {
            const year = dateParam.slice(0, 4);
            const month = dateParam.slice(4, 6);
            const day = dateParam.slice(6, 8);
            const dateStr = `${year}-${month}-${day}`;
            setSelectedDate(dateStr);

            // Set dynamic title with formatted date
            const dateObj = new Date(dateStr);
            document.title = `공지사항 (${formatDate(dateObj)}) - EduHub`;
        }
    }, [unwrappedParams.date]);


    // --- Helpers ---
    const formatDateForUrl = (dStr: string) => dStr.replace(/-/g, '');
    const changeDate = (days: number) => {
        const current = new Date(selectedDate);
        current.setDate(current.getDate() + days);
        router.push(`/notice/${formatDateForUrl(current.toISOString().slice(0, 10))}`);
    };
    const markAsRead = async (nid: string) => {
        if (!user || readNoticeIds.includes(nid)) return;
        try { await updateDoc(doc(db, "users", user.uid), { readNoticeIds: arrayUnion(nid) }); } catch (e) { }
    };

    // --- Notice Actions ---
    const handleNoticeSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !orgId) return;
        setIsUploading(true);
        try {
            const attachments = editingNotice ? [...(editingNotice.attachments || [])] : [];
            if (orgId && orgId !== 'all') {
                // Check limit
                const orgDoc = await getDoc(doc(db, "organizations", orgId));
                if (orgDoc.exists()) {
                    const orgData = orgDoc.data();
                    const limit = orgData.uploadLimit || "3";
                    if (limit === 'blocked') {
                        showToast("이 조직은 파일 업로드가 차단되었습니다.", "error");
                        setIsUploading(false);
                        return;
                    }
                    const limitBytes = parseInt(limit) * 1024 * 1024;

                    for (let file of nFiles) {
                        file = await compressImage(file);
                        if (file.size > limitBytes) {
                            throw new Error(`${file.name} 용량 초과 (${limit}MB 제한)`);
                        }
                        const storageRef = ref(storage, `notices/${orgId}/${Date.now()}_${file.name}`);
                        await uploadBytes(storageRef, file);
                        const url = await getDownloadURL(storageRef);
                        attachments.push({ name: file.name, url, size: file.size });

                    }

                    // Update Storage Usage (Atomic increment)
                    // We calculate newly uploaded files size only
                    const addedSize = attachments.slice(attachments.length - nFiles.length).reduce((sum: number, a: any) => sum + (a.size || 0), 0);

                    if (addedSize > 0) {
                        await updateDoc(doc(db, "organizations", orgId), {
                            "storageUsage.totalFiles": increment(nFiles.length),
                            "storageUsage.totalBytes": increment(addedSize)
                        });
                    }
                }
            } else {
                // Global fallback (if any)
                for (let file of nFiles) {
                    file = await compressImage(file);
                    const storageRef = ref(storage, `notices/global/${Date.now()}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    attachments.push({ name: file.name, url, size: file.size });
                }
            }
            const noticeOrgId = editingNotice?.orgId || orgId;
            const data = { title: nTitle, content: nContent, startDate: nStartDate, endDate: nEndDate, attachments, orgId: noticeOrgId, updatedAt: serverTimestamp() };
            if (editingNotice) {
                await updateDoc(doc(db, "notices", editingNotice.id), data);
                showToast("수정되었습니다.", "success");
            } else {
                await addDoc(collection(db, "notices"), {
                    ...data,
                    authorName: activeProfile?.name || user.displayName || "익명",
                    authorUid: user.uid,
                    authorRole: isSuperAdmin ? 'superadmin' : (isAdmin ? 'admin' : 'user'),
                    createdAt: serverTimestamp()
                });
                showToast("등록되었습니다.", "success");
            }
            setIsNoticeModalOpen(false);
        } catch (e: any) {
            console.error(e);
            showToast(e.message || "오류 발생", "error");
        } finally { setIsUploading(false); }
    };

    const handleNoticeDelete = async (id: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, "notices", id));
        showToast("삭제되었습니다.", "info");
    };

    // --- Survey Actions ---
    const handleAddQuestion = () => {
        if (!newQText.trim()) return;
        const newQ: SurveyQuestion = {
            id: Date.now().toString(),
            text: newQText,
            type: newQType,
            options: newQType === 'radio' ? newQOptions.split(',').map(s => s.trim()).filter(s => s) : undefined
        };
        setSQuestions([...sQuestions, newQ]);
        setNewQText(""); setNewQOptions("");
    };

    const handleSurveyCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !orgId) return;
        if (sTypes.length === 0) { showToast("최소 하나의 설문 유형을 선택해주세요.", "error"); return; }

        setIsUploading(true);
        try {
            const attachmentUrls = [];
            if (sTypes.includes('file') && fileLimit !== 'disabled') {
                for (const file of sFiles) {
                    if (typeof fileLimit === 'number' && file.size > fileLimit * 1024 * 1024) throw new Error("파일 용량 초과");
                    const storageRef = ref(storage, `surveys/${orgId}/${Date.now()}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    attachmentUrls.push({ name: file.name, url });
                }
            }

            await addDoc(collection(db, "surveys"), {
                orgId,
                title: sTitle,
                description: sDesc,
                creatorUid: user.uid,
                creatorName: activeProfile?.name || user.displayName || "익명",
                endDate: sEndDate,
                types: sTypes,
                linkUrl: sTypes.includes('link') ? sLink : null,
                questions: sTypes.includes('question') ? sQuestions : [],
                attachmentUrls,
                createdAt: serverTimestamp()
            });
            showToast("설문이 생성되었습니다.", "success");
            setIsSurveyCreateModalOpen(false);
            setSTitle(""); setSDesc(""); setSTypes([]); setSQuestions([]); setSFiles([]);
        } catch (e: any) {
            showToast(e.message || "오류 발생", "error");
        } finally { setIsUploading(false); }
    };

    const handleSurveyParticipate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !selectedSurvey) return;

        setIsUploading(true);
        try {
            const attachedFiles = [];
            // 사용자 제출 파일 업로드
            if (fileLimit !== 'disabled') {
                for (const file of mySubmitFiles) {
                    if (typeof fileLimit === 'number' && file.size > fileLimit * 1024 * 1024) throw new Error("용량 초과");
                    const storageRef = ref(storage, `survey_responses/${selectedSurvey.id}/${user.uid}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    attachedFiles.push({ name: file.name, url });
                }
            }

            await addDoc(collection(db, "survey_responses"), {
                surveyId: selectedSurvey.id,
                userId: user.uid,
                userName: activeProfile?.name || user.displayName || "참여자",
                answers: myAnswers,
                attachedFiles,
                submittedAt: serverTimestamp()
            });
            showToast("참여가 완료되었습니다.", "success");
            setIsSurveyParticipateModalOpen(false);
            setMyAnswers({}); setMySubmitFiles([]);
        } catch (e: any) {
            showToast(e.message || "오류 발생", "error");
        } finally { setIsUploading(false); }
    };

    const openResultModal = async (survey: Survey) => {
        setSelectedSurvey(survey);
        // Load responses
        const q = query(collection(db, "survey_responses"), where("surveyId", "==", survey.id));
        const snap = await getDocs(q);
        const resList = snap.docs.map(d => ({ id: d.id, ...d.data() })) as SurveyResponse[];
        setCurrentResponses(resList);
        setIsSurveyResultModalOpen(true);
    };

    const downloadExcel = () => {
        if (!selectedSurvey) return;
        const data = currentResponses.map(r => {
            const row: any = { 이름: r.userName, 제출일: r.submittedAt?.toDate?.().toLocaleString() };
            if (selectedSurvey.questions) {
                selectedSurvey.questions.forEach(q => row[q.text] = r.answers[q.id]);
            }
            if (r.attachedFiles?.length) {
                row['첨부파일'] = r.attachedFiles.map(f => f.name).join(', ');
            }
            return row;
        });
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "응답결과");
        XLSX.writeFile(wb, `${selectedSurvey.title}_결과.xlsx`);
    };

    const downloadFilesZip = async () => {
        if (!selectedSurvey) return;
        const zip = new JSZip();
        let count = 0;

        for (const res of currentResponses) {
            if (res.attachedFiles) {
                for (const file of res.attachedFiles) {
                    try {
                        const response = await fetch(file.url);
                        const blob = await response.blob();
                        zip.file(`${res.userName}_${file.name}`, blob);
                        count++;
                    } catch (e) { console.error(e); }
                }
            }
        }
        if (count === 0) { showToast("다운로드할 파일이 없습니다.", "info"); return; }

        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `${selectedSurvey.title}_첨부파일.zip`);
    };


    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📢 공지사항</h1>
                    <p style={{ color: 'var(--text-dim)' }}>구성원들과 소식을 공유하고 설문에 참여합니다.</p>
                </div>
            </header>

            <div className="layout-container" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>

                {/* Main Content: 공지사항 목록 */}
                <div style={{ flex: '1', minWidth: '600px' }}>
                    <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <button onClick={() => changeDate(-1)} className="glass-card" style={{ padding: '0.5rem 1rem' }}>&lt;</button>
                            <input type="date" value={selectedDate} onChange={e => router.push(`/notice/${formatDateForUrl(e.target.value)}`)} className="glass-card" style={{ padding: '0.5rem', border: 'none', color: 'white', background: 'transparent' }} />
                            <button onClick={() => changeDate(1)} className="glass-card" style={{ padding: '0.5rem 1rem' }}>&gt;</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {notices.length > 0 ? notices.map(n => {
                                const isRead = readNoticeIds.includes(n.id);
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const isExpired = todayStr > n.endDate;
                                const isFuture = todayStr < n.startDate;
                                const isNow = todayStr >= n.startDate && todayStr <= n.endDate;

                                const isOrg = n.orgId === orgId;
                                const isGroup = !!myGroupMap[n.orgId];
                                const isAll = n.orgId === 'all';

                                // Color definitions
                                const orgColor = 'hsl(210, 80%, 55%)';
                                const groupColor = '#7950f2';
                                const allColor = 'hsl(45, 90%, 50%)';

                                const themeColor = isOrg ? orgColor : (isGroup ? groupColor : allColor);

                                return (
                                    <div key={n.id} className="glass-card animate-fade" style={{
                                        padding: '1.5rem',
                                        opacity: isExpired ? 0.6 : 1,
                                        borderLeft: `3px solid ${themeColor}`,
                                        position: 'relative'
                                    }} onClick={() => markAsRead(n.id)}>
                                        {/* 읽음 표시 - 우측 상단 */}
                                        {isRead && (
                                            <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-surface)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>읽음</span>
                                            </div>
                                        )}

                                        {/* 상단: 상태 태그 + 제목 */}
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                                                <span style={{
                                                    fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
                                                    background: isAll ? allColor : (isGroup ? groupColor : orgColor),
                                                    color: 'white',
                                                    fontWeight: '700',
                                                    display: 'flex', alignItems: 'center', gap: '0.3rem'
                                                }}>
                                                    {isAll ? (
                                                        <>🌐 전체</>
                                                    ) : isGroup ? (
                                                        <>👥 그룹</>
                                                    ) : (
                                                        <>🏛️ 조직</>
                                                    )}
                                                </span>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0, color: 'var(--text-main)', textDecoration: 'none' }}>{n.title}</h3>
                                            </div>
                                        </div>

                                        {/* 본문 */}
                                        <div className="markdown-full" style={{ color: 'var(--text-main)', lineHeight: '1.7', marginBottom: '1rem' }}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.content}</ReactMarkdown>
                                        </div>

                                        {/* 첨부파일 */}
                                        {n.attachments && n.attachments.length > 0 && (
                                            <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {n.attachments.map((file, i) => {
                                                    const isImage = /\.(jpg|jpeg|png|webp|heic)$/i.test(file.name);
                                                    if (isImage) {
                                                        return (
                                                            <button
                                                                key={i}
                                                                onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: file.url, name: file.name }); }}
                                                                className="glass-card"
                                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--primary)', border: '1px solid var(--primary)', cursor: 'pointer' }}
                                                            >
                                                                🖼️ {file.name} (미리보기)
                                                            </button>
                                                        );
                                                    }
                                                    return (
                                                        <a key={i} href={file.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="glass-card" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', textDecoration: 'none', color: 'var(--primary)' }}>
                                                            📎 {file.name}
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* 하단: 작성자, 게시일자, 수정/삭제 버튼 */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.8rem', borderTop: '1px solid var(--border-glass)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem' }}>
                                                <span>👤 {n.authorName}</span>
                                                <span>📅 {formatDate(n.startDate)} ~ {formatDate(n.endDate)}</span>
                                            </div>
                                            {n.authorUid === user?.uid && (
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingNotice(n); setNTitle(n.title); setNContent(n.content); setIsNoticeModalOpen(true); }} className="glass-card" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}>수정</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleNoticeDelete(n.id); }} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '1.1rem', cursor: 'pointer' }}>🗑️</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>등록된 공지가 없습니다.</div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Sidebar */}
                <aside className="sidebar" style={{ width: '30%', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* Action Buttons */}
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingNotice(null); setNTitle(""); setNContent(""); setIsNoticeModalOpen(true); }} className="btn-primary" style={{ padding: '1rem', width: '100%' }}>📢 공지사항 추가하기</button>
                    </div>

                    {/* Unanswered Surveys */}
                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>⏳ 참여 필요한 설문</h3>
                            <button onClick={() => router.push('/surveys')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem', opacity: 0.7 }} title="전체보기">➡️</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {(() => {
                                const pending = surveys.filter(s => {
                                    // Must be relevant (Org or Group)
                                    const isRelevant = s.orgId === orgId || !!myGroupMap[s.orgId];
                                    // Must not be responded
                                    const notResponded = !myResponses.includes(s.id);
                                    // Must be active (already filtered by query, but double check)
                                    const isActive = s.endDate >= selectedDate; // Using selectedDate as view date reference? Or today?
                                    // Usually "To Do" implies Today.
                                    const isTodayActive = s.endDate >= new Date().toISOString().slice(0, 10);

                                    return isRelevant && notResponded && isTodayActive;
                                });

                                if (pending.length === 0) {
                                    return <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>모든 설문에 참여했습니다!</div>;
                                }

                                return pending.map(s => {
                                    const isGroup = !!myGroupMap[s.orgId];
                                    const badge = isGroup ? "👥" : "🏛️";

                                    const todayStr = new Date().toISOString().slice(0, 10);
                                    const diffTime = new Date(s.endDate).getTime() - new Date(todayStr).getTime();
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                    const dDayStr = diffDays === 0 ? "오늘 마감" : `${diffDays}일 남음`;

                                    return (
                                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-glass)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', flex: 1 }}>
                                                <span title={isGroup ? myGroupMap[s.orgId] : "조직 전체"} style={{ fontSize: '0.8rem', cursor: 'help' }}>{badge}</span>
                                                <span style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-main)', flex: 1 }} title={s.title}>
                                                    {s.title} <span style={{ fontSize: '0.8rem', color: diffDays === 0 ? '#ff4444' : 'var(--primary)', fontWeight: 'bold' }}>({dDayStr})</span>
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => { setSelectedSurvey(s); setIsSurveyParticipateModalOpen(true); }}
                                                className="btn-primary"
                                                style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', flexShrink: 0, marginLeft: '0.5rem' }}
                                            >
                                                참여
                                            </button>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                        {/* 내가 만든 설문 관리 링크 (간단하게) */}
                        {surveys.some(s => s.creatorUid === user?.uid) && (
                            <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-glass)' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>📤 내가 만든 설문 (결과 보기)</div>
                                {surveys.filter(s => s.creatorUid === user?.uid).map(s => (
                                    <div key={s.id} onClick={() => openResultModal(s)} style={{ cursor: 'pointer', fontSize: '0.9rem', marginBottom: '0.2rem', color: 'var(--primary)' }}>• {s.title}</div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Today Reservations */}
                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>📅 오늘의 예약</h3>
                            <button onClick={() => router.push('/reservations')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem', opacity: 0.7 }} title="전체보기">➡️</button>
                        </div>
                        {todayReservations.length > 0 ? (
                            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {todayReservations.map((r, i) => (
                                        <tr key={r.id}>
                                            <td style={{ padding: '0.3rem', color: 'var(--text-dim)' }}>{r.startTime}~{r.endTime}</td>
                                            <td style={{ padding: '0.3rem', fontWeight: 'bold' }}>{r.resourceName}</td>
                                            <td style={{ padding: '0.3rem', textAlign: 'right' }}>{r.userName}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>오늘 예약된 자원이 없습니다.</div>}
                    </div>

                </aside>
            </div>

            {/* Image Preview Modal */}
            <ImagePreviewModal
                isOpen={!!previewImage}
                onClose={() => setPreviewImage(null)}
                imageUrl={previewImage?.url || ""}
                fileName={previewImage?.name}
            />

            <style jsx>{`
                @media (max-width: 1000px) {
                    .sidebar { display: none !important; }
                    .layout-container { flex-direction: column; }
                }
            `}</style>

            {/* Modal Components */}
            {/* 1. Notice Create/Edit */}
            {isNoticeModalOpen && (
                <div className="modal-overlay" onClick={() => setIsNoticeModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '800px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                        <h2>{editingNotice ? "공지 수정" : "새 공지 작성"}</h2>
                        <form onSubmit={handleNoticeSave} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                            <input value={nTitle} onChange={e => setNTitle(e.target.value)} placeholder="제목" className="glass-card" style={{ padding: '0.8rem' }} required />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <input type="date" value={nStartDate} onChange={e => setNStartDate(e.target.value)} className="glass-card" style={{ padding: '0.8rem' }} required />
                                <input type="date" value={nEndDate} onChange={e => setNEndDate(e.target.value)} className="glass-card" style={{ padding: '0.8rem' }} required />
                            </div>
                            <textarea value={nContent} onChange={e => setNContent(e.target.value)} placeholder="내용 (Markdown 지원)" className="glass-card" style={{ padding: '0.8rem', minHeight: '200px' }} required />
                            {orgUploadLimit !== 'blocked' && (
                                <input type="file" multiple onChange={e => setNFiles(Array.from(e.target.files || []))} className="glass-card" style={{ padding: '0.8rem' }} />
                            )}
                            <button type="submit" className="btn-primary" disabled={isUploading}>{isUploading ? '저장 중...' : '저장'}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* 2. Survey Create */}
            {isSurveyCreateModalOpen && (
                <div className="modal-overlay" onClick={() => setIsSurveyCreateModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '700px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h2>설문 만들기</h2>
                        <form onSubmit={handleSurveyCreate} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                            <input value={sTitle} onChange={e => setSTitle(e.target.value)} placeholder="설문 제목" className="glass-card" style={{ padding: '0.8rem' }} required />
                            <textarea value={sDesc} onChange={e => setSDesc(e.target.value)} placeholder="설문 설명" className="glass-card" style={{ padding: '0.8rem' }} required />
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <label>마감일:</label>
                                <input type="date" value={sEndDate} onChange={e => setSEndDate(e.target.value)} className="glass-card" style={{ padding: '0.5rem' }} required />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>유형 선택 (복수 선택 가능)</label>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    {['link', 'file', 'question'].map(t => {
                                        if (t === 'file' && orgUploadLimit === 'blocked') return null;
                                        return (
                                            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <input type="checkbox" checked={sTypes.includes(t as SurveyType)} onChange={e => {
                                                    if (e.target.checked) setSTypes([...sTypes, t as SurveyType]);
                                                    else setSTypes(sTypes.filter(type => type !== t));
                                                }} /> {t === 'link' ? '링크 연결' : t === 'file' ? '첨부파일 제공' : '문항 작성'}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {sTypes.includes('link') && (
                                <input value={sLink} onChange={e => setSLink(e.target.value)} placeholder="링크 URL 입력" className="glass-card" style={{ padding: '0.8rem' }} />
                            )}

                            {sTypes.includes('file') && orgUploadLimit !== 'blocked' && (
                                <div>
                                    <label>첨부파일 (참여자에게 제공)</label>
                                    <input type="file" multiple onChange={e => setSFiles(Array.from(e.target.files || []))} className="glass-card" style={{ padding: '0.8rem', width: '100%' }} />
                                </div>
                            )}

                            {sTypes.includes('question') && (
                                <div className="glass-card" style={{ padding: '1rem' }}>
                                    <h4>문항 관리</h4>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <select value={newQType} onChange={e => setNewQType(e.target.value as any)} className="glass-card" style={{ padding: '0.5rem' }}>
                                            <option value="text">주관식</option>
                                            <option value="radio">객관식</option>
                                        </select>
                                        <input value={newQText} onChange={e => setNewQText(e.target.value)} placeholder="질문 내용" className="glass-card" style={{ flex: 1, padding: '0.5rem' }} />
                                        {newQType === 'radio' && <input value={newQOptions} onChange={e => setNewQOptions(e.target.value)} placeholder="옵션 (쉼표 구분)" className="glass-card" style={{ flex: 1, padding: '0.5rem' }} />}
                                        <button type="button" onClick={handleAddQuestion} className="btn-primary" style={{ padding: '0.5rem' }}>추가</button>
                                    </div>
                                    <ul style={{ paddingLeft: '1.5rem' }}>
                                        {sQuestions.map((q, i) => (
                                            <li key={i}>{q.text} ({q.type}) {q.options && `[${q.options.join(', ')}]`}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <button type="submit" className="btn-primary" disabled={isUploading}>{isUploading ? '생성 중...' : '설문 생성'}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. Survey Participate */}
            {isSurveyParticipateModalOpen && selectedSurvey && (
                <div className="modal-overlay" onClick={() => setIsSurveyParticipateModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '700px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                        <h2>{selectedSurvey.title}</h2>
                        <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>{selectedSurvey.description}</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {selectedSurvey.types.includes('link') && selectedSurvey.linkUrl && (
                                <a href={selectedSurvey.linkUrl} target="_blank" className="glass-card" style={{ padding: '1rem', textAlign: 'center', color: 'var(--primary)', textDecoration: 'none' }}>🔗 링크 바로가기</a>
                            )}

                            {selectedSurvey.types.includes('file') && selectedSurvey.attachmentUrls && (
                                <div>
                                    <h4>첨부파일 (다운로드)</h4>
                                    {selectedSurvey.attachmentUrls.map((f, i) => (
                                        <a key={i} href={f.url} target="_blank" className="glass-card" style={{ display: 'block', padding: '0.5rem', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-main)', textDecoration: 'none' }}>💾 {f.name}</a>
                                    ))}
                                </div>
                            )}

                            <form onSubmit={handleSurveyParticipate}>
                                {selectedSurvey.types.includes('question') && selectedSurvey.questions && (
                                    <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        {selectedSurvey.questions.map(q => (
                                            <div key={q.id}>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Q. {q.text}</label>
                                                {q.type === 'text' ? (
                                                    <input
                                                        className="glass-card" style={{ width: '100%', padding: '0.8rem' }}
                                                        onChange={e => setMyAnswers({ ...myAnswers, [q.id]: e.target.value })}
                                                    />
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                                        {q.options?.map(opt => (
                                                            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                                <input type="radio" name={q.id} value={opt} onChange={e => setMyAnswers({ ...myAnswers, [q.id]: e.target.value })} />
                                                                {opt}
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {selectedSurvey.types.includes('file') && fileLimit !== 'disabled' && (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>파일 제출 (필요 시)</label>
                                        <input type="file" multiple onChange={e => setMySubmitFiles(Array.from(e.target.files || []))} className="glass-card" style={{ width: '100%', padding: '0.8rem' }} />
                                    </div>
                                )}

                                <button type="submit" className="btn-primary" style={{ width: '100%', padding: '1rem' }} disabled={isUploading}>
                                    {isUploading ? "제출 중..." : "설문 제출하기"}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* 4. Survey Result (Creator Only) */}
            {isSurveyResultModalOpen && selectedSurvey && (
                <div className="modal-overlay" onClick={() => setIsSurveyResultModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '900px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h2>📊 {selectedSurvey.title} 결과</h2>
                            <button onClick={() => setIsSurveyResultModalOpen(false)}>닫기</button>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                            <div className="glass-card" style={{ padding: '1rem', flex: 1, textAlign: 'center' }}>총 참여자: {currentResponses.length}명</div>
                            <button onClick={downloadExcel} className="glass-card" style={{ padding: '1rem', flex: 1, cursor: 'pointer', background: 'var(--success)', color: 'white', border: 'none' }}>📥 엑셀 다운로드</button>
                            <button onClick={downloadFilesZip} className="glass-card" style={{ padding: '1rem', flex: 1, cursor: 'pointer', background: 'var(--primary)', color: 'white', border: 'none' }}>📦 첨부파일 일괄다운</button>
                        </div>

                        {selectedSurvey.questions?.map(q => (
                            <div key={q.id} className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                                <h4>Q. {q.text}</h4>
                                {q.type === 'radio' ? (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        {q.options?.map(opt => {
                                            const count = currentResponses.filter(r => r.answers[q.id] === opt).length;
                                            return <div key={opt}>- {opt}: {count}명 ({(count / currentResponses.length * 100 || 0).toFixed(1)}%)</div>
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ marginTop: '0.5rem', maxHeight: '100px', overflowY: 'auto' }}>
                                        {currentResponses.map(r => r.answers[q.id] ? <div key={r.id} style={{ fontSize: '0.9rem', borderBottom: '1px solid #333', padding: '0.2rem' }}>{r.answers[q.id]}</div> : null)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </main>
    );
}
