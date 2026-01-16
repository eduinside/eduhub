"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, getDoc, deleteDoc, arrayUnion } from "firebase/firestore";
import { useRouter } from "next/navigation";

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
    orgName?: string;
    category?: FeedbackCategory;
    content: string;
    hasReply: boolean;
    userRead: boolean;
    // Guest Inquiry Fields
    isGuest?: boolean;
    authorName?: string;
    contact?: string;
    // 기존 단일 답변 (하위 호환성)
    reply?: string;
    repliedBy?: string;
    repliedAt?: any;
    // 새로운 다중 답변
    replies?: Reply[];
    createdAt: any;
    status: "pending" | "answered";
}

export default function FeedbackPage() {
    const { user, orgId, isAdmin, isSuperAdmin } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
    const [replyText, setReplyText] = useState("");
    const [editReplyId, setEditReplyId] = useState<string | null>(null); // 댓글 수정용 ID
    const [submitting, setSubmitting] = useState(false);
    const [orgName, setOrgName] = useState("");

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

    useEffect(() => {
        if (!user || !isAdmin || !orgId) {
            router.push("/");
            return;
        }

        // 조직 관리자는 자기 조직 문의만
        const q = query(
            collection(db, "feedback"),
            where("orgId", "==", orgId),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const data = await Promise.all(snapshot.docs.map(async (docSnap) => {
                const feedbackData = docSnap.data();
                let orgName = "";

                // 최고 관리자인 경우 조직 이름 가져오기
                if (isSuperAdmin && feedbackData.orgId) {
                    try {
                        const orgDoc = await getDoc(doc(db, "organizations", feedbackData.orgId));
                        if (orgDoc.exists()) {
                            orgName = orgDoc.data().name || "";
                        }
                    } catch (e) {
                        console.error("Error fetching org name:", e);
                    }
                }

                // 기존 단일 답변을 replies 배열로 변환 (하위 호환성)
                let replies = feedbackData.replies || [];
                if (replies.length === 0 && feedbackData.reply) {
                    replies = [{
                        id: "legacy", // 고유 ID 부여
                        content: feedbackData.reply,
                        repliedBy: feedbackData.repliedBy,
                        repliedAt: feedbackData.repliedAt
                    }];
                }

                return {
                    id: docSnap.id,
                    ...feedbackData,
                    replies,
                    orgName
                } as Feedback;
            }));
            setFeedbacks(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, orgId, isAdmin, isSuperAdmin, router]);

    // 조직 이름 가져오기 (조직 관리자인 경우에만)
    useEffect(() => {
        if (!orgId || !isAdmin) return;
        const fetchOrgName = async () => {
            try {
                const orgDoc = await getDoc(doc(db, "organizations", orgId));
                if (orgDoc.exists()) {
                    setOrgName(orgDoc.data().name || "");
                }
            } catch (e) {
                console.error("Error fetching org name:", e);
            }
        };
        fetchOrgName();
    }, [orgId, isAdmin]);

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFeedback || !replyText.trim() || !user) return;

        setSubmitting(true);
        try {
            // 응답자 이름 결정
            let replierName = "";
            if (isSuperAdmin && !isAdmin) {
                // 최고관리자이면서 조직 관리자가 아닌 경우
                replierName = "최고관리자";
            } else if (isAdmin && orgName) {
                // 조직 관리자인 경우
                replierName = `${orgName} 관리자`;
            } else if (isSuperAdmin) {
                // 조직이 없는 최고관리자
                replierName = "최고관리자";
            } else {
                replierName = user.displayName || user.email || "관리자";
            }

            const feedbackRef = doc(db, "feedback", selectedFeedback.id);
            // 기존 replies 가져오기 (selectedFeedback은 모달 열릴 때 상태이므로 최신이 아닐 수도 있지만, 여기선 UI 상태 기준)
            const currentReplies = selectedFeedback.replies || [];

            if (editReplyId) {
                // 댓글 수정
                const updatedReplies = currentReplies.map(r =>
                    r.id === editReplyId ? { ...r, content: replyText, repliedAt: new Date(), repliedBy: replierName } : r
                );

                await updateDoc(feedbackRef, {
                    replies: updatedReplies,
                    // Legacy 필드 업데이트 (마지막 수정된 내용으로)
                    reply: replyText,
                    repliedBy: replierName,
                    repliedAt: new Date()
                });
                showToast("답변이 수정되었습니다.", "success");
            } else {
                // 새 댓글 추가
                const newReply = {
                    id: Date.now().toString(),
                    content: replyText,
                    repliedBy: replierName,
                    repliedAt: new Date()
                };

                await updateDoc(feedbackRef, {
                    replies: [...currentReplies, newReply],
                    hasReply: true,
                    userRead: false,
                    status: "answered",
                    // Legacy 필드 업데이트
                    reply: replyText,
                    repliedBy: replierName,
                    repliedAt: new Date()
                });

                // Send Notification
                try {
                    await fetch('/api/fcm/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            targetUserId: selectedFeedback.userId,
                            title: `[${orgName || 'EduHub'}] 문의에 대한 답변이 추가되었습니다.`,
                            body: `답변: ${replyText.slice(0, 30)}...`,
                            url: '/'
                        })
                    });
                } catch (e) { console.error("Notification Error:", e); }

                showToast("답변이 등록되었습니다.", "success");
            }

            setReplyText("");
            setEditReplyId(null);
            setSelectedFeedback(null);
        } catch (err) {
            console.error(err);
            showToast("작업에 실패했습니다.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteFeedback = async (feedbackId: string) => {
        if (!confirm("정말 이 문의를 삭제하시겠습니까?")) return;

        try {
            await deleteDoc(doc(db, "feedback", feedbackId));
            showToast("문의가 삭제되었습니다.", "success");
        } catch (err) {
            console.error(err);
            showToast("삭제에 실패했습니다.", "error");
        }
    };

    const handleDeleteReply = async (feedback: Feedback, replyId: string, repliedBy: string) => {
        // 조직 관리자는 최고관리자의 답변을 삭제할 수 없음
        if (isAdmin && !isSuperAdmin && repliedBy === "최고관리자") {
            showToast("최고관리자의 답변은 삭제할 수 없습니다.", "error");
            return;
        }

        if (!confirm("답변을 삭제하시겠습니까?")) return;

        try {
            const updatedReplies = (feedback.replies || []).filter(r => r.id !== replyId);
            const isNoRepliesLeft = updatedReplies.length === 0;
            const lastReply = updatedReplies.length > 0 ? updatedReplies[updatedReplies.length - 1] : null;

            await updateDoc(doc(db, "feedback", feedback.id), {
                replies: updatedReplies,
                hasReply: !isNoRepliesLeft,
                status: isNoRepliesLeft ? "pending" : "answered",
                // Legacy 필드 업데이트
                reply: lastReply ? lastReply.content : "",
                repliedBy: lastReply ? lastReply.repliedBy : "",
                repliedAt: lastReply ? lastReply.repliedAt : null
            });
            showToast("답변이 삭제되었습니다.", "success");
        } catch (err) {
            console.error(err);
            showToast("삭제에 실패했습니다.", "error");
        }
    };

    const handleEditReply = (feedback: Feedback, reply: Reply) => {
        // 기존 답변을 수정 모드로
        setSelectedFeedback(feedback);
        setReplyText(reply.content);
        setEditReplyId(reply.id);
    };

    if (loading) return <div style={{ padding: "4rem", textAlign: "center" }}>로딩 중...</div>;

    return (
        <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
            <header style={{ marginBottom: "3rem" }}>
                <h1 className="text-gradient" style={{ fontSize: "2.5rem", fontWeight: "800", marginBottom: "0.5rem" }}>
                    💬 문의 관리
                </h1>
                <p style={{ color: "var(--text-dim)" }}>
                    문의를 확인하고 답변하세요.
                </p>
            </header>

            {feedbacks.length === 0 ? (
                <div className="glass-panel" style={{ padding: "3rem", textAlign: "center" }}>
                    <p style={{ color: "var(--text-dim)" }}>아직 문의가 없습니다.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {feedbacks.map((feedback) => (
                        <div
                            key={feedback.id}
                            className="glass-panel"
                            style={{
                                padding: "1.5rem",
                                borderLeft: feedback.status === "pending" ? "4px solid var(--accent)" : "4px solid var(--primary)"
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                                        <span style={{ fontWeight: "bold" }}>{feedback.isGuest ? feedback.authorName : feedback.userName}</span>
                                        <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>({feedback.isGuest ? feedback.contact : feedback.userEmail})</span>
                                        <span style={{
                                            fontSize: "0.7rem",
                                            padding: "0.2rem 0.5rem",
                                            borderRadius: "4px",
                                            background: feedback.isGuest ? "rgba(150, 150, 150, 0.15)" : `${getCategoryColor(feedback.category)}15`,
                                            color: feedback.isGuest ? "#888" : getCategoryColor(feedback.category),
                                            fontWeight: "600"
                                        }}>
                                            {feedback.isGuest ? "비회원" : getCategoryLabel(feedback.category)}
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
                                    <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                                        {feedback.createdAt?.toDate ? feedback.createdAt.toDate().toLocaleString() : ""}
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                    <button
                                        onClick={() => setSelectedFeedback(feedback)}
                                        className="btn-primary"
                                        style={{ padding: "0.5rem 1rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}
                                    >
                                        답변하기
                                    </button>
                                    <button
                                        onClick={() => handleDeleteFeedback(feedback.id)}
                                        className="glass-card"
                                        style={{
                                            padding: "0.5rem 1rem",
                                            fontSize: "0.85rem",
                                            whiteSpace: "nowrap",
                                            color: "#ff4444",
                                            border: "1px solid rgba(255, 68, 68, 0.2)"
                                        }}
                                    >
                                        삭제
                                    </button>
                                </div>
                            </div>

                            <div style={{
                                padding: "1rem",
                                background: "rgba(0,0,0,0.02)",
                                borderRadius: "8px",
                                marginBottom: "1rem",
                                whiteSpace: "pre-wrap"
                            }}>
                                {feedback.content}
                            </div>

                            {/* 다중 답변 렌더링 */}
                            {feedback.replies && feedback.replies.map((reply) => (
                                <div key={reply.id} style={{
                                    padding: "1rem",
                                    background: "rgba(37, 99, 235, 0.05)",
                                    borderRadius: "8px",
                                    borderLeft: "3px solid var(--primary)",
                                    marginBottom: "1rem"
                                }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                                            답변 by {reply.repliedBy} · {reply.repliedAt?.toDate ? reply.repliedAt.toDate().toLocaleString() : ""}
                                        </div>
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            <button
                                                onClick={() => handleEditReply(feedback, reply)}
                                                style={{
                                                    background: "none",
                                                    border: "none",
                                                    color: "var(--primary)",
                                                    cursor: "pointer",
                                                    fontSize: "0.75rem",
                                                    padding: "0.2rem 0.5rem",
                                                    opacity: 0.7
                                                }}
                                                title="답변 수정"
                                            >
                                                수정
                                            </button>
                                            <button
                                                onClick={() => handleDeleteReply(feedback, reply.id, reply.repliedBy || "")}
                                                style={{
                                                    background: "none",
                                                    border: "none",
                                                    color: "#ff4444",
                                                    cursor: "pointer",
                                                    fontSize: "0.75rem",
                                                    padding: "0.2rem 0.5rem",
                                                    opacity: 0.7
                                                }}
                                                title="답변 삭제"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ whiteSpace: "pre-wrap" }}>{reply.content}</div>
                                </div>
                            ))}


                        </div>
                    ))}
                </div>
            )}

            {selectedFeedback && (
                <div className="modal-overlay" onClick={() => setSelectedFeedback(null)}>
                    <div
                        className="glass-panel animate-fade"
                        style={{ width: "90%", maxWidth: "600px", padding: "2rem" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>
                            {editReplyId ? "답변 수정" : "답변 작성"}
                        </h2>
                        <div style={{
                            padding: "1rem",
                            background: "rgba(0,0,0,0.02)",
                            borderRadius: "8px",
                            marginBottom: "1.5rem",
                            maxHeight: "150px",
                            overflowY: "auto"
                        }}>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
                                {selectedFeedback.userName}님의 문의
                            </div>
                            <div style={{ whiteSpace: "pre-wrap" }}>{selectedFeedback.content}</div>
                        </div>

                        <form onSubmit={handleReply}>
                            <textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="답변 내용을 입력해주세요..."
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
                                    onClick={() => {
                                        setSelectedFeedback(null);
                                        setReplyText("");
                                        setEditReplyId(null);
                                    }}
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
                                    {submitting ? "등록 중..." : "답변 등록"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}
