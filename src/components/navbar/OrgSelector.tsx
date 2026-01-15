"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useRouter, usePathname } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function OrgSelector() {
    const { user, orgId, orgIds, setActiveOrgId, profiles, isSuperAdmin, orgStatus } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();
    const pathname = usePathname();

    const [userOrgs, setUserOrgs] = useState<{ id: string, name: string, role?: string }[]>([]);
    const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (orgIds.length > 0) {
            const fetchOrgs = async () => {
                const orgData = await Promise.all(orgIds.map(async (id) => {
                    const snap = await getDoc(doc(db, "organizations", id));
                    if (!snap.exists()) return null;
                    const orgRole = profiles[id]?.role || 'user';
                    return { id, name: snap.data().name, role: orgRole };
                }));
                // eslint-disable-next-line react-hooks/exhaustive-deps
                setUserOrgs(orgData.filter(o => o !== null) as { id: string, name: string, role: string }[]);
            };
            fetchOrgs();
        } else {
            setUserOrgs([]);
        }
    }, [orgIds, profiles]); // Keep dependencies as previously used

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOrgDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleOrgSwitch = (id: string, name: string, isAdminMode: boolean = false) => {
        setActiveOrgId(id);
        setIsOrgDropdownOpen(false);
        if (isAdminMode) {
            showToast(`${name} 관리 모드로 전환되었습니다.`, "info");
            router.push("/admin/org");
        } else {
            showToast(`${name} 조직으로 전환되었습니다.`, "info");
            router.push("/");
        }
    };

    if (!user || orgIds.length === 0) return null;

    const currentOrg = userOrgs.find(o => o.id === orgId);

    // If single org and not super admin/admin mode specific requirements, show simple label
    if (userOrgs.length === 1 && !isSuperAdmin && userOrgs[0]?.role !== 'admin') {
        return (
            <div style={{ padding: '0.5rem 0', fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🏢 {currentOrg?.name || "조직"}
                {orgStatus === 'suspended' && <span style={{ fontSize: '0.65rem', color: 'var(--accent)', marginLeft: '0.3rem' }}>[중단됨]</span>}
            </div>
        );
    }

    return (
        <div style={{ position: 'relative' }} ref={dropdownRef}>
            <div
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
                className="glass-card"
                style={{
                    padding: '0.5rem 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', minWidth: '140px',
                    border: (isSuperAdmin && pathname.startsWith("/admin/super")) ? '1px solid var(--accent)' : orgStatus === 'suspended' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                    fontWeight: '600'
                }}
            >
                {pathname.startsWith("/admin/super") ? "⚙️ 최고 관리자" : (
                    <>
                        🏢 {currentOrg?.name || "조직 선택"}
                        {orgStatus === 'suspended' ? (
                            <span style={{ fontSize: '0.65rem', color: 'var(--accent)' }}>[중단됨]</span>
                        ) : (
                            <>
                                {pathname.startsWith("/admin") && !pathname.startsWith("/admin/super") && <span style={{ fontSize: '0.65rem', color: 'var(--accent)' }}>[관리자]</span>}
                                {!pathname.startsWith("/admin") && <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>[구성원]</span>}
                            </>
                        )}
                    </>
                )}
                <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>▼</span>
            </div>

            {isOrgDropdownOpen && (
                <div className="glass-panel animate-fade" style={{
                    position: 'absolute', top: '110%', left: 0, width: '220px', padding: '0.4rem', zIndex: 1000, boxShadow: 'var(--shadow-premium)', border: '1px solid var(--border-glass)'
                }}>
                    <div style={{ padding: '0.4rem', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>조직 전환</div>
                    {userOrgs.map(org => (
                        <div key={org.id}>
                            <div onClick={() => handleOrgSwitch(org.id, org.name, false)} className="dropdown-item" style={{
                                padding: '0.6rem 0.8rem', borderRadius: '8px', cursor: 'pointer',
                                background: org.id === orgId && !pathname.startsWith("/admin/org") && pathname !== "/admin/super" ? 'var(--bg-surface)' : 'transparent',
                                fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <span>{org.name}</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>[구성원]</span>
                            </div>
                            {org.role === 'admin' && (
                                <div onClick={() => handleOrgSwitch(org.id, org.name, true)} className="dropdown-item" style={{
                                    padding: '0.6rem 0.8rem', borderRadius: '8px', cursor: 'pointer',
                                    background: org.id === orgId && pathname.startsWith("/admin/org") ? 'var(--bg-surface)' : 'transparent',
                                    fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <span>{org.name}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 'bold' }}>[관리자]</span>
                                </div>
                            )}
                        </div>
                    ))}
                    {isSuperAdmin && (
                        <>
                            <div style={{ height: '1px', background: 'var(--border-glass)', margin: '0.4rem 0' }}></div>
                            <div onClick={() => { router.push("/admin/super"); setIsOrgDropdownOpen(false); }} className="dropdown-item" style={{ padding: '0.6rem 0.8rem', borderRadius: '8px', cursor: 'pointer', color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                ⚙️ EduHub 시스템 관리
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
