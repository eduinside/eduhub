"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NavMenu from "./navbar/NavMenu";
import OrgSelector from "./navbar/OrgSelector";
import UserMenu from "./navbar/UserMenu";

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
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <Link
                    href={pathname.startsWith("/admin/super") ? "/admin/super" : pathname.startsWith("/admin/org") ? "/admin/org" : "/"}
                    style={{ textDecoration: 'none', fontWeight: 'bold', fontSize: '1.2rem', color: isAdminPage ? 'var(--accent)' : 'var(--primary)', letterSpacing: '-0.5px' }}
                >
                    EduHub {isAdminPage && <span style={{ fontSize: '0.75rem', verticalAlign: 'middle', marginLeft: '0.4rem', background: 'var(--accent)', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>Admin</span>}
                </Link>

                <NavMenu />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
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
                @media (max-width: 768px) {
                    nav.glass-panel {
                        margin: 0.5rem !important;
                        padding: 0.5rem 1rem !important;
                        flex-wrap: nowrap !important;
                        gap: 0.5rem !important;
                    }
                    nav.glass-panel > div:first-child {
                        gap: 0.75rem !important;
                        flex-shrink: 1;
                        min-width: 0;
                    }
                    nav.glass-panel > div:last-child {
                        gap: 0.5rem !important;
                        flex-shrink: 0;
                    }
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
