"use client";

import { useState, useEffect, use, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, storage } from "@/lib/firebase";
import {
    collection, onSnapshot, query, where, orderBy, addDoc, serverTimestamp,
    deleteDoc, doc, updateDoc, getDoc, getDocs, arrayUnion, arrayRemove, setDoc, increment
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import * as XLSX from 'xlsx';
import { formatDate } from "@/utils/dateUtils";
import { compressImage } from "@/utils/fileUtils";

// --- Interfaces ---
interface Group {
    id: string;
    orgId: string;
    name: string;
    description: string;
    isPublic: boolean;
    ownerId: string;
    memberIds: string[];
}

interface Notice {
    id: string;
    title: string;
    content: string;
    authorName: string;
    authorUid: string;
    createdAt: any;
    startDate: string;
    endDate: string;
    orgId: string; // Here it will be groupId
    attachments?: any[];
}

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

interface Survey {
    id: string;
    orgId: string;
    title: string;
    description: string;
    endDate: string;
    questions?: Question[];
    creatorUid?: string;
    creatorName?: string;
    authorUid?: string;
    authorName?: string;
    createdAt: any;
    // Legacy support if needed, but we are overwriting
    types?: string[];
}

interface Member {
    uid: string;
    name: string;
    email: string;
}

interface GroupMessage {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAt: any;
    type?: 'text' | 'survey';
    surveyId?: string;
    surveyTitle?: string;
    surveyEndDate?: string;
}

export default function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { user, loading: authLoading, activeProfile } = useAuth();
    // Actually useAuth doesn't have showToast? The previous file used `useToast()`. I will use that.
    const { showToast } = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const unwrappedParams = use(params);
    const groupId = unwrappedParams.groupId;

    const [group, setGroup] = useState<Group | null>(null);
    const [activeTab, setActiveTab] = useState<'notices' | 'surveys' | 'chat' | 'members'>('chat');
    const [isMember, setIsMember] = useState(false);
    const [activeSurveyTab, setActiveSurveyTab] = useState<'inprogress' | 'completed' | 'my'>('inprogress');
    const [visibleSurveyCount, setVisibleSurveyCount] = useState(15);
    const observerTarget = useRef<HTMLDivElement>(null);

    // Data
    const [notices, setNotices] = useState<Notice[]>([]);
    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [messages, setMessages] = useState<GroupMessage[]>([]);
    const [chatInput, setChatInput] = useState("");

    // Notice Form
    const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
    const [nTitle, setNTitle] = useState("");
    const [nContent, setNContent] = useState("");
    const [nStartDate, setNStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [nEndDate, setNEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [nFiles, setNFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
    const [orgUploadLimit, setOrgUploadLimit] = useState<string>("3");

    // Survey Form
    const [isSurveyModalOpen, setIsSurveyModalOpen] = useState(false);
    const [sTitle, setSTitle] = useState("");
    const [sDesc, setSDesc] = useState("");
    const [sEndDate, setSEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    /* Survey Create State */
    const [sQuestions, setSQuestions] = useState<Question[]>([]);
    // Removed old simple state variables (qText, qType, qOptions) as they are now per-question in the rich editor

    const addQuestion = (type: 'text' | 'choice' | 'multiple' | 'notice' | 'file') => {
        const newQ: Question = {
            id: Date.now().toString(),
            type,
            text: "",
            options: (type === 'choice' || type === 'multiple') ? ["옵션 1"] : undefined,
            attachments: []
        };
        setSQuestions([...sQuestions, newQ]);
    };

    const updateQuestionText = (id: string, text: string) => {
        setSQuestions(sQuestions.map(q => q.id === id ? { ...q, text } : q));
    };

    const updateOption = (qId: string, optIdx: number, val: string) => {
        setSQuestions(sQuestions.map(q => {
            if (q.id === qId && q.options) {
                const newOpts = [...q.options];
                newOpts[optIdx] = val;
                return { ...q, options: newOpts };
            }
            return q;
        }));
    };

    const addOption = (qId: string) => {
        setSQuestions(sQuestions.map(q => {
            if (q.id === qId && q.options) {
                return { ...q, options: [...q.options, `옵션 ${q.options.length + 1}`] };
            }
            return q;
        }));
    };

    const removeQuestion = (id: string) => {
        setSQuestions(sQuestions.filter(q => q.id !== id));
    };

    const handleAddLink = (qId: string) => {
        const url = prompt("추가할 링크 주소를 입력하세요 (http:// 포함):");
        if (!url) return;
        setSQuestions(sQuestions.map(q => {
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
        if (!user) return;

        try {
            const storageRef = ref(storage, `surveys/${user.uid}/${Date.now()}_${file.name}`);
            showToast("파일 업로드 중...", "info");
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);

            setSQuestions(sQuestions.map(q => {
                if (q.id === qId) {
                    const prev = q.attachments || (q.attachment ? [q.attachment] : []);
                    return { ...q, attachments: [...prev, { type: 'file', url, name: file.name }], attachment: null };
                }
                return q;
            }));
            showToast("첨부 완료", "success");
        } catch (err) {
            showToast("업로드 실패", "error");
        }
    };

    const handleRemoveAttachment = (qId: string, idx: number) => {
        setSQuestions(sQuestions.map(q => {
            if (q.id === qId) {
                const prev = q.attachments || (q.attachment ? [q.attachment] : []);
                return { ...q, attachments: prev.filter((_, i) => i !== idx), attachment: null };
            }
            return q;
        }));
    };

    // myResponseIds state
    const [myResponseIds, setMyResponseIds] = useState<string[]>([]);
    // Deleted old participate modal state


    const chatContainerRef = useRef<HTMLDivElement>(null);

    /* Edit Group State */
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [editDesc, setEditDesc] = useState("");

    /* Member Add State */
    const [isMemberAddModalOpen, setIsMemberAddModalOpen] = useState(false);
    const [allOrgUsers, setAllOrgUsers] = useState<Member[]>([]);
    const [searchQuery, setSearchQuery] = useState("");


    useEffect(() => {
        if (!user || !groupId) return;

        // 1. Group Info
        const unsubGroup = onSnapshot(doc(db, "groups", groupId), (docSnap) => {
            if (docSnap.exists()) {
                const gData = { id: docSnap.id, ...docSnap.data() } as Group;
                setGroup(gData);
                setIsMember(gData.memberIds?.includes(user.uid));
            } else {
                showToast("그룹을 찾을 수 없습니다.", "error");
                router.push("/groups");
            }
        });

        // 2. Notices (orgId == groupId)
        const qNotice = query(collection(db, "notices"), where("orgId", "==", groupId), orderBy("startDate", "desc"));
        const unsubNotice = onSnapshot(qNotice, (snap) => {
            setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Notice[]);
        });

        // 3. Surveys (orgId == groupId)
        const qSurvey = query(collection(db, "surveys"), where("orgId", "==", groupId), orderBy("endDate", "asc"));
        const unsubSurvey = onSnapshot(qSurvey, (snap) => {
            setSurveys(snap.docs.map(d => {
                const data = d.data();
                const questions = data.questions?.map((q: any) => ({
                    ...q,
                    type: q.type === 'radio' ? 'choice' : q.type
                }));
                return { id: d.id, ...data, questions };
            }) as Survey[]);
        });

        // 4. My Responses (for button status)
        const qResponses = query(collection(db, "survey_responses"), where("userId", "==", user.uid));
        const unsubResponses = onSnapshot(qResponses, (snap) => {
            setMyResponseIds(snap.docs.map(d => d.data().surveyId));
        });

        // Add unsubResponses to cleanup
        return () => { unsubGroup(); unsubNotice(); unsubSurvey(); unsubResponses(); };
    }, [groupId, user]);

    // Org Limit Effect
    useEffect(() => {
        if (!group?.orgId) return;
        const unsubOrg = onSnapshot(doc(db, "organizations", group.orgId), (snap) => {
            if (snap.exists()) {
                setOrgUploadLimit(snap.data().uploadLimit || "3");
            }
        });
        return () => unsubOrg();
    }, [group?.orgId]);

    // Chat fetch effect
    useEffect(() => {
        if (!user || !groupId || activeTab !== 'chat') return;

        const qChat = query(collection(db, "groups", groupId, "messages"), orderBy("createdAt", "asc"));
        const unsubChat = onSnapshot(qChat, (snap) => {
            setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as GroupMessage[]);
        });

        return () => unsubChat();
    }, [groupId, user, activeTab]);

    // Update Last Visit
    useEffect(() => {
        if (user && groupId) {
            setDoc(doc(db, "users", user.uid, "group_visits", groupId), {
                lastVisit: serverTimestamp()
            }, { merge: true });
        }
    }, [user, groupId, activeTab]); // Update on tab change too? Or just entering page? Entering page is enough. But activeTab change implies active usage. I'll keep it simple.

    // Survey Tab Change - Reset Pagination
    useEffect(() => {
        setVisibleSurveyCount(15);
    }, [activeSurveyTab]);

    // Infinite Scroll Observer
    useEffect(() => {
        if (activeTab !== 'surveys') return;
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    setVisibleSurveyCount(prev => prev + 15);
                }
            },
            { threshold: 1.0 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) observer.unobserve(observerTarget.current);
        };
    }, [activeTab, surveys, activeSurveyTab]);

    // Scroll chat to bottom
    useEffect(() => {
        if (activeTab === 'chat' && chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, activeTab]);

    // ... (Member fetch effect remains same)

    // Old handleAddQuestion removed

    const handleCreateSurvey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !groupId) return;
        if (sQuestions.length === 0) { showToast("최소 1개의 문항을 추가해주세요.", "error"); return; }

        setIsUploading(true);
        try {
            const docRef = await addDoc(collection(db, "surveys"), {
                orgId: groupId,
                title: sTitle,
                description: sDesc,
                endDate: sEndDate,
                // types: ['question'], // No longer needed
                questions: sQuestions.map(q => ({
                    id: q.id, type: q.type, text: q.text, options: q.options || null,
                    attachments: q.attachments || (q.attachment ? [q.attachment] : [])
                })),
                authorUid: user.uid,
                authorName: members.find(m => m.uid === user.uid)?.name || user.displayName || "익명",
                createdAt: serverTimestamp()
            });

            // Post to Chat
            await addDoc(collection(db, "groups", groupId, "messages"), {
                senderId: user.uid,
                senderName: members.find(m => m.uid === user.uid)?.name || user.displayName || "알 수 없음",
                content: `📊 새 설문: [${sTitle}] (${sEndDate}까지)`,
                type: 'survey',
                surveyId: docRef.id,
                surveyTitle: sTitle,
                surveyEndDate: sEndDate,
                createdAt: serverTimestamp()
            });

            // Update Group Activity Link
            await updateDoc(doc(db, "groups", groupId), { lastSurveyAt: serverTimestamp() });

            showToast("설문이 생성되었습니다.", "success");
            setIsSurveyModalOpen(false);
            setSTitle(""); setSDesc(""); setSQuestions([]);
        } catch (e) { showToast("생성 실패", "error"); }
        finally { setIsUploading(false); }
    };

    const handleDeleteSurvey = async (id: string) => {
        if (!confirm("설문을 삭제하시겠습니까? (응답 데이터도 삭제됩니다)")) return;
        try {
            await deleteDoc(doc(db, "surveys", id));
            showToast("설문이 삭제되었습니다.", "success");
        } catch (e) {
            showToast("삭제 실패", "error");
        }
    };
    // Deleted handleSurveyParticipate and its related UI is moved to [surveyId]/page.tsx

    const handleUpdateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!group) return;
        try {
            await updateDoc(doc(db, "groups", groupId), {
                name: editName,
                description: editDesc
            });
            showToast("그룹 정보가 수정되었습니다.", "success");
            setIsEditModalOpen(false);
        } catch (e) { showToast("수정 실패", "error"); }
    };

    const handleCloseGroup = async () => {
        if (!group || !user || group.ownerId !== user.uid) return;
        if (!confirm("정말 이 그룹을 폐쇄하시겠습니까? 그룹과 관련된 모든 데이터가 삭제되며 복구할 수 없습니다.")) return;

        try {
            await deleteDoc(doc(db, "groups", groupId));
            showToast("그룹이 폐쇄되었습니다.", "info");
            router.push("/groups");
        } catch (e) {
            showToast("폐쇄 실패", "error");
        }
    };

    const handleAddMember = async (uid: string) => {
        if (!group) return;
        try {
            await updateDoc(doc(db, "groups", groupId), {
                memberIds: arrayUnion(uid)
            });
            showToast("멤버가 추가되었습니다.", "success");
        } catch (e) { showToast("추가 실패", "error"); }
    };

    const handleRemoveMember = async (uid: string) => {
        if (!group || !confirm("정말 이 회원을 내보내시겠습니까?")) return;
        try {
            await updateDoc(doc(db, "groups", groupId), {
                memberIds: arrayRemove(uid)
            });
            showToast("멤버가 제거되었습니다.", "info");
        } catch (e) { showToast("제거 실패", "error"); }
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!chatInput.trim() || !user || !groupId) return;

        const text = chatInput;
        setChatInput("");

        // Primary source: Organization Profile Name from AuthContext
        // Secondary: Display Name from Auth
        // Fallback: Members list (may be delayed)
        const senderName = activeProfile?.name || user.displayName || members.find(m => m.uid === user.uid)?.name || "그룹원";

        try {
            await addDoc(collection(db, "groups", groupId, "messages"), {
                senderId: user.uid,
                senderName: senderName,
                content: text,
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, "groups", groupId), { lastMessageAt: serverTimestamp() });
        } catch (e) {
            showToast("메시지 전송 실패", "error");
        }
    };

    const handleDeleteMessage = async (msgId: string) => {
        if (!groupId || !confirm("메시지를 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "groups", groupId, "messages", msgId));
        } catch (e) {
            showToast("삭제 실패", "error");
        }
    };

    const LinkifyText = ({ text }: { text: string }) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);

        return (
            <>
                {parts.map((part, i) => (
                    urlRegex.test(part) ? (
                        <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline' }}>{part}</a>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                ))}
            </>
        );
    };

    // ... (handleNotice logic) ...


    // Fetch members details whenever group.memberIds exists
    useEffect(() => {
        if (group && group.memberIds) {
            const fetchMembers = async () => {
                const proms = group.memberIds.map(uid => getDoc(doc(db, "users", uid)));
                const snaps = await Promise.all(proms);
                const mems = snaps.map(s => {
                    const d = s.data();
                    const orgProfile = d?.profiles?.[group.orgId];
                    return { uid: s.id, name: orgProfile?.name || d?.name || "사용자", email: d?.email || "" };
                });
                setMembers(mems);
            };
            fetchMembers();

            if (group.ownerId === user?.uid) {
                // Fetch all organization users for member addition
                const fetchOrgUsers = async () => {
                    const q = query(collection(db, "users"), where("orgIds", "array-contains", group.orgId));
                    const snap = await getDocs(q);
                    const list = snap.docs.map(d => ({
                        uid: d.id,
                        name: d.data().name || "사용자",
                        email: d.data().email || ""
                    })).filter(u => !group.memberIds.includes(u.uid));
                    setAllOrgUsers(list);
                };
                fetchOrgUsers();
            }
        }
    }, [group?.memberIds, user?.uid, group?.orgId]);

    const handleNoticeUnknown = async (e: React.FormEvent) => {
        e.preventDefault();
        // Upload logic same as NoticesPage
    };

    const handleCreateNotice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !groupId) return;
        setIsUploading(true);
        try {
            const attachments = editingNotice ? [...(editingNotice.attachments || [])] : [];
            // Check Organization Limit
            let orgId = group?.orgId;
            if (orgId) {
                const orgDoc = await getDoc(doc(db, "organizations", orgId));
                if (orgDoc.exists()) {
                    const orgData = orgDoc.data();
                    const limit = orgData.uploadLimit || "3";
                    if (limit === 'blocked') {
                        showToast("이 조직의 파일 업로드가 차단되었습니다.", "error");
                        setIsUploading(false);
                        return;
                    }
                    const limitBytes = parseInt(limit) * 1024 * 1024;

                    for (let file of nFiles) {
                        file = await compressImage(file);
                        if (file.size > limitBytes) throw new Error(`${file.name} 용량 초과 (${limit}MB 제한)`);

                        const storageRef = ref(storage, `notices/${groupId}/${Date.now()}_${file.name}`);
                        await uploadBytes(storageRef, file);
                        const url = await getDownloadURL(storageRef);
                        attachments.push({ name: file.name, url, size: file.size });
                    }

                    const newSize = attachments.slice(-nFiles.length).reduce((sum: number, a: any) => sum + (a.size || 0), 0);
                    if (newSize > 0) {
                        await updateDoc(doc(db, "organizations", orgId), {
                            "storageUsage.totalFiles": increment(nFiles.length),
                            "storageUsage.totalBytes": increment(newSize)
                        });
                    }
                }
            } else {
                // Fallback if no orgId (Public group?)
                for (let file of nFiles) {
                    file = await compressImage(file);
                    const storageRef = ref(storage, `notices/${groupId}/${Date.now()}_${file.name}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    attachments.push({ name: file.name, url, size: file.size });
                }
            }

            const noticeData = {
                title: nTitle,
                content: nContent,
                startDate: nStartDate,
                endDate: nEndDate,
                orgId: groupId,
                attachments,
                updatedAt: serverTimestamp()
            };

            if (editingNotice) {
                await updateDoc(doc(db, "notices", editingNotice.id), noticeData);
                showToast("공지가 수정되었습니다.", "success");
            } else {
                await addDoc(collection(db, "notices"), {
                    ...noticeData,
                    authorName: activeProfile?.name || user.displayName || "그룹원",
                    authorUid: user.uid,
                    authorRole: 'user', // Group notices are usually user-level
                    createdAt: serverTimestamp()
                });
                await updateDoc(doc(db, "groups", groupId), { lastNoticeAt: serverTimestamp() });
                showToast("공지가 등록되었습니다.", "success");
            }
            setIsNoticeModalOpen(false);
            setEditingNotice(null);
            setNTitle(""); setNContent(""); setNFiles([]);
        } catch (e) { showToast("실패", "error"); }
        finally { setIsUploading(false); }
    };

    const handleDeleteNotice = async (id: string) => {
        if (!confirm("공지를 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "notices", id));
            showToast("삭제되었습니다.", "info");
        } catch (e) { showToast("삭제 실패", "error"); }
    };

    const handleLeaveGroup = async () => {
        if (!confirm("정말 이 그룹을 탈퇴하시겠습니까?")) return;
        try {
            await updateDoc(doc(db, "groups", groupId), {
                memberIds: arrayRemove(user?.uid)
            });
            router.push("/groups");
            showToast("탈퇴하였습니다.", "info");
        } catch (e) { showToast("오류 발생", "error"); }
    };

    if (authLoading) return <div style={{ padding: '3rem', textAlign: 'center' }}>로딩 중...</div>;

    if (!user) {
        router.push(`/?redirect=${encodeURIComponent(pathname)}`);
        return null;
    }

    if (!group) return <div style={{ padding: '3rem', textAlign: 'center' }}>로딩 중...</div>;

    if (!isMember) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
                <h2>🔒 비공개 그룹이거나 멤버가 아닙니다.</h2>
                <button onClick={() => router.push("/groups")} className="glass-card" style={{ marginTop: '1rem', padding: '0.8rem' }}>그룹 목록으로</button>
            </div>
        );
    }

    return (
        <main style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <Link href="/groups" style={{ textDecoration: 'none', color: 'var(--text-dim)', fontSize: '0.9rem' }}>← 그룹 목록으로</Link>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginTop: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
                            <h1 style={{ fontSize: '2.2rem', margin: 0 }}>{group.name}</h1>
                            <span style={{
                                fontSize: '0.75rem',
                                padding: '0.3rem 0.6rem',
                                borderRadius: '6px',
                                background: group.isPublic ? 'rgba(121, 80, 242, 0.15)' : 'var(--text-dim)',
                                color: group.isPublic ? '#7950f2' : 'white',
                                border: group.isPublic ? '1px solid rgba(121, 80, 242, 0.3)' : 'none',
                                fontWeight: '600'
                            }}>
                                {group.isPublic ? "공개 그룹" : "비공개 그룹"}
                            </span>
                        </div>
                        <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', maxWidth: '800px' }}>{group.description}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        {group.ownerId === user?.uid && (
                            <button
                                onClick={() => { setEditName(group.name); setEditDesc(group.description); setIsEditModalOpen(true); }}
                                className="glass-card"
                                style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid var(--primary)' }}
                            >
                                ⚙️ 그룹 설정
                            </button>
                        )}
                        {group.ownerId === user?.uid && (
                            <span style={{ fontSize: '0.8rem', padding: '0.5rem 1rem', borderRadius: '20px', background: '#7950f2', color: 'white', fontWeight: 'bold' }}>그룹장</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="glass-panel" style={{ display: 'flex', padding: '0.4rem', gap: '0.4rem', marginBottom: '2rem' }}>
                {[
                    { id: 'chat', label: '💬 대화함' },
                    { id: 'notices', label: '📢 공지사항' },
                    { id: 'surveys', label: '📊 설문조사' },
                    { id: 'members', label: '👥 멤버' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        style={{
                            flex: 1,
                            padding: '0.8rem',
                            borderRadius: '12px',
                            border: 'none',
                            background: activeTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-main)',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="animate-fade">
                {activeTab === 'chat' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '600px', background: 'var(--bg-card)', borderRadius: '24px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
                        <div
                            ref={chatContainerRef}
                            style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}
                        >
                            {messages.length > 0 ? messages.map((m) => (
                                <div key={m.id} style={{
                                    alignSelf: m.senderId === user?.uid ? 'flex-end' : 'flex-start',
                                    maxWidth: '80%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: m.senderId === user?.uid ? 'flex-end' : 'flex-start'
                                }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.3rem', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
                                        {members.find(mem => mem.uid === m.senderId)?.name || m.senderName} • {(() => {
                                            if (!m.createdAt?.toDate) return "";
                                            const date = m.createdAt.toDate();
                                            const today = new Date();
                                            const isToday = date.getDate() === today.getDate() &&
                                                date.getMonth() === today.getMonth() &&
                                                date.getFullYear() === today.getFullYear();
                                            return isToday
                                                ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : `${formatDate(date)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                        })()}
                                    </div>
                                    <div style={{
                                        background: m.senderId === user?.uid ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                        color: m.senderId === user?.uid ? 'white' : 'var(--text-main)',
                                        padding: '0.8rem 1.2rem',
                                        borderRadius: '16px',
                                        borderTopRightRadius: m.senderId === user?.uid ? '4px' : '16px',
                                        borderTopLeftRadius: m.senderId === user?.uid ? '16px' : '4px',
                                        fontSize: '0.95rem',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all',
                                        position: 'relative'
                                    }}>
                                        {m.type === 'survey' ? (
                                            <div>
                                                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{m.content}</div>
                                                <Link
                                                    href={`/surveys/${m.surveyId}?from=group&returnTo=${encodeURIComponent(pathname)}`}
                                                    style={{
                                                        display: 'inline-block',
                                                        background: 'rgba(255,255,255,0.2)',
                                                        color: 'white',
                                                        padding: '0.5rem 1rem',
                                                        borderRadius: '8px',
                                                        textDecoration: 'none',
                                                        fontSize: '0.9rem',
                                                        fontWeight: 'bold',
                                                        marginTop: '0.5rem'
                                                    }}
                                                >
                                                    참여하기 &gt;
                                                </Link>
                                            </div>
                                        ) : (
                                            <LinkifyText text={m.content} />
                                        )}
                                        {m.senderId === user?.uid && m.createdAt?.toMillis && (Date.now() - m.createdAt.toMillis() < 60000) && (
                                            <button
                                                onClick={() => handleDeleteMessage(m.id)}
                                                style={{
                                                    position: 'absolute',
                                                    right: 'calc(100% + 5px)',
                                                    bottom: '0',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#ff4444',
                                                    fontSize: '1rem',
                                                    cursor: 'pointer',
                                                    padding: '5px',
                                                    zIndex: 10
                                                }}
                                                title="메시지 삭제"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )) : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                                    첫 번째 메시지를 남겨보세요!
                                </div>
                            )}
                        </div>
                        <form onSubmit={handleSendMessage} style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: '0.8rem', alignItems: 'flex-end' }}>
                            <textarea
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder="메시지를 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)"
                                style={{
                                    flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-glass)',
                                    borderRadius: '12px', padding: '0.8rem 1rem', color: 'var(--text-main)', fontSize: '0.95rem',
                                    minHeight: '45px', maxHeight: '150px', resize: 'none',
                                    msOverflowStyle: 'none', scrollbarWidth: 'none' // Hide scrollbar for IE/Edge and Firefox
                                }}
                                className="hide-scrollbar"
                                rows={1}
                            />
                            <button type="submit" className="btn-primary" style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', height: '45px' }}>전송</button>
                        </form>
                    </div>
                )}
                <style jsx>{`
                    .hide-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                `}</style>

                {activeTab === 'notices' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.2rem' }}>공지사항 ({notices.length})</h3>
                            <button onClick={() => { setEditingNotice(null); setNTitle(""); setNContent(""); setIsNoticeModalOpen(true); }} className="btn-primary" style={{ padding: '0.6rem 1.2rem' }}>+ 공지 쓰기</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {notices.length > 0 ? notices.map(n => {
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const isExpired = todayStr > n.endDate;
                                const isNow = todayStr >= n.startDate && todayStr <= n.endDate;

                                return (
                                    <div key={n.id} className="glass-card" style={{
                                        padding: '1.5rem',
                                        // opacity: isExpired ? 0.7 : 1, // Removed opacity reduction
                                        borderLeft: isNow ? '4px solid var(--primary)' : '1px solid var(--border-glass)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.8rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <span style={{
                                                    fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
                                                    background: isNow ? 'var(--primary)' : (isExpired ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'),
                                                    color: isNow ? 'white' : 'var(--text-dim)',
                                                    fontWeight: '700',
                                                    border: '1px solid var(--border-glass)'
                                                }}>
                                                    {isNow ? '진행중' : (isExpired ? '기간만료' : '예약됨')}
                                                </span>
                                                <div style={{ fontWeight: 'bold', fontSize: '1.15rem' }}>{n.title}</div>
                                            </div>
                                            {(n.authorUid === user?.uid || group.ownerId === user?.uid) && (
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={() => {
                                                            setEditingNotice(n);
                                                            setNTitle(n.title);
                                                            setNContent(n.content);
                                                            setNStartDate(n.startDate);
                                                            setNEndDate(n.endDate);
                                                            setIsNoticeModalOpen(true);
                                                        }}
                                                        className="glass-card"
                                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                    >수정</button>
                                                    <button
                                                        onClick={() => handleDeleteNotice(n.id)}
                                                        style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '1rem', cursor: 'pointer' }}
                                                    >🗑️</button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="markdown-body" style={{ fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '1.2rem', lineHeight: '1.6' }}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.content}</ReactMarkdown>
                                        </div>
                                        {n.attachments && n.attachments.length > 0 && (
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
                                                {n.attachments.map((f: any, i: number) => (
                                                    <a key={i} href={f.url} target="_blank" className="glass-card" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', textDecoration: 'none', color: 'var(--primary)' }}>📎 {f.name}</a>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', borderTop: '1px solid var(--border-glass)', paddingTop: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <span>👤 {n.authorName}</span>
                                                <span>🕒 {formatDate(n.startDate)} ~ {formatDate(n.endDate)}</span>
                                            </div>
                                            <span style={{ opacity: 0.6 }}>{n.createdAt?.toDate ? formatDate(n.createdAt.toDate()) : ''}</span>
                                        </div>
                                    </div>
                                );
                            }) : <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5, background: 'rgba(255,255,255,0.02)', borderRadius: '24px' }}>등록된 공지가 없습니다.</div>}
                        </div>
                    </div>
                )}

                {activeTab === 'surveys' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3>그룹 설문</h3>
                            <button onClick={() => setIsSurveyModalOpen(true)} className="btn-primary" style={{ padding: '0.6rem 1.2rem' }}>+ 설문 만들기</button>
                        </div>

                        {/* Survey Tabs */}
                        {(() => {
                            const today = new Date().toISOString().slice(0, 10);
                            const inprogressCount = surveys.filter(s => !myResponseIds.includes(s.id) && s.endDate >= today).length;
                            const completedCount = surveys.filter(s => myResponseIds.includes(s.id)).length;
                            const myCount = surveys.filter(s => (s.authorUid || s.creatorUid) === user?.uid).length;

                            return (
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)' }}>
                                    <button
                                        onClick={() => setActiveSurveyTab('inprogress')}
                                        style={{
                                            padding: '0.8rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                                            borderBottom: activeSurveyTab === 'inprogress' ? '2px solid var(--primary)' : 'none',
                                            color: activeSurveyTab === 'inprogress' ? 'var(--primary)' : 'var(--text-dim)',
                                            fontWeight: activeSurveyTab === 'inprogress' ? 'bold' : 'normal'
                                        }}
                                    >
                                        진행중 ({inprogressCount})
                                    </button>
                                    <button
                                        onClick={() => setActiveSurveyTab('completed')}
                                        style={{
                                            padding: '0.8rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                                            borderBottom: activeSurveyTab === 'completed' ? '2px solid var(--primary)' : 'none',
                                            color: activeSurveyTab === 'completed' ? 'var(--primary)' : 'var(--text-dim)',
                                            fontWeight: activeSurveyTab === 'completed' ? 'bold' : 'normal'
                                        }}
                                    >
                                        응답완료 ({completedCount})
                                    </button>
                                    <button
                                        onClick={() => setActiveSurveyTab('my')}
                                        style={{
                                            padding: '0.8rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                                            borderBottom: activeSurveyTab === 'my' ? '2px solid var(--primary)' : 'none',
                                            color: activeSurveyTab === 'my' ? 'var(--primary)' : 'var(--text-dim)',
                                            fontWeight: activeSurveyTab === 'my' ? 'bold' : 'normal'
                                        }}
                                    >
                                        내 설문 ({myCount})
                                    </button>
                                </div>
                            );
                        })()}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {(() => {
                                const filtered = surveys.filter(s => {
                                    const isResponded = myResponseIds.includes(s.id);
                                    const isExpired = s.endDate < new Date().toISOString().slice(0, 10);
                                    const uid = s.authorUid || s.creatorUid;
                                    const isMy = uid === user?.uid;

                                    if (activeSurveyTab === 'inprogress') return !isResponded && !isExpired;
                                    if (activeSurveyTab === 'completed') return isResponded;
                                    if (activeSurveyTab === 'my') return isMy;
                                    return false;
                                }).sort((a, b) => {
                                    if (activeSurveyTab === 'inprogress') return a.endDate.localeCompare(b.endDate);
                                    return b.endDate.localeCompare(a.endDate);
                                });

                                // Sort logic is handled in useEffect fetching (orderBy endDate asc)
                                // But let's double check client-side sort if arrays are merged or something
                                // They are already sorted by Firestore query.

                                const visibleSurveys = filtered.slice(0, visibleSurveyCount);

                                return visibleSurveys.length > 0 ? (
                                    <>
                                        {visibleSurveys.map(s => {
                                            const isResponded = myResponseIds.includes(s.id);
                                            const isExpired = s.endDate < new Date().toISOString().slice(0, 10);
                                            const uid = s.authorUid || s.creatorUid;
                                            const isAuthor = uid === user?.uid || group.ownerId === user?.uid;
                                            const displayAuthorName = members.find(m => m.uid === uid)?.name || s.authorName || s.creatorName || "작성자";

                                            return (
                                                <div key={s.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
                                                            {activeSurveyTab !== 'inprogress' && (
                                                                <span style={{
                                                                    fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderRadius: '4px',
                                                                    background: !isExpired ? 'var(--accent)' : 'var(--bg-surface)',
                                                                    color: !isExpired ? 'black' : 'var(--text-dim)',
                                                                    fontWeight: '600'
                                                                }}>
                                                                    {!isExpired ? "진행중" : "마감됨"}
                                                                </span>
                                                            )}
                                                            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{s.title}</h3>
                                                        </div>
                                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(121, 80, 242, 0.15)', color: '#7950f2', border: '1px solid rgba(121, 80, 242, 0.3)' }}>그룹</span>
                                                            <span>·</span>
                                                            <span>{formatDate(s.endDate)}까지</span>
                                                            <span>·</span>
                                                            <span>{group.name}({displayAuthorName})</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        {!isExpired ? (
                                                            !isResponded ? (
                                                                <button
                                                                    onClick={() => router.push(`/surveys/${s.id}?from=group&returnTo=${encodeURIComponent(pathname)}`)}
                                                                    className="btn-primary"
                                                                    style={{ padding: '0.6rem 1.2rem', borderRadius: '99px', fontSize: '0.9rem', cursor: 'pointer' }}
                                                                >
                                                                    참여하기
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => router.push(`/surveys/${s.id}?from=group&returnTo=${encodeURIComponent(pathname)}`)}
                                                                    className="glass-card"
                                                                    style={{ padding: '0.6rem 1.2rem', borderRadius: '99px', fontSize: '0.9rem', cursor: 'pointer', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                                                                >
                                                                    참여 완료 (수정)
                                                                </button>
                                                            )
                                                        ) : (
                                                            <button disabled className="glass-card" style={{ padding: '0.6rem 1.2rem', borderRadius: '99px', fontSize: '0.9rem', opacity: 0.5 }}>마감</button>
                                                        )}

                                                        {isAuthor && (uid === user?.uid) && (
                                                            <>
                                                                <button onClick={() => router.push(`/surveys/${s.id}/results?returnTo=${encodeURIComponent(pathname)}`)} className="glass-card" style={{ padding: '0.6rem', borderRadius: '50%', color: 'var(--primary)', border: 'none', cursor: 'pointer' }} title="결과 보기">📊</button>
                                                                <button onClick={() => handleDeleteSurvey(s.id)} className="glass-card" style={{ padding: '0.6rem', borderRadius: '50%', color: '#ff4444', border: 'none', cursor: 'pointer' }} title="삭제">🗑️</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {filtered.length > visibleSurveyCount && (
                                            <div ref={observerTarget} style={{ padding: '1rem', textAlign: 'center', opacity: 0.5 }}>
                                                로딩 중...
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.6 }}>
                                        {activeSurveyTab === 'inprogress' ? "진행 중인 설문이 없습니다." : (activeSurveyTab === 'completed' ? "참여한 설문이 없습니다." : "작성한 설문이 없습니다.")}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {activeTab === 'members' && (
                    <div className="animate-fade">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.2rem' }}>멤버 목록 ({members.length})</h3>
                            {group.ownerId === user?.uid && (
                                <button onClick={() => setIsMemberAddModalOpen(true)} className="btn-primary" style={{ padding: '0.6rem 1.2rem' }}>+ 멤버 초대</button>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                            {members.map(m => (
                                <div key={m.uid} className="glass-card" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{
                                            width: '45px', height: '45px', borderRadius: '50%',
                                            background: group.ownerId === m.uid ? '#7950f2' : 'var(--bg-surface)',
                                            color: group.ownerId === m.uid ? 'white' : 'var(--text-main)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1.2rem', fontWeight: 'bold', border: '1px solid var(--border-glass)'
                                        }}>
                                            {m.name[0]}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '700', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                {m.name} {group.ownerId === m.uid && <span title="그룹장" style={{ fontSize: '0.9rem' }}>👑</span>}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{m.email}</div>
                                        </div>
                                    </div>
                                    {group.ownerId === user?.uid && group.ownerId !== m.uid && (
                                        <button
                                            onClick={() => handleRemoveMember(m.uid)}
                                            style={{
                                                background: 'rgba(255, 68, 68, 0.1)',
                                                border: '1px solid rgba(255, 68, 68, 0.2)',
                                                color: '#ff4444',
                                                padding: '0.5rem',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                lineHeight: 1
                                            }}
                                            onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(255, 68, 68, 0.2)' }}
                                            onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(255, 68, 68, 0.1)' }}
                                            title="그룹에서 제거"
                                        >
                                            <span style={{ fontSize: '1rem' }}>🗑️</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {group.ownerId !== user?.uid && (
                            <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border-glass)', paddingTop: '2rem', textAlign: 'center' }}>
                                <button
                                    onClick={handleLeaveGroup}
                                    style={{
                                        background: 'rgba(255, 68, 68, 0.1)',
                                        border: '1px solid rgba(255, 68, 68, 0.3)',
                                        color: '#ff4444',
                                        padding: '0.8rem 2rem',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => { (e.target as any).style.background = 'rgba(255, 68, 68, 0.2)' }}
                                    onMouseLeave={e => { (e.target as any).style.background = 'rgba(255, 68, 68, 0.1)' }}
                                >
                                    🚶 그룹 탈퇴하기
                                </button>
                                <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.8rem' }}>그룹을 탈퇴하면 더 이상 그룹 소식과 설문에 접근할 수 없습니다.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Notice Modal */}
            {
                isNoticeModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsNoticeModalOpen(false)}>
                        <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '600px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                            <h2>{editingNotice ? "그룹 공지 수정" : "그룹 공지 작성"}</h2>
                            <form onSubmit={handleCreateNotice} style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
                                <input value={nTitle} onChange={e => setNTitle(e.target.value)} placeholder="제목" className="glass-card" style={{ padding: '0.8rem' }} required />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>게시 시작일</label>
                                        <input type="date" value={nStartDate} onChange={e => setNStartDate(e.target.value)} className="glass-card" style={{ padding: '0.8rem', width: '100%' }} required />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>게시 마감일</label>
                                        <input type="date" value={nEndDate} onChange={e => setNEndDate(e.target.value)} className="glass-card" style={{ padding: '0.8rem', width: '100%' }} required />
                                    </div>
                                </div>
                                <textarea value={nContent} onChange={e => setNContent(e.target.value)} placeholder="내용 (Markdown 지원)" className="glass-card" style={{ padding: '0.8rem', minHeight: '200px' }} required />
                                {orgUploadLimit !== 'blocked' && (
                                    <input type="file" multiple onChange={e => setNFiles(Array.from(e.target.files || []))} className="glass-card" style={{ padding: '0.8rem' }} />
                                )}
                                <button type="submit" className="btn-primary" disabled={isUploading}>{isUploading ? '저장 중...' : '저장'}</button>
                            </form>
                        </div>
                    </div>
                )
            }
            {/* Survey Modal */}
            {
                isSurveyModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsSurveyModalOpen(false)}>
                        <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '700px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                            <h2>그룹 설문 만들기</h2>
                            <form onSubmit={handleCreateSurvey} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>설문 제목</label>
                                    <input value={sTitle} onChange={e => setSTitle(e.target.value)} className="glass-card" style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }} placeholder="제목" required />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>설문 설명</label>
                                    <textarea value={sDesc} onChange={e => setSDesc(e.target.value)} className="glass-card" style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', minHeight: '80px' }} placeholder="설명" required />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>마감일</label>
                                    <input type="date" value={sEndDate} onChange={e => setSEndDate(e.target.value)} className="glass-card" style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }} required />
                                </div>

                                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h4>문항 관리 ({sQuestions.length})</h4>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <button type="button" onClick={() => addQuestion('choice')} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>+ 객관식</button>
                                            <button type="button" onClick={() => addQuestion('multiple')} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>+ 다중선택</button>
                                            <button type="button" onClick={() => addQuestion('text')} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>+ 주관식</button>
                                            <button type="button" onClick={() => addQuestion('notice')} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>+ 설명/자료</button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {sQuestions.map((q, idx) => (
                                            <div key={q.id} className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--border-glass)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                        {q.type === 'notice' ? `[설명/자료]` : `문항 ${idx + 1} (${{ choice: '객관식', multiple: '다중선택', text: '주관식', file: '파일' }[q.type] || q.type})`}
                                                    </span>
                                                    <button type="button" onClick={() => removeQuestion(q.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}>삭제</button>
                                                </div>

                                                <input
                                                    value={q.text} onChange={e => updateQuestionText(q.id, e.target.value)}
                                                    className="glass-card" style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem' }}
                                                    placeholder={q.type === 'notice' ? "섹션 제목 (생략 가능)" : "질문 내용을 입력하세요"}
                                                    required={q.type !== 'notice'}
                                                />

                                                {(q.type === 'choice' || q.type === 'multiple') && q.options && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginLeft: '1rem' }}>
                                                        {q.options.map((opt, oIdx) => (
                                                            <input
                                                                key={oIdx} value={opt} onChange={e => updateOption(q.id, oIdx, e.target.value)}
                                                                className="glass-card" style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                                                                placeholder={`옵션 ${oIdx + 1}`}
                                                            />
                                                        ))}
                                                        <button type="button" onClick={() => addOption(q.id)} style={{ alignSelf: 'flex-start', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>+ 옵션 추가</button>
                                                    </div>
                                                )}

                                                {(q.type === 'notice' || q.type === 'file') && (
                                                    <div style={{ marginTop: '1rem' }}>
                                                        {q.type === 'file' && <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>* 응답자가 파일을 업로드하는 문항입니다.</div>}
                                                        {q.type === 'notice' && (
                                                            <>
                                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                                                    {q.attachments?.map((att, attIdx) => (
                                                                        <div key={attIdx} className="glass-card" style={{ padding: '0.4rem', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                            <span>{att.type === 'link' ? '🔗' : '📁'} {att.name || '첨부'}</span>
                                                                            <button type="button" onClick={() => handleRemoveAttachment(q.id, attIdx)} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>x</button>
                                                                        </div>
                                                                    ))}
                                                                </div>
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
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button type="submit" className="btn-primary" disabled={isUploading}>{isUploading ? '생성 중...' : '설문 생성'}</button>
                            </form>
                        </div>
                    </div>
                )
            }
            {/* Participate Modal */}
            {/* Participate Modal removed */}
            {/* Edit Group Modal */}
            {
                isEditModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
                        <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '500px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1.5rem' }}>⚙️ 그룹 정보 수정</h2>
                            <form onSubmit={handleUpdateGroup} style={{ display: 'grid', gap: '1.2rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>그룹 이름</label>
                                    <input value={editName} onChange={e => setEditName(e.target.value)} className="glass-card" style={{ width: '100%', padding: '0.8rem' }} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>그룹 설명</label>
                                    <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="glass-card" style={{ width: '100%', padding: '0.8rem', minHeight: '100px', whiteSpace: 'pre' }} required />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="glass-card" style={{ flex: 1, padding: '1rem' }}>취소</button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1, padding: '1rem' }}>저장하기</button>
                                </div>
                                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
                                    <button
                                        type="button"
                                        onClick={handleCloseGroup}
                                        style={{
                                            width: '100%',
                                            padding: '0.8rem',
                                            background: 'rgba(255, 68, 68, 0.05)',
                                            color: '#ff4444',
                                            border: '1px solid rgba(255, 68, 68, 0.1)',
                                            borderRadius: '12px',
                                            fontSize: '0.9rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as any).style.background = 'rgba(255, 68, 68, 0.1)' }}
                                        onMouseLeave={e => { (e.currentTarget as any).style.background = 'rgba(255, 68, 68, 0.05)' }}
                                    >
                                        🚩 그룹 폐쇄하기
                                    </button>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: '0.6rem' }}>그룹 폐쇄 시 모든 데이터가 삭제되며 복구할 수 없습니다.</p>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Member Add Modal */}
            {
                isMemberAddModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsMemberAddModalOpen(false)}>
                        <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '500px', padding: '2.5rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                            <h2 style={{ marginBottom: '1rem' }}>👥 멤버 초대</h2>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>조직 내 구성원을 그룹 멤버로 추가합니다.</p>

                            <input
                                placeholder="이름 또는 이메일로 검색"
                                className="glass-card"
                                style={{ width: '100%', padding: '0.8rem', marginBottom: '1.5rem' }}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />

                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {allOrgUsers
                                    .filter(u => u.name.includes(searchQuery) || u.email.includes(searchQuery))
                                    .map(u => (
                                        <div key={u.uid} className="glass-card" style={{ padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{u.name}</div>
                                                <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{u.email}</div>
                                            </div>
                                            <button
                                                onClick={() => handleAddMember(u.uid)}
                                                className="btn-primary"
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                            >
                                                추가
                                            </button>
                                        </div>
                                    ))}
                                {allOrgUsers.length === 0 && (
                                    <div style={{ textAlign: 'center', opacity: 0.6, padding: '2rem' }}>초대할 수 있는 구성원이 없습니다.</div>
                                )}
                            </div>

                            <button onClick={() => setIsMemberAddModalOpen(false)} className="glass-card" style={{ width: '100%', padding: '1rem', marginTop: '1.5rem' }}>닫기</button>
                        </div>
                    </div>
                )
            }
        </main >

    );
}
