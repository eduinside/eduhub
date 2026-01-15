"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onIdTokenChanged, User, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

interface UserProfile {
    name: string;
    department: string;
    contact: string;
    role?: string;
}

interface AuthContextType {
    user: User | null;
    orgId: string;
    orgIds: string[];
    role: string; // Global role (e.g., 'superadmin' or 'user')
    isAdmin: boolean; // Admin of the CURRENT active organization
    isSuperAdmin: boolean;
    loading: boolean;
    activeOrgId: string;
    setActiveOrgId: (id: string) => void;
    theme: 'dark' | 'light' | 'auto';
    toggleTheme: () => void;
    profiles: Record<string, UserProfile>; // 조직별 프로필 정보
    activeProfile: UserProfile | null;    // 현재 선택된 조직의 프로필
    orgStatus: 'active' | 'suspended';   // 현재 조직의 운영 상태
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    orgId: "",
    orgIds: [],
    role: "user",
    isAdmin: false,
    isSuperAdmin: false,
    loading: true,
    activeOrgId: "",
    setActiveOrgId: () => { },
    theme: 'dark',
    toggleTheme: () => { },
    profiles: {},
    activeProfile: null,
    orgStatus: 'active',
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState("user");
    const [orgIds, setOrgIds] = useState<string[]>([]);
    const [activeOrgId, setActiveOrgId] = useState("");
    const [loading, setLoading] = useState(true);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('auto');
    const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
    const [orgStatus, setOrgStatus] = useState<'active' | 'suspended'>('active');

    useEffect(() => {
        if (!activeOrgId) {
            setOrgStatus('active');
            return;
        }
        const unsubOrg = onSnapshot(doc(db, "organizations", activeOrgId), (snap) => {
            if (snap.exists()) {
                setOrgStatus(snap.data().status || 'active');
            }
        });
        return () => unsubOrg();
    }, [activeOrgId]);

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | 'auto';
        if (savedTheme) {
            setTheme(savedTheme);
        }
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'auto') {
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
            const applySystem = (e: MediaQueryListEvent | MediaQueryList) => {
                root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            };
            applySystem(systemDark);
            systemDark.addEventListener('change', applySystem);
            return () => systemDark.removeEventListener('change', applySystem);
        } else {
            root.setAttribute('data-theme', theme);
        }
    }, [theme]);

    useEffect(() => {
        const unsubscribe = onIdTokenChanged(auth, async (user) => {
            setLoading(true);
            if (user) {
                setUser(user);
                const userRef = doc(db, "users", user.uid);
                const unsubUserDoc = onSnapshot(userRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const ids = data.orgIds || (data.orgId ? [data.orgId] : []);
                        setOrgIds(ids);
                        setRole(data.role || "user");
                        setIsSuperAdmin(data.role === "superadmin");
                        setProfiles(data.profiles || {});

                        if (!activeOrgId && ids.length > 0) {
                            setActiveOrgId(ids[0]);
                        }
                    } else {
                        // DB 문서가 없는 '유령 회원' 대응
                        // 단, 방금 가입 중인 유저를 위해 약간의 유예 시간을 둠
                        const now = Date.now();
                        const creationTime = user.metadata.creationTime ? new Date(user.metadata.creationTime).getTime() : 0;

                        // 생성된 지 15초 이상 지났는데 문서가 없다면 강제 로그아웃
                        if (creationTime > 0 && (now - creationTime > 15000)) {
                            console.warn("User document missing. Forced logout for consistency.");
                            signOut(auth);
                        }

                        setOrgIds([]);
                        setRole("user");
                        setIsSuperAdmin(false);
                        setProfiles({});
                    }
                    setLoading(false);
                });

                return () => unsubUserDoc();
            } else {
                setUser(null);
                setOrgIds([]);
                setActiveOrgId("");
                setRole("user");
                setIsSuperAdmin(false);
                setProfiles({});
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [activeOrgId]);

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : (theme === 'light' ? 'auto' : 'dark');
        setTheme(nextTheme);
        localStorage.setItem('theme', nextTheme);
    };

    const activeProfile = profiles[activeOrgId] || null;
    const currentOrgRole = activeProfile?.role || "user";
    const isAdmin = currentOrgRole === "admin" || currentOrgRole === "superadmin";

    return (
        <AuthContext.Provider value={{
            user,
            orgId: activeOrgId,
            orgIds,
            role,
            isAdmin,
            isSuperAdmin,
            loading,
            activeOrgId,
            setActiveOrgId,
            theme,
            toggleTheme,
            profiles,
            activeProfile,
            orgStatus
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
