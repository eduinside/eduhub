"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useGroupStatus } from "@/hooks/useGroupStatus";
import useFcmToken from "@/hooks/useFcmToken";

export default function NavMenu() {
    const { user, orgId, orgIds, orgStatus, setActiveOrgId, profiles, theme, toggleTheme, activeProfile, isAdmin, isSuperAdmin } = useAuth();
    const router = useRouter(); // pathname imported above, but useRouter needed for logout
    const pathname = usePathname();
    const updatedGroupIds = useGroupStatus();

    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useFcmToken();

    const [orgBookmarks, setOrgBookmarks] = useState<{ title: string, url: string }[]>([]);
    const [personalBookmarks, setPersonalBookmarks] = useState<{ title: string, url: string }[]>([]);
    const [userGroups, setUserGroups] = useState<{ id: string, name: string }[]>([]);
    const [isBookmarkHover, setIsBookmarkHover] = useState(false);
    const [isGroupHover, setIsGroupHover] = useState(false);

    // Mobile specific states
    const [userOrgs, setUserOrgs] = useState<{ id: string, name: string, role?: string }[]>([]);
    const [isOrgListOpen, setIsOrgListOpen] = useState(false);

    const isAdminPage = pathname.startsWith("/admin");

    useEffect(() => {
        if (!orgId || !user) {
            setOrgBookmarks([]);
            setPersonalBookmarks([]);
            setUserGroups([]);
            setUserOrgs([]);
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

                // 4. Fetch User Orgs for Mobile Menu
                if (orgIds.length > 0) {
                    const orgDataPromises = orgIds.map(async (id) => {
                        const snap = await getDoc(doc(db, "organizations", id));
                        if (!snap.exists()) return [];
                        const orgName = snap.data().name;
                        const orgRole = profiles?.[id]?.role || 'user';

                        if (orgRole === 'super_admin' || orgRole === 'admin') {
                            return [
                                { id, name: orgName, role: 'member' },
                                { id, name: orgName, role: 'admin' }
                            ];
                        }
                        return [{ id, name: orgName, role: 'member' }];
                    });
                    const nested = await Promise.all(orgDataPromises);
                    setUserOrgs(nested.flat() as any);
                }

            } catch (e) {
                console.error("Fetch Nav data error:", e);
            }
        };
        fetchData();
    }, [orgId, user, orgIds, profiles]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push("/");
            setIsMobileOpen(false);
        } catch (error) {
            console.error(error);
        }
    };

    // useRouter hook needs to be imported properly.
    // Wait, useRouter is used in handleLogout but not defined in original destructuring?
    // I added it in the first replacement chunk. Check imports.
    // 'useRouter' is NOT imported in the original file (only usePathname).
    // I need to add useRouter import. It's usually from 'next/navigation'.
    // Let's check imports again. original imports: next/navigation (usePathname).
    // I will add useRouter to imports in a separate check or just assume it compiles if I fix imports.
    // Ah, I missed adding useRouter to the import chunk. I should do it.
    // However, I can't edit the first chunk now easily.
    // I can modify the import line in this chunk if it was here, but it's way up.
    // Actually, line 6 is `import { usePathname } from "next/navigation";`.
    // I will use a separate replacement for that or just replace it here if I can? No too far.
    // I will add a Separate Chunk for imports fix.

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

    // Helper to render desktop menu content
    const DesktopMenuContent = () => (
        <>
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
        </>
    );

    return (
        <>
            {/* Desktop View */}
            <div className="nav-desktop" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>
                <DesktopMenuContent />
            </div>

            {/* Mobile Trigger */}
            {/* Mobile Trigger Wrapper */}
            <div className="nav-mobile-trigger" style={{ display: 'none', alignItems: 'center', gap: '0.8rem' }}>
                {!pathname.startsWith("/admin/super") && (
                    <span style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-main)', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {userOrgs.find(o => o.id === orgId)?.name}
                    </span>
                )}
                <button
                    className="nav-mobile-btn"
                    onClick={() => setIsMobileOpen(true)}
                    aria-label="Open menu"
                    style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        color: 'var(--text-main)',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
            </div>

            {/* Mobile Overlay Menu */}
            {mounted && isMobileOpen && createPortal(
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    width: '100vw',
                    height: '100vh',
                    zIndex: 9999,
                    background: 'var(--bg-main)',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'fadeIn 0.2s ease-out',
                    overflowY: 'auto'
                }}>


                    {/* Header - Padding adjusted to match Navbar position roughly (1.3rem top/bottom?) 
                       Navbar margin 0.5rem + padding 0.8rem = 1.3rem from top.
                       Here we use padding 1.3rem to push content down.
                    */}
                    <div style={{ padding: '1.3rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0, color: 'var(--primary)' }}>EduHub</h2>
                        <button
                            onClick={() => setIsMobileOpen(false)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '0.5rem',
                                cursor: 'pointer',
                                color: 'var(--text-main)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginRight: '-0.5rem' // Adjust for visual alignment with hamburger
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    {/* Menu Body */}
                    <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        {/* 1. Main Nav Items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            {navItems.map((item, i) => {
                                const isLinkDisabled = (!isAdminPage && (orgIds.length === 0 || orgStatus === 'suspended')) || (isAdminPage && orgStatus === 'suspended' && !pathname.startsWith("/admin/super"));
                                return (
                                    <Link
                                        key={i}
                                        href={isLinkDisabled ? '#' : item.href}
                                        onClick={() => !isLinkDisabled && setIsMobileOpen(false)}
                                        style={{
                                            textDecoration: 'none',
                                            color: item.active ? 'var(--primary)' : 'var(--text-main)',
                                            fontSize: '1.1rem',
                                            fontWeight: item.active ? '700' : '500',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            opacity: isLinkDisabled ? 0.5 : 1
                                        }}
                                    >
                                        <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>

                        <div style={{ height: '1px', background: 'var(--border-glass)', margin: '0.5rem 0' }}></div>

                        {/* 2. Org Switcher */}
                        {userOrgs.length > 0 && (
                            <div className="glass-card" style={{ padding: '1rem', borderRadius: '12px' }}>
                                <div
                                    onClick={() => setIsOrgListOpen(!isOrgListOpen)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isOrgListOpen ? '1rem' : 0 }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', fontWeight: 'bold' }}>
                                        <span>🏢</span>
                                        <span>{userOrgs.find(o => o.id === orgId)?.name || "조직 선택"}</span>
                                    </div>
                                    <span style={{ transition: 'transform 0.2s', transform: isOrgListOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                                </div>

                                {isOrgListOpen && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem', animation: 'fadeIn 0.3s' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', padding: '0 0.5rem 0.5rem 0.5rem' }}>조직 전환</div>
                                        {userOrgs.map(org => {
                                            const isCurrentOrg = org.id === orgId;
                                            const isSystemAdminPath = pathname.startsWith('/admin/super');
                                            const isOrgAdminPath = pathname.startsWith('/admin') && !isSystemAdminPath;

                                            let isActive = false;
                                            if (isCurrentOrg) {
                                                if (org.role === 'admin') isActive = isOrgAdminPath;
                                                else isActive = !pathname.startsWith('/admin');
                                            }

                                            return (
                                                <div key={`${org.id}-${org.role}`}
                                                    onClick={() => {
                                                        setActiveOrgId(org.id);
                                                        setIsOrgListOpen(false);
                                                        setIsMobileOpen(false);

                                                        if (org.role === 'admin') router.push('/admin/org');
                                                        else router.push('/');
                                                    }}
                                                    style={{
                                                        padding: '0.8rem', borderRadius: '8px',
                                                        background: isActive ? 'var(--bg-surface)' : 'transparent',
                                                        cursor: 'pointer', fontSize: '0.9rem',
                                                        border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
                                                        transition: 'all 0.2s',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: isActive ? 'bold' : 'normal', color: isActive ? 'var(--primary)' : 'inherit' }}>{org.name}</span>
                                                        <span style={{ color: org.role === 'admin' ? (isActive ? 'var(--primary)' : '#ff6b6b') : 'var(--text-dim)', fontSize: '0.75rem' }}>
                                                            {org.role === 'admin' ? '[관리자]' : '[구성원]'}
                                                        </span>
                                                    </div>
                                                    {isActive && <span style={{ color: 'var(--primary)' }}>✔</span>}
                                                </div>
                                            );
                                        })}

                                        {isSuperAdmin && (
                                            <>
                                                <div style={{ height: '1px', background: 'var(--border-glass)', margin: '0.5rem 0' }}></div>
                                                <Link href="/admin/super" onClick={() => { setIsOrgListOpen(false); setIsMobileOpen(false); }}
                                                    style={{
                                                        padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        color: pathname.startsWith('/admin/super') ? 'var(--primary)' : '#ff6b6b',
                                                        textDecoration: 'none', fontWeight: 'bold', fontSize: '0.9rem',
                                                        background: pathname.startsWith('/admin/super') ? 'var(--bg-surface)' : 'transparent',
                                                        borderRadius: '8px',
                                                        border: pathname.startsWith('/admin/super') ? '1px solid var(--primary)' : '1px solid transparent',
                                                        transition: 'all 0.2s'
                                                    }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span>⚙️</span>
                                                        <span>EduHub 시스템 관리</span>
                                                    </div>
                                                    {pathname.startsWith('/admin/super') && <span style={{ color: 'var(--primary)' }}>✔</span>}
                                                </Link>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 3. User Actions (Theme, Profile, Logout) - Pushed to Bottom */}
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="glass-card" style={{ padding: '1.2rem', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <button onClick={toggleTheme} className="glass-card" style={{ padding: '0.8rem', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {theme === 'auto' ? '🌓' : (theme === 'light' ? '☀️' : '🌙')}
                                    </button>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>{activeProfile?.name || user.displayName || "사용자"}님</span>
                                        {activeProfile?.department && <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{activeProfile.department}</span>}
                                    </div>
                                </div>
                                <button onClick={handleLogout} style={{ padding: '0.5rem 0.8rem', fontSize: '0.9rem', color: '#ff4444', border: '1px solid var(--border-glass)', borderRadius: '8px', background: 'transparent', cursor: 'pointer' }}>
                                    로그아웃
                                </button>
                            </div>
                        </div>

                    </div>
                </div>,
                document.body
            )}

            <style jsx>{`
               @keyframes fadeIn {
                   from { opacity: 0; }
                   to { opacity: 1; }
               }
               @media (max-width: 900px) {
                   .nav-mobile-trigger { display: flex !important; }
               }
            `}</style>
        </>
    );
}

