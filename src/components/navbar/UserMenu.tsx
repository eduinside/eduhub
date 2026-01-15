"use client";

import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

export default function UserMenu() {
    const { user, theme, toggleTheme, activeProfile, orgIds } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push("/");
        } catch (error) {
            console.error("Logout Error:", error);
        }
    };

    if (!user) return null;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{ width: '1px', height: '20px', background: 'var(--border-glass)' }}></div>

            <button onClick={toggleTheme} className="glass-card" style={{ padding: '0.5rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '50%' }} title={`현재: ${theme === 'dark' ? '다크' : (theme === 'light' ? '라이트' : '자동')} 모드`}>
                {theme === 'dark' ? '☀️' : (theme === 'light' ? '🖥️' : '🌙')}
            </button>

            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                {!pathname.startsWith("/admin/super") && orgIds.length > 0 && (
                    <Link href="/profile" style={{ cursor: 'pointer', textAlign: 'right', textDecoration: 'none' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: '600' }}>
                            {activeProfile?.name || user.displayName?.split(' ')[0] || "사용자"}님
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>설정</div>
                    </Link>
                )}
                <button onClick={handleLogout} className="glass-card" style={{ padding: '0.35rem 0.7rem', border: 'none', color: 'var(--text-dim)', fontSize: '0.75rem', cursor: 'pointer' }}>
                    로그아웃
                </button>
            </div>
        </div>
    );
}
