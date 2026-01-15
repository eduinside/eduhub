"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useGroupStatus } from "@/hooks/useGroupStatus";

export default function NavMenu() {
    const { user, orgId, orgIds, orgStatus } = useAuth();
    const pathname = usePathname();
    const updatedGroupIds = useGroupStatus();

    const [orgBookmarks, setOrgBookmarks] = useState<{ title: string, url: string }[]>([]);
    const [personalBookmarks, setPersonalBookmarks] = useState<{ title: string, url: string }[]>([]);
    const [userGroups, setUserGroups] = useState<{ id: string, name: string }[]>([]);
    const [isBookmarkHover, setIsBookmarkHover] = useState(false);
    const [isGroupHover, setIsGroupHover] = useState(false);

    const isAdminPage = pathname.startsWith("/admin");

    useEffect(() => {
        if (!orgId || !user) {
            setOrgBookmarks([]);
            setPersonalBookmarks([]);
            setUserGroups([]);
            return;
        }
        const fetchData = async () => {
            try {
                // 1. Org Bookmarks
                const qOrg = query(collection(db, "bookmarks"), where("type", "==", "org"), where("orgId", "==", orgId));
                const snapOrg = await getDocs(qOrg);
                const listOrg = snapOrg.docs
                    .map(d => ({
                        title: d.data().title,
                        url: d.data().url,
                        order: d.data().order ?? 1000000,
                        isVisible: d.data().isVisible
                    }))
                    .filter(b => b.isVisible !== false)
                    .sort((a, b) => a.order - b.order);
                setOrgBookmarks(listOrg);

                // 2. Personal Bookmarks
                const qPersonal = query(collection(db, "bookmarks"), where("type", "==", "personal"), where("userId", "==", user.uid));
                const snapPersonal = await getDocs(qPersonal);
                const listPersonal = snapPersonal.docs
                    .map(d => ({
                        title: d.data().title,
                        url: d.data().url,
                        order: d.data().order ?? 1000000
                    }))
                    .sort((a, b) => a.order - b.order);
                setPersonalBookmarks(listPersonal);

                // 3. User Groups
                const qGroups = query(collection(db, "groups"), where("orgId", "==", orgId), where("memberIds", "array-contains", user.uid));
                const snapGroups = await getDocs(qGroups);
                const listGroups = snapGroups.docs.map(d => ({
                    id: d.id,
                    name: d.data().name
                }));
                setUserGroups(listGroups);

            } catch (e) {
                console.error("Fetch Nav data error:", e);
            }
        };
        fetchData();
    }, [orgId, user]);

    const navItems = !isAdminPage ? [
        { href: `/notice/${(() => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); })()}`, icon: '📢', label: '공지사항', active: pathname.startsWith('/notice') },
        { href: '/surveys', icon: '📊', label: '설문', active: pathname === '/surveys' },
        { href: '/reservations', icon: '📅', label: '예약', active: pathname === '/reservations' },
        { href: '/groups', icon: '👥', label: '그룹', active: pathname.startsWith('/groups'), isGroup: true },
        { href: '/bookmarks', icon: '⭐', label: '즐겨찾기', active: pathname === '/bookmarks', isBookmark: true },
    ] : [
        ...(pathname.startsWith("/admin/super") ? [
            { href: '/admin/super', icon: '⚙️', label: '시스템 관리', active: pathname === '/admin/super' },
            { href: '/admin/super/notices', icon: '📢', label: '전체 공지', active: pathname.startsWith('/admin/super/notices') },
            { href: '/admin/super/bookmarks', icon: '⭐', label: '전체 즐겨찾기', active: pathname.startsWith('/admin/super/bookmarks') },
            { href: '/admin/super/feedback', icon: '💬', label: '문의', active: pathname.startsWith('/admin/super/feedback') }
        ] : [
            { href: '/admin/org', icon: '⚙️', label: '조직 관리', active: pathname.startsWith('/admin/org') },
            { href: '/admin/feedback', icon: '💬', label: '문의', active: pathname.startsWith('/admin/feedback') }
        ])
    ];

    if (!user) return null;

    return (
        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
            {navItems.map((item, i) => {
                const isLinkDisabled = (!isAdminPage && (orgIds.length === 0 || orgStatus === 'suspended')) || (isAdminPage && orgStatus === 'suspended' && !pathname.startsWith("/admin/super"));

                return (
                    <div
                        key={i}
                        style={{ position: 'relative' }}
                        onMouseEnter={() => {
                            if (item.isBookmark) setIsBookmarkHover(true);
                            if (item.isGroup) setIsGroupHover(true);
                        }}
                        onMouseLeave={() => {
                            if (item.isBookmark) setIsBookmarkHover(false);
                            if (item.isGroup) setIsGroupHover(false);
                        }}
                    >
                        <Link href={isLinkDisabled ? '#' : item.href} style={{ textDecoration: 'none' }}>
                            <div style={{
                                color: (item.active && !isLinkDisabled) ? 'var(--primary)' : 'var(--text-main)',
                                padding: '0.5rem 1rem',
                                borderRadius: '12px',
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                background: (item.active && !isLinkDisabled) ? 'rgba(0,0,0,0.03)' : 'transparent',
                                minWidth: '95px', justifyContent: 'center',
                                transition: 'all 0.2s',
                                fontWeight: (item.active && !isLinkDisabled) ? '700' : '500',
                                cursor: isLinkDisabled ? 'default' : 'pointer',
                                opacity: isLinkDisabled ? 0.5 : 1
                            }}>
                                <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                <span>{item.label}</span>
                            </div>
                        </Link>

                        {item.isGroup && isGroupHover && userGroups.length > 0 && (
                            /* Group Dropdown */
                            <div className="group-dropdown-container" style={{
                                position: 'absolute', top: '100%', left: '50%',
                                transform: 'translateX(-50%)',
                                paddingTop: '0.8rem',
                                zIndex: 1000,
                                cursor: 'default'
                            }}>
                                <div className="glass-panel animate-fade" style={{
                                    width: '240px', padding: '0.8rem',
                                    boxShadow: 'var(--shadow-premium)',
                                    border: '1px solid var(--border-glass)',
                                    background: 'var(--bg-card)',
                                    backdropFilter: 'blur(20px)',
                                    borderRadius: '18px'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                        {userGroups.map((group) => (
                                            <Link
                                                key={group.id}
                                                href={`/groups/${group.id}`}
                                                className="dropdown-item"
                                                style={{
                                                    display: 'block', padding: '0.6rem 0.8rem', borderRadius: '8px',
                                                    textDecoration: 'none', color: 'var(--text-main)', fontSize: '0.85rem',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {updatedGroupIds.includes(group.id) && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ff4444', marginRight: '0.5rem', display: 'inline-block', verticalAlign: 'middle' }}></span>
                                                )}
                                                {group.name}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {item.isBookmark && isBookmarkHover && (orgBookmarks.length > 0 || personalBookmarks.length > 0) && (
                            /* Dropdown with safe-area for hover */
                            <div className="bookmark-dropdown-container" style={{
                                position: 'absolute', top: '100%', left: '50%',
                                transform: 'translateX(-50%)',
                                paddingTop: '0.8rem', // Bridge the hover gap
                                zIndex: 1000,
                                cursor: 'default'
                            }}>
                                <div className="glass-panel animate-fade" style={{
                                    width: '460px', padding: '1.2rem',
                                    display: 'flex', gap: '1.2rem',
                                    boxShadow: 'var(--shadow-premium)',
                                    border: '1px solid var(--border-glass)',
                                    background: 'var(--bg-card)',
                                    backdropFilter: 'blur(20px)',
                                    borderRadius: '20px'
                                }}>
                                    {/* Left: Org */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            {orgBookmarks.map((bm, bi) => (
                                                <a
                                                    key={bi}
                                                    href={bm.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="dropdown-item"
                                                    style={{
                                                        display: 'block', padding: '0.6rem 0.8rem', borderRadius: '8px',
                                                        textDecoration: 'none', color: 'var(--text-main)', fontSize: '0.85rem',
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {bm.title}
                                                </a>
                                            ))}
                                            {orgBookmarks.length === 0 && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', padding: '0.8rem', textAlign: 'center' }}>지정된 링크 없음</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div style={{ width: '1px', background: 'var(--border-glass)' }}></div>

                                    {/* Right: Personal */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            {personalBookmarks.map((bm, bi) => (
                                                <a
                                                    key={bi}
                                                    href={bm.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="dropdown-item"
                                                    style={{
                                                        display: 'block', padding: '0.6rem 0.8rem', borderRadius: '8px',
                                                        textDecoration: 'none', color: 'var(--text-main)', fontSize: '0.85rem',
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {bm.title}
                                                </a>
                                            ))}
                                            {personalBookmarks.length === 0 && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', padding: '0.8rem', textAlign: 'center' }}>등록된 링크 없음</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Add the global styles somewhere? No, we can't add `style jsx global` in a component that is not the page or root in some configs, and `style jsx` is not standard React.
// However, since this is Next.js with styled-jsx (implied by previous code), we can keep it. But wait, `style jsx` is deprecated in newer Next.js App Router for CSS Modules or Tailwind.
// Assuming the user's project setup supports it (it was there before).
// But to be safe and clean, I will NOT add the `style jsx` here. I will assume it's handled or moved to `Navbar.tsx` which wraps this, or globally.
// Actually, `Navbar.tsx` is the parent. We'll add the styles there.
