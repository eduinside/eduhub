"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy, updateDoc, doc, deleteDoc, getDoc } from "firebase/firestore";
import { usePathname } from "next/navigation";
import { getFullCopyright } from "@/config/app";

type FeedbackCategory = "inquiry" | "suggestion" | "bug";

interface Reply {
    id: string;
    content: string;
    repliedBy: string;
    repliedAt: any;
}

interface Feedback {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    orgId: string;
    category?: FeedbackCategory;
    content: string;
    hasReply: boolean;
    userRead: boolean;
    reply?: string;
    repliedBy?: string;
    repliedAt?: any;
    replies?: Reply[];
    createdAt: any;
    status: "pending" | "answered";
}

export default function Footer() {
    const { user, orgId, activeProfile } = useAuth();
    const { showToast } = useToast();
    const pathname = usePathname();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [feedbackText, setFeedbackText] = useState("");
    const [category, setCategory] = useState<FeedbackCategory>("inquiry");
    const [submitting, setSubmitting] = useState(false);
    const [hasUnreadReplies, setHasUnreadReplies] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [myFeedbacks, setMyFeedbacks] = useState<Feedback[]>([]);
    const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
    const [orgName, setOrgName] = useState("");

    // 관리자 페이지에서는 푸터 숨김
    const isAdminPage = pathname.startsWith("/admin");

    useEffect(() => {
        if (orgId && !isAdminPage) {
            getDoc(doc(db, "organizations", orgId)).then(snap => {
                if (snap.exists()) setOrgName(snap.data().name);
            });
        }
    }, [orgId, isAdminPage]);

    // 읽지 않은 답변 확인 및 내 문의 목록 가져오기
    useEffect(() => {
        if (!user || !orgId || isAdminPage) return;

        const q = query(
            collection(db, "feedback"),
            where("userId", "==", user.uid),
            where("orgId", "==", orgId),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const feedbacks = snapshot.docs.map(doc => {
                const data = doc.data();
                // 데이터 정규화: replies 배열이 없으면 기존 단일 답변으로 생성
                let replies = data.replies || [];
                if (replies.length === 0 && data.reply) {
                    replies = [{
                        id: 'legacy',
                        content: data.reply,
                        repliedBy: data.repliedBy,
                        repliedAt: data.repliedAt
                    }];
                }
                return {
                    id: doc.id,
                    ...data,
                    replies
                } as Feedback;
            });

            setMyFeedbacks(feedbacks);

            // 읽지 않은 답변 확인
            const hasUnread = feedbacks.some(f => f.hasReply && !f.userRead);
            setHasUnreadReplies(hasUnread);
        });

        return () => unsubscribe();
    }, [user, orgId, isAdminPage]);

    // 모달이 열릴 때 읽지 않은 답변을 읽음으로 표시
    useEffect(() => {
        if (isModalOpen && myFeedbacks.length > 0) {
            myFeedbacks.forEach(async (feedback) => {
                if (feedback.hasReply && !feedback.userRead) {
                    try {
                        await updateDoc(doc(db, "feedback", feedback.id), {
                            userRead: true
                        });
                    } catch (err) {
                        console.error("Error marking as read:", err);
                    }
                }
            });
        }
    }, [isModalOpen, myFeedbacks]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedbackText.trim() || !user || !orgId) return;

        setSubmitting(true);
        try {
            const userName = activeProfile?.name || user.displayName || "익명";

            await addDoc(collection(db, "feedback"), {
                userId: user.uid,
                userName: userName,
                userEmail: user.email,
                orgId: orgId,
                category: category,
                content: feedbackText,
                hasReply: false,
                userRead: true,
                createdAt: serverTimestamp(),
                status: "pending"
            });

            // Send Notification to Org Admins
            try {
                await fetch('/api/fcm/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        topic: `org_${orgId}_admin`,
                        title: `[${orgName || '문의'}] 문의가 추가되었습니다.`,
                        body: `작성자: ${userName}\n내용: ${feedbackText.length > 30 ? feedbackText.slice(0, 30) + '...' : feedbackText}`,
                        url: '/admin/feedback'
                    })
                });
            } catch (ignore) { console.error(ignore); }

            showToast("문의가 전송되었습니다.", "success");
            setFeedbackText("");
            setCategory("inquiry");
            setActiveTab('history');
        } catch (err) {
            console.error(err);
            showToast("문의 전송에 실패했습니다.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    // 관리자 페이지나 로그인 전에는 푸터 숨김
    if (!user || isAdminPage) return null;

    const getCategoryLabel = (cat?: FeedbackCategory) => {
        if (!cat) return "일반";
        switch (cat) {
            case "inquiry": return "단순 문의";
            case "suggestion": return "기능 제안";
            case "bug": return "오류 발생";
        }
    };

    const getCategoryColor = (cat?: FeedbackCategory) => {
        if (!cat) return "#888";
        switch (cat) {
            case "inquiry": return "#2563eb";
            case "suggestion": return "#10b981";
            case "bug": return "#ef4444";
        }
    };

    const handleDeleteFeedback = async (feedbackId: string) => {
        if (!confirm("이 문의를 삭제하시겠습니까?")) return;

        try {
            await deleteDoc(doc(db, "feedback", feedbackId));
            showToast("문의가 삭제되었습니다.", "success");
        } catch (err) {
            console.error(err);
            showToast("삭제에 실패했습니다.", "error");
        }
    };

    return (
        <>
            <footer style={{
                marginTop: "4rem",
                padding: "2rem",
                borderTop: "1px solid var(--border-glass)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.85rem",
                color: "var(--text-dim)"
            }}>
                <div>
                    {getFullCopyright()}
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    className="glass-card footer-inquiry-btn"
                    style={{
                        border: "2px solid var(--primary)",
                        background: isHovered ? "var(--primary)" : "rgba(37, 99, 235, 0.1)",
                        cursor: "pointer",
                        fontSize: "1.3rem",
                        position: "relative",
                        padding: "0.7rem 1.2rem",
                        borderRadius: "12px",
                        transform: isHovered ? "scale(1.1) translateY(-2px)" : "scale(1) translateY(0)",
                        transition: "all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
                        boxShadow: isHovered ? "0 8px 20px rgba(37, 99, 235, 0.3)" : "0 2px 8px rgba(0,0,0,0.1)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        color: isHovered ? "white" : "var(--primary)",
                        fontWeight: "600",
                        zIndex: 50 // ensure visible
                    }}
                    title="문의하기"
                >
                    <span style={{ fontSize: "1.5rem" }}>💬</span>
                    <span className="footer-inquiry-text" style={{ fontSize: "0.9rem" }}>문의하기</span>
                    {hasUnreadReplies && (
                        <span style={{
                            position: "absolute",
                            top: "-5px",
                            right: "-5px",
                            width: "14px",
                            height: "14px",
                            background: "#ff4444",
                            borderRadius: "50%",
                            border: "3px solid white",
                            animation: "pulse 2s infinite",
                            boxShadow: "0 0 10px rgba(255, 68, 68, 0.5)"
                        }} />
                    )}
                </button>
            </footer>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div
                        className="glass-panel animate-fade"
                        style={{ width: "90%", maxWidth: "700px", padding: "2rem", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 style={{ marginBottom: "1.5rem", fontSize: "1.5rem" }}>💬 문의하기</h2>

                        {/* 탭 */}
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border-glass)" }}>
                            <button
                                onClick={() => setActiveTab('new')}
                                style={{
                                    padding: "0.7rem 1.5rem",
                                    background: "none",
                                    border: "none",
                                    borderBottom: activeTab === 'new' ? "2px solid var(--primary)" : "2px solid transparent",
                                    color: activeTab === 'new' ? "var(--primary)" : "var(--text-dim)",
                                    fontWeight: activeTab === 'new' ? "700" : "500",
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                }}
                            >
                                새 문의
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                style={{
                                    padding: "0.7rem 1.5rem",
                                    background: "none",
                                    border: "none",
                                    borderBottom: activeTab === 'history' ? "2px solid var(--primary)" : "2px solid transparent",
                                    color: activeTab === 'history' ? "var(--primary)" : "var(--text-dim)",
                                    fontWeight: activeTab === 'history' ? "700" : "500",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                    position: "relative"
                                }}
                            >
                                문의 내역 ({myFeedbacks.length})
                                {hasUnreadReplies && (
                                    <span style={{
                                        position: "absolute",
                                        top: "0.3rem",
                                        right: "0.3rem",
                                        width: "8px",
                                        height: "8px",
                                        background: "#ff4444",
                                        borderRadius: "50%"
                                    }} />
                                )}
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: "auto", minHeight: "200px" }}>
                            {activeTab === 'new' ? (
                                <form onSubmit={handleSubmit}>
                                    <div style={{ marginBottom: "1rem" }}>
                                        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600", fontSize: "0.9rem" }}>
                                            카테고리
                                        </label>
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            {(["inquiry", "suggestion", "bug"] as FeedbackCategory[]).map((cat) => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => setCategory(cat)}
                                                    className="glass-card"
                                                    style={{
                                                        flex: 1,
                                                        padding: "0.7rem",
                                                        cursor: "pointer",
                                                        border: category === cat ? "2px solid var(--primary)" : "1px solid var(--border-glass)",
                                                        background: category === cat ? "rgba(37, 99, 235, 0.1)" : "transparent",
                                                        color: category === cat ? "var(--primary)" : "var(--text-main)",
                                                        fontWeight: category === cat ? "700" : "500",
                                                        fontSize: "0.85rem",
                                                        transition: "all 0.2s"
                                                    }}
                                                >
                                                    {getCategoryLabel(cat)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <textarea
                                        value={feedbackText}
                                        onChange={(e) => setFeedbackText(e.target.value)}
                                        placeholder="문의 내용을 입력해주세요..."
                                        className="glass-card"
                                        style={{
                                            width: "100%",
                                            minHeight: "150px",
                                            padding: "1rem",
                                            marginBottom: "1rem",
                                            resize: "vertical"
                                        }}
                                        required
                                    />
                                    <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
                                        <button
                                            type="button"
                                            onClick={() => setIsModalOpen(false)}
                                            className="glass-card"
                                            style={{ padding: "0.8rem 1.5rem", cursor: "pointer" }}
                                        >
                                            취소
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            style={{ padding: "0.8rem 1.5rem" }}
                                            disabled={submitting}
                                        >
                                            {submitting ? "전송 중..." : "전송"}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                    {myFeedbacks.length === 0 ? (
                                        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-dim)" }}>
                                            아직 문의 내역이 없습니다.
                                        </div>
                                    ) : (
                                        myFeedbacks.map((feedback) => (
                                            <div
                                                key={feedback.id}
                                                className="glass-card"
                                                style={{
                                                    padding: "1rem",
                                                    borderLeft: feedback.status === "pending" ? "4px solid var(--accent)" : "4px solid var(--primary)"
                                                }}
                                            >
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                                        <span style={{
                                                            fontSize: "0.7rem",
                                                            padding: "0.2rem 0.5rem",
                                                            borderRadius: "4px",
                                                            background: `${getCategoryColor(feedback.category)}15`,
                                                            color: getCategoryColor(feedback.category),
                                                            fontWeight: "600"
                                                        }}>
                                                            {getCategoryLabel(feedback.category)}
                                                        </span>
                                                        {feedback.status === "pending" && (
                                                            <span style={{
                                                                fontSize: "0.7rem",
                                                                padding: "0.2rem 0.5rem",
                                                                borderRadius: "4px",
                                                                background: "rgba(255, 68, 68, 0.15)",
                                                                color: "#ff4444"
                                                            }}>
                                                                답변 대기
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                                        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                                                            {feedback.createdAt?.toDate ? feedback.createdAt.toDate().toLocaleDateString() : ""}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDeleteFeedback(feedback.id)}
                                                            style={{
                                                                background: "none",
                                                                border: "none",
                                                                color: "#ff4444",
                                                                cursor: "pointer",
                                                                fontSize: "0.75rem",
                                                                padding: "0.2rem 0.5rem",
                                                                opacity: 0.7
                                                            }}
                                                            title="문의 삭제"
                                                        >
                                                            삭제
                                                        </button>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    padding: "0.8rem",
                                                    background: "rgba(0,0,0,0.02)",
                                                    borderRadius: "6px",
                                                    marginBottom: "0.5rem",
                                                    fontSize: "0.9rem",
                                                    whiteSpace: "pre-wrap"
                                                }}>
                                                    {feedback.content}
                                                </div>
                                                {feedback.replies && feedback.replies.map((reply) => (
                                                    <div key={reply.id} style={{
                                                        padding: "0.8rem",
                                                        background: "rgba(37, 99, 235, 0.05)",
                                                        borderRadius: "6px",
                                                        borderLeft: "3px solid var(--primary)",
                                                        marginTop: "0.5rem"
                                                    }}>
                                                        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
                                                            💬 {reply.repliedBy} · {reply.repliedAt?.toDate ? reply.repliedAt.toDate().toLocaleDateString() : ""}
                                                        </div>
                                                        <div style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{reply.content}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.5;
                        transform: scale(1.2);
                    }
                }
                @media (max-width: 600px) {
                    .footer-inquiry-text {
                        display: none;
                    }
                    .footer-inquiry-btn {
                        padding: 0 !important;
                        width: 50px;
                        height: 50px;
                        border-radius: 50% !important;
                        justify-content: center;
                    }
                    .footer-inquiry-btn span:first-child {
                        font-size: 1.5rem !important;
                        margin: 0 !important;
                    }
                }
            `}</style>
        </>
    );
}
