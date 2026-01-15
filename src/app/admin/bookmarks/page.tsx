"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";

interface LinkItem {
    id: string;
    title: string;
    url: string;
    order?: number;
}

export default function OrgBookmarksPage() {
    const { isAdmin, orgId, loading } = useAuth();
    const { showToast } = useToast();
    const [orgLinks, setOrgLinks] = useState<LinkItem[]>([]);
    const [newLinkTitle, setNewLinkTitle] = useState("");
    const [newLinkUrl, setNewLinkUrl] = useState("");

    useEffect(() => {
        if (!isAdmin || !orgId) return;

        // 조직 즐겨찾기 구독
        const qLinks = query(collection(db, "bookmarks"), where("type", "==", "org"), where("orgId", "==", orgId));
        const unsubLinks = onSnapshot(qLinks, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            list.sort((a: any, b: any) => {
                const orderA = a.order !== undefined ? a.order : 999999;
                const orderB = b.order !== undefined ? b.order : 999999;
                if (orderA !== orderB) return orderA - orderB;
                return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            });
            setOrgLinks(list);
        });

        return () => unsubLinks();
    }, [isAdmin, orgId]);

    const handleAddLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !newLinkTitle.trim() || !newLinkUrl.trim()) return;
        let url = newLinkUrl.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        // Order 추가 (마지막 순서 + 100)
        const maxOrder = orgLinks.length > 0 ? Math.max(...orgLinks.map((l: any) => l.order || 0)) : 0;
        const newOrder = maxOrder + 100;

        try {
            await addDoc(collection(db, "bookmarks"), {
                type: 'org',
                orgId: orgId,
                title: newLinkTitle,
                url: url,
                order: newOrder,
                createdAt: serverTimestamp()
            });
            showToast("링크가 추가되었습니다.", "success");
            setNewLinkTitle(""); setNewLinkUrl("");
        } catch (e) { showToast("추가 실패", "error"); }
    };

    const handleDeleteLink = async (id: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "bookmarks", id));
            showToast("삭제되었습니다.", "info");
        } catch (e) { showToast("삭제 실패", "error"); }
    };

    const moveItem = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === orgLinks.length - 1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const currentItem = orgLinks[index];
        const targetItem = orgLinks[targetIndex];

        let currentOrder = currentItem.order ?? (index * 100);
        let targetOrder = targetItem.order ?? (targetIndex * 100);

        if (currentOrder === targetOrder) {
            currentOrder = index * 100;
            targetOrder = targetIndex * 100;
        }

        const temp = currentOrder;
        currentOrder = targetOrder;
        targetOrder = temp;

        try {
            await updateDoc(doc(db, "bookmarks", currentItem.id), { order: currentOrder });
            await updateDoc(doc(db, "bookmarks", targetItem.id), { order: targetOrder });
        } catch (e) { showToast("순서 변경 실패", "error"); }
    };

    if (loading) return <div style={{ padding: '2rem' }}>인증 확인 중...</div>;
    if (!isAdmin) return <div style={{ padding: '2rem' }}>접근 권한이 없습니다.</div>;

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ marginBottom: '3rem' }}>
                <h1 className="text-gradient" style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.8rem' }}>⭐ 조직 공용 즐겨찾기</h1>
                <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>조직원들에게만 보이는 즐겨찾기 링크를 관리합니다.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(600px, 2fr) 1fr', gap: '2rem' }}>
                {/* 목록 */}
                <div className="glass-panel" style={{ padding: '2rem' }}>
                    <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>📋 등록된 링크 목록</h3>
                    {orgLinks.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {orgLinks.map((link, index) => (
                                <div key={link.id} className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <button
                                                onClick={() => moveItem(index, 'up')}
                                                disabled={index === 0}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: index === 0 ? 0.3 : 0.7, fontSize: '0.8rem' }}
                                            >▲</button>
                                            <button
                                                onClick={() => moveItem(index, 'down')}
                                                disabled={index === orgLinks.length - 1}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: index === orgLinks.length - 1 ? 0.3 : 0.7, fontSize: '0.8rem' }}
                                            >▼</button>
                                        </div>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <div style={{ fontWeight: '600', marginBottom: '0.2rem' }}>{link.title}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{link.url}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <a href={link.url} target="_blank" rel="noreferrer" className="glass-card" style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>이동</a>
                                        <button onClick={() => handleDeleteLink(link.id)} className="glass-card" style={{ padding: '0.4rem 0.8rem', borderRadius: '99px', color: '#ff4444', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>삭제</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '2rem' }}>등록된 링크가 없습니다.</div>}
                </div>

                {/* 추가 폼 */}
                <div className="glass-panel" style={{ padding: '2rem', height: 'fit-content' }}>
                    <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>➕ 새 링크 추가</h3>
                    <form onSubmit={handleAddLink} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>링크 제목</label>
                            <input type="text" value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)} className="glass-card" style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }} placeholder="예: 구글 워크스페이스" required />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>URL</label>
                            <input type="text" value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} className="glass-card" style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }} placeholder="https://..." required />
                        </div>
                        <button type="submit" className="btn-primary" style={{ padding: '1rem', marginTop: '0.5rem' }}>+ 추가하기</button>
                    </form>
                </div>
            </div>
        </main>
    );
}
