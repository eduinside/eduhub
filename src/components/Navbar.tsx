"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavMenu from "./navbar/NavMenu";
import OrgSelector from "./navbar/OrgSelector";
import UserMenu from "./navbar/UserMenu";
import { APP_CONFIG } from "@/config/app";

export default function Navbar() {
    const { user } = useAuth();
    const pathname = usePathname();
    const isAdminPage = pathname.startsWith("/admin");

    if (!user) return null;

    return (
        <nav className="glass-panel" style={{
            margin: '1rem',
            padding: '0.6rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: '0.5rem',
            zIndex: 100,
            border: isAdminPage ? '1px solid var(--accent)' : '1px solid var(--border-glass)'
        }}>
            <div className="nav-left-group" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <Link
                    href={pathname.startsWith("/admin/super") ? "/admin/super" : pathname.startsWith("/admin/org") ? "/admin/org" : "/"}
                    style={{ textDecoration: 'none', fontWeight: 'bold', fontSize: '1.2rem', color: isAdminPage ? 'var(--accent)' : 'var(--primary)', letterSpacing: '-0.5px' }}
                >
                    {APP_CONFIG.APP_NAME} {isAdminPage && <span style={{ fontSize: '0.75rem', verticalAlign: 'middle', marginLeft: '0.4rem', background: 'var(--accent)', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{pathname.startsWith("/admin/super") ? "Super" : "Admin"}</span>}
                </Link>

                <NavMenu />
            </div>

            <div className="nav-right-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <OrgSelector />
                <UserMenu />
            </div>

            <style jsx global>{`
                .dropdown-item {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                }
                .dropdown-item:hover {
                    background: rgba(121, 80, 242, 0.1) !important;
                    color: var(--primary) !important;
                    padding-left: 1.2rem !important;
                    transform: translateX(4px);
                }
                
                /* Desktop/Mobile Visibility Utilities */
                .nav-mobile-btn {
                    display: none !important;
                }
                .nav-desktop {
                    display: flex !important;
                }

                @media (max-width: 900px) {
                    .nav-left-group {
                        width: 100% !important;
                        justify-content: space-between !important;
                    }
                    nav.glass-panel {
                        margin: 0.5rem !important;
                        padding: 0.8rem 1rem !important;
                        gap: 0.5rem !important;
                    }
                    /* Hide desktop menu on tablet/mobile */
                    .nav-desktop {
                        display: none !important;
                    }
                    /* Hide right actions on mobile (moved to hamburger) */
                    .nav-right-actions {
                        display: none !important;
                    }
                    /* Show hamburger button on tablet/mobile */
                    .nav-mobile-btn {
                        display: flex !important;
                        align-items: center;
                        justify-content: center;
                        background: transparent;
                        border: none;
                        padding: 0.5rem;
                        cursor: pointer;
                        color: var(--text-main);
                        border-radius: 8px;
                        transition: background 0.2s;
                    }
                    .nav-mobile-btn:hover {
                        background: rgba(0,0,0,0.05);
                    }
                    
                    /* Adjust layout */
                    .bookmark-dropdown-container, .group-dropdown-container {
                        display: none !important;
                    }
                }
                @media (max-width: 480px) {
                    nav.glass-panel a {
                        font-size: 1rem !important;
                    }
                }
            `}</style>
        </nav>
    );
}
