"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, arrayUnion } from "firebase/firestore";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useGroupStatus } from "@/hooks/useGroupStatus";

interface Group {
    id: string;
    orgId: string;
    name: string;
    description: string;
    isPublic: boolean;
    ownerId: string;
    memberIds: string[];
    createdAt: any;
}

export default function GroupsPage() {
    const { user, orgId, loading } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const updatedGroupIds = useGroupStatus();

    const [myGroups, setMyGroups] = useState<Group[]>([]);
    const [publicGroups, setPublicGroups] = useState<Group[]>([]);

    // Create Modal
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupDesc, setNewGroupDesc] = useState("");
    const [newGroupPublic, setNewGroupPublic] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        document.title = "그룹 - EduHub";
        if (!user || !orgId) return;

        const q = query(collection(db, "groups"), where("orgId", "==", orgId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Group[];

            const my = list.filter(g => g.memberIds?.includes(user.uid));
            const others = list.filter(g => !g.memberIds?.includes(user.uid) && g.isPublic);

            setMyGroups(my.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
            setPublicGroups(others.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
        });

        return () => unsubscribe();
    }, [user, orgId]);

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !orgId) return;
        if (!newGroupName.trim()) return;

        setIsCreating(true);
        try {
            await addDoc(collection(db, "groups"), {
                orgId,
                name: newGroupName,
                description: newGroupDesc,
                isPublic: newGroupPublic,
                ownerId: user.uid,
                memberIds: [user.uid],
                createdAt: serverTimestamp()
            });
            showToast("그룹이 생성되었습니다.", "success");
            setIsCreateModalOpen(false);
            setNewGroupName("");
            setNewGroupDesc("");
            setNewGroupPublic(true);
        } catch (error) {
            console.error(error);
            showToast("그룹 생성 실패", "error");
        } finally {
            setIsCreating(false);
        }
    };

    const handleJoinGroup = async (groupId: string, groupName: string) => {
        if (!user) return;
        if (!confirm(`'${groupName}' 그룹에 가입하시겠습니까?`)) return;

        try {
            await updateDoc(doc(db, "groups", groupId), {
                memberIds: arrayUnion(user.uid)
            });
            showToast("가입되었습니다.", "success");
        } catch (error) {
            showToast("가입 실패", "error");
        }
    };

    if (loading) return null;
    if (!user) {
        router.push(`/?redirect=${encodeURIComponent(pathname)}`);
        return null;
    }

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👥 그룹</h1>
                    <p style={{ color: 'var(--text-dim)' }}>같은 업무를 위한 소모임, 스터디를 만들어 소통하세요.</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="btn-primary create-group-btn"
                    style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <span className="plus-mark" style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span>
                    <span className="btn-text">새 그룹 만들기</span>
                </button>
            </header>

            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                {/* 내 그룹 */}
                <section style={{ marginBottom: '4rem' }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        🏫 내 그룹 <span style={{ fontSize: '1rem', opacity: 0.5, fontWeight: 'normal' }}>({myGroups.length})</span>
                    </h2>

                    {myGroups.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                            {myGroups.map(group => (
                                <Link href={`/groups/${group.id}`} key={group.id} style={{ textDecoration: 'none' }}>
                                    <div className="glass-card hover-card" style={{
                                        padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease',
                                        borderLeft: updatedGroupIds.includes(group.id) ? '4px solid #ff9f43' : undefined
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem', gap: '0.5rem' }}>
                                            <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-main)', margin: 0, flex: 1 }}>{group.name}</h3>
                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                                                {group.ownerId === user?.uid && (
                                                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(121, 80, 242, 0.2)', border: '1px solid rgba(121, 80, 242, 0.4)', color: '#7950f2', fontWeight: 'bold' }}>
                                                        👑 그룹장
                                                    </span>
                                                )}
                                                {!group.isPublic && (
                                                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--text-dim)', color: 'white' }}>
                                                        🔒 비공개
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem', lineHeight: '1.5', flex: 1, marginBottom: '1.5rem' }}>
                                            {group.description || "설명이 없습니다."}
                                        </p>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '600' }}>
                                            멤버 {group.memberIds?.length || 0}명
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                            가입된 그룹이 없습니다. 새로운 그룹을 만들거나 찾아보세요!
                        </div>
                    )}
                </section>

                {/* 공개 그룹 탐색 */}
                <section>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>🔭 그룹 탐색</h2>

                    {publicGroups.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                            {publicGroups.map(group => (
                                <div key={group.id} className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', opacity: 0.9 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                                        <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)', margin: 0 }}>{group.name}</h3>
                                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--success)', color: 'white' }}>OPEN</span>
                                    </div>
                                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: '1.5', flex: 1, marginBottom: '1.5rem' }}>
                                        {group.description || "설명이 없습니다."}
                                    </p>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>멤버 {group.memberIds?.length || 0}명</span>
                                        <button
                                            onClick={() => handleJoinGroup(group.id, group.name)}
                                            className="btn-primary"
                                            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                                        >
                                            가입하기
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ padding: '2rem', color: 'var(--text-dim)', opacity: 0.7 }}>
                            참여 가능한 다른 공개 그룹이 없습니다.
                        </div>
                    )}
                </section>
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '500px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>새로운 그룹 만들기</h2>
                        <form onSubmit={handleCreateGroup}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>그룹 이름</label>
                                <input
                                    value={newGroupName}
                                    onChange={e => setNewGroupName(e.target.value)}
                                    className="glass-card"
                                    style={{ width: '100%', padding: '0.8rem' }}
                                    placeholder="예: 독서 모임, 프로젝트 A팀"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>소개</label>
                                <textarea
                                    value={newGroupDesc}
                                    onChange={e => setNewGroupDesc(e.target.value)}
                                    className="glass-card"
                                    style={{ width: '100%', padding: '0.8rem', minHeight: '100px' }}
                                    placeholder="그룹에 대한 간단한 설명을 적어주세요."
                                />
                            </div>
                            <div style={{ marginBottom: '2rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={newGroupPublic}
                                        onChange={e => setNewGroupPublic(e.target.checked)}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: '600' }}>공개 그룹으로 설정</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>다른 구성원이 이 그룹을 검색하고 가입할 수 있습니다.</div>
                                    </div>
                                </label>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="glass-card" style={{ flex: 1, padding: '1rem' }}>취소</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '1rem' }} disabled={isCreating}>
                                    {isCreating ? "생성 중..." : "그룹 만들기"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <style jsx>{`
                @media (max-width: 768px) {
                    :global(.create-group-btn) {
                        padding: 0 !important;
                        width: 3rem;
                        height: 3rem;
                        justify-content: center;
                        border-radius: 50% !important;
                    }
                    .btn-text {
                        display: none;
                    }
                    .plus-mark {
                        font-size: 1.5rem !important;
                        margin: 0 !important;
                    }
                }
            `}</style>
        </main>
    );
}
