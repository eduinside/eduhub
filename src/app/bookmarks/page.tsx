"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";

interface Bookmark {
    id: string;
    type: 'global' | 'org' | 'personal';
    title: string;
    url: string;
    orgId?: string | null;
    userId?: string | null;
    createdAt?: any;
    order?: number;
}

export default function BookmarksPage() {
    const { user, orgId, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        document.title = "즐겨찾기 - EduHub";
        if (authLoading) return;
        if (!user) {
            router.push(`/?redirect=${encodeURIComponent(pathname)}`);
        }
    }, [user, authLoading, pathname, router]);

    // 3가지 목록 상태
    const [globalLinks, setGlobalLinks] = useState<Bookmark[]>([]);
    const [orgLinks, setOrgLinks] = useState<Bookmark[]>([]);
    const [personalLinks, setPersonalLinks] = useState<Bookmark[]>([]);

    // 입력 상태
    const [newLinkTitle, setNewLinkTitle] = useState("");
    const [newLinkUrl, setNewLinkUrl] = useState("https://");
    const [targetType, setTargetType] = useState<'global' | 'org' | 'personal'>('personal'); // Default to personal
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // 정렬 로직
    const sortLinks = (list: Bookmark[]) => {
        return [...list].sort((a: Bookmark, b: Bookmark) => {
            const orderA = a.order !== undefined ? a.order : 999999;
            const orderB = b.order !== undefined ? b.order : 999999;
            if (orderA !== orderB) return orderA - orderB;
            // Fallback to createdAt if order is the same or undefined
            const createdAtA = a.createdAt?.seconds || 0;
            const createdAtB = b.createdAt?.seconds || 0;
            return createdAtB - createdAtA; // Descending by creation time
        });
    };

    useEffect(() => {
        if (!user) return;

        // 1. Global Links
        const qGlobal = query(collection(db, "bookmarks"), where("type", "==", "global"));
        const unsubGlobal = onSnapshot(qGlobal, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Bookmark[];
            setGlobalLinks(sortLinks(list));
        });

        // 2. Org Links
        let unsubOrg = () => { };
        if (orgId) {
            const qOrg = query(collection(db, "bookmarks"), where("type", "==", "org"), where("orgId", "==", orgId));
            unsubOrg = onSnapshot(qOrg, (snap) => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Bookmark[];
                setOrgLinks(sortLinks(list));
            });
        }

        // 3. Personal Links
        const qPersonal = query(collection(db, "bookmarks"), where("type", "==", "personal"), where("userId", "==", user.uid));
        const unsubPersonal = onSnapshot(qPersonal, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Bookmark[];
            setPersonalLinks(sortLinks(list));
        });

        return () => { unsubGlobal(); unsubOrg(); unsubPersonal(); };
    }, [user, orgId]);

    const openAddModal = (type: 'global' | 'org' | 'personal') => {
        setTargetType(type);
        setNewLinkTitle("");
        setNewLinkUrl("https://");
        setIsAddModalOpen(true);
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !targetType) return;
        if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;

        let url = newLinkUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        // Calculate order
        let currentList: Bookmark[] = [];
        if (targetType === 'personal') currentList = personalLinks;
        else if (targetType === 'org') currentList = orgLinks;
        else if (targetType === 'global') currentList = globalLinks;

        const maxOrder = currentList.length > 0 ? Math.max(...currentList.map(l => l.order ?? 0)) : 0;
        const newOrder = maxOrder + 100; // Use a large step to allow easy reordering

        try {
            const data: any = {
                title: newLinkTitle,
                url: url,
                type: targetType,
                order: newOrder, // Add order field
                createdAt: serverTimestamp()
            };

            if (targetType === 'org') data.orgId = orgId;
            if (targetType === 'personal') data.userId = user.uid;

            await addDoc(collection(db, "bookmarks"), data);
            showToast("링크가 추가되었습니다.", "success");
            setIsAddModalOpen(false);
            setNewLinkTitle("");
            setNewLinkUrl("https://");
        } catch (err) {
            console.error(err);
            showToast("추가 중 오류가 발생했습니다.", "error");
        }
    };

    const handleDelete = async (id: string, type: string) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "bookmarks", id));
            showToast("삭제되었습니다.", "info");
        } catch (err) {
            showToast("삭제 중 오류가 발생했습니다.", "error");
        }
    };

    const moveItem = async (index: number, links: Bookmark[], direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === links.length - 1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const currentItem = links[index];
        const targetItem = links[targetIndex];

        // Swap the order values
        const currentItemOrder = currentItem.order ?? (index * 100);
        const targetItemOrder = targetItem.order ?? (targetIndex * 100);

        try {
            await updateDoc(doc(db, "bookmarks", currentItem.id), { order: targetItemOrder });
            await updateDoc(doc(db, "bookmarks", targetItem.id), { order: currentItemOrder });
            showToast("순서가 변경되었습니다.", "info");
        } catch (e) {
            console.error("Error moving item:", e);
            showToast("순서 변경 중 오류가 발생했습니다.", "error");
        }
    };

    const renderColumn = (title: string, links: Bookmark[], type: 'global' | 'org' | 'personal', canEdit: boolean) => (
        <div className="glass-panel" style={{ flex: 1, minWidth: '300px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.2rem', color: type === 'global' ? 'var(--primary)' : type === 'org' ? 'var(--accent)' : 'var(--success)' }}>
                    {title}
                </h2>
                {canEdit && (
                    <button onClick={() => openAddModal(type)} className="glass-card" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>+ 추가</button>
                )}
            </div>

            {links.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                    {links.map((link, index) => (
                        <div key={link.id} className="glass-card link-item" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: '0.2s' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flex: 1, overflow: 'hidden' }}>
                                {canEdit && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                        <button
                                            onClick={() => moveItem(index, links, 'up')}
                                            disabled={index === 0}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: index === 0 ? 0.3 : 0.7, fontSize: '0.7rem', padding: '0.1rem 0.2rem' }}
                                        >▲</button>
                                        <button
                                            onClick={() => moveItem(index, links, 'down')}
                                            disabled={index === links.length - 1}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: index === links.length - 1 ? 0.3 : 0.7, fontSize: '0.7rem', padding: '0.1rem 0.2rem' }}
                                        >▼</button>
                                    </div>
                                )}
                                <a href={link.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'var(--text-main)', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                    ⭐ {link.title}
                                </a>
                            </div>
                            {canEdit && (
                                <button onClick={() => handleDelete(link.id, type)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.9rem', padding: '0.2rem' }}>
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>등록된 링크가 없습니다.</div>
            )}
        </div>
    );

    if (!user) return null;

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ marginBottom: '3rem' }}>
                <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔖 즐겨찾기</h1>
                <p style={{ color: 'var(--text-dim)' }}>자주 사용하는 사이트를 모아 관리하세요.</p>
            </header>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                {/* 1. Global (Read Only) - 관리자 페이지에서 관리 */}
                {renderColumn("🌐 전체 공용", globalLinks, 'global', false)}

                {/* 2. Org (Read Only) - 조직 관리 페이지에서 관리 */}
                {renderColumn("🏢 조직 공용", orgLinks, 'org', false)}

                {/* 3. Personal (Editable) - 개인은 여기서 관리 */}
                {renderColumn("👤 개인용", personalLinks, 'personal', true)}
            </div>

            <style jsx>{`
                .link-item:hover {
                    background: var(--bg-surface) !important;
                    transform: translateY(-2px);
                }
            `}</style>

            {isAddModalOpen && (
                <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '400px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>새 링크 추가</h2>
                        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-dim)' }}>제목</label>
                                <input autoFocus type="text" value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)} placeholder="예: 나이스, 구글 클래스룸" className="glass-card" style={{ width: '100%', padding: '0.8rem' }} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-dim)' }}>URL</label>
                                <input type="text" value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="https://..." className="glass-card" style={{ width: '100%', padding: '0.8rem' }} required />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="glass-card" style={{ flex: 1, padding: '0.8rem' }}>취소</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '0.8rem' }}>추가</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}
