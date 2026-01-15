"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc, orderBy } from "firebase/firestore";

interface Bookmark {
    id: string;
    title: string;
    url: string;
    order?: number;
    createdAt?: any;
}

export default function SuperAdminBookmarksPage() {
    const { isSuperAdmin } = useAuth();
    const { showToast } = useToast();
    const [globalLinks, setGlobalLinks] = useState<Bookmark[]>([]);
    const [newLinkTitle, setNewLinkTitle] = useState("");
    const [newLinkUrl, setNewLinkUrl] = useState("");

    useEffect(() => {
        if (!isSuperAdmin) return;

        // order 필드로 정렬하되, 없으면 createdAt 역순(최신순) 등으로 정렬이 섞일 수 있음.
        // 클라이언트에서 정렬하는게 안전함.
        const q = query(collection(db, "bookmarks"), where("type", "==", "global"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bookmark));

            // 정렬 로직: order가 있으면 order(오름차순), 없으면 createdAt(내림차순, 최신이 위로? 아니면 보통 등록순? -> 즐겨찾기는 등록순보다는 관리자가 원하는 순서)
            // order가 없는 경우 큰 값을 주어 뒤로 보내거나 처리. 
            // 여기서는 order가 있으면 우선, 없으면 createdAt 내림차순(최신이 위)
            list.sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : 999999;
                const orderB = b.order !== undefined ? b.order : 999999;
                if (orderA !== orderB) return orderA - orderB;
                // order가 같거나 둘다 없으면 최신순
                return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            });

            setGlobalLinks(list);
        });

        return () => unsubscribe();
    }, [isSuperAdmin]);

    const addGlobalLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;
        let url = newLinkUrl.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        // 새 아이템의 order는 현재 max order + 100 또는 맨 앞(0) ?
        // 보통 맨 뒤에 추가.
        const maxOrder = globalLinks.length > 0 ? Math.max(...globalLinks.map(l => l.order || 0)) : 0;
        const newOrder = maxOrder + 100;

        try {
            await addDoc(collection(db, "bookmarks"), {
                type: 'global', className: 'global',
                title: newLinkTitle, url,
                order: newOrder,
                createdAt: serverTimestamp()
            });
            showToast("링크가 추가되었습니다.", "success");
            setNewLinkTitle(""); setNewLinkUrl("");
        } catch (e) { showToast("추가 실패", "error"); }
    };

    const deleteGlobalLink = async (id: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, "bookmarks", id));
        showToast("삭제되었습니다.", "info");
    };

    const moveItem = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === globalLinks.length - 1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const currentItem = globalLinks[index];
        const targetItem = globalLinks[targetIndex];

        // 두 아이템의 순서 값 교환 (만약 order가 없다면 임의 값 부여 후 교환)
        // 안전하게 전체 리스트의 order를 재정비하는 것이 깔끔할 수 있음 (아이템 수가 적으므로)
        // 하지만 updateDoc 오버헤드를 줄이기 위해 두 개만 스왑 시도.

        let currentOrder = currentItem.order ?? (index * 100);
        let targetOrder = targetItem.order ?? (targetIndex * 100);

        // 만약 둘의 order가 같다면(기존 데이터), 강제로 분산 필요
        if (currentOrder === targetOrder) {
            currentOrder = index * 100;
            targetOrder = targetIndex * 100;
        }

        // Swap values
        const temp = currentOrder;
        currentOrder = targetOrder;
        targetOrder = temp;

        try {
            await updateDoc(doc(db, "bookmarks", currentItem.id), { order: currentOrder });
            await updateDoc(doc(db, "bookmarks", targetItem.id), { order: targetOrder });
        } catch (e) {
            console.error(e);
            showToast("순서 변경 실패", "error");
        }
    };

    if (!isSuperAdmin) return <div style={{ padding: '4rem', textAlign: 'center' }}>권한이 없습니다.</div>;

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <div className="animate-fade">
                <header style={{ marginBottom: '3rem' }}>
                    <h1 className="text-gradient" style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.8rem' }}>⭐ 전체 즐겨찾기 관리</h1>
                    <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>모든 조직의 구성원에게 보이는 추천 링크입니다.</p>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(600px, 2fr) 1fr', gap: '2rem' }}>
                    {/* 목록 */}
                    <div className="glass-panel" style={{ padding: '2rem' }}>
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>📋 전체 공용 링크 목록</h3>
                        {globalLinks.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {globalLinks.map((link, index) => (
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
                                                    disabled={index === globalLinks.length - 1}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: index === globalLinks.length - 1 ? 0.3 : 0.7, fontSize: '0.8rem' }}
                                                >▼</button>
                                            </div>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <div style={{ fontWeight: '600', marginBottom: '0.2rem' }}>{link.title}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{link.url}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--text-dim)', marginLeft: '0.8rem', display: 'flex', alignItems: 'center' }} title="새 창에서 열기">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                            </a>
                                            <button onClick={() => deleteGlobalLink(link.id)} className="glass-card" style={{ padding: '0.4rem 0.8rem', borderRadius: '99px', color: '#ff4444', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>삭제</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '2rem' }}>등록된 링크가 없습니다.</div>}
                    </div>

                    {/* 추가 폼 */}
                    <div className="glass-panel" style={{ padding: '2rem', height: 'fit-content' }}>
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>➕ 새 링크 추가</h3>
                        <form onSubmit={addGlobalLink} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>링크 제목</label>
                                <input type="text" value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)} placeholder="예: 구글 워크스페이스" className="glass-card" style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }} required />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>URL</label>
                                <input type="text" value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="https://..." className="glass-card" style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem' }} required />
                            </div>
                            <button type="submit" className="btn-primary" style={{ padding: '1rem', marginTop: '0.5rem' }}>+ 추가하기</button>
                        </form>
                    </div>
                </div>
            </div>
        </main>
    );
}
