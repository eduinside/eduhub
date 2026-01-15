"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, storage } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRouter } from "next/navigation";

interface Resource {
    id: string;
    name: string;
    location: string;
    approvalRequired: boolean; // true: 관리자 승인, false: 자동 승인
    orgId: string;
    managers?: string[]; // 관리자 UID 목록
    imageUrl?: string;
}

interface OrgUser {
    uid: string;
    name: string;
    email: string;
}

interface TimeSlot {
    name: string;
    start: string;
    end: string;
}

export default function ResourcesAdminPage() {
    const { user, orgId, isAdmin, isSuperAdmin, loading } = useAuth();
    const { showToast } = useToast();
    const router = useRouter();

    const [resources, setResources] = useState<Resource[]>([]);
    const [users, setUsers] = useState<OrgUser[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingResource, setEditingResource] = useState<Resource | null>(null);

    // Global Settings (TimeTable)
    const [timeTable, setTimeTable] = useState<TimeSlot[]>([
        { name: "1교시", start: "09:00", end: "09:40" },
        { name: "2교시", start: "10:00", end: "10:40" },
        { name: "3교시", start: "11:00", end: "11:40" },
        { name: "4교시", start: "12:00", end: "12:40" },
    ]);

    // Form States
    const [name, setName] = useState("");
    const [location, setLocation] = useState("");
    const [approvalRequired, setApprovalRequired] = useState(false);
    const [managers, setManagers] = useState<string[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>("");
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (!loading && !user) router.push('/');
        if (!loading && user && !isAdmin && !isSuperAdmin) {
            showToast("관리자 권한이 필요합니다.", "error");
            router.push('/');
        }
    }, [user, loading, isAdmin, isSuperAdmin]);

    useEffect(() => {
        if (!orgId) return;

        // 조직 설정(시간표) 로드
        const orgRef = doc(db, "organizations", orgId);
        const unsubOrg = onSnapshot(orgRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.timeTable && Array.isArray(data.timeTable)) {
                    const sorted = data.timeTable.sort((a: TimeSlot, b: TimeSlot) => a.start.localeCompare(b.start));
                    setTimeTable(sorted);
                }
            }
        });

        // 자원 목록 로드
        const qResources = query(collection(db, "resources"), where("orgId", "==", orgId));
        const unsubResources = onSnapshot(qResources, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Resource[];
            // 정렬: 위치 오름차순 -> 이름 오름차순
            list.sort((a, b) => {
                const locDiff = a.location.localeCompare(b.location);
                if (locDiff !== 0) return locDiff;
                return a.name.localeCompare(b.name);
            });
            setResources(list);
        });

        // 사용자 목록 로드
        const qUsers = query(collection(db, "users"), where("orgIds", "array-contains", orgId));
        getDocs(qUsers).then(snapshot => {
            const list = snapshot.docs.map(doc => {
                const data = doc.data();
                const profile = data.profiles?.[orgId];
                return {
                    uid: doc.id,
                    name: profile?.name || data.name || "이름 없음",
                    email: data.email
                };
            }) as OrgUser[];
            setUsers(list);
        });

        return () => { unsubOrg(); unsubResources(); };
    }, [orgId]);

    const saveTimeTable = async () => {
        if (!orgId) return;
        for (const slot of timeTable) {
            if (!slot.name || !slot.start || !slot.end) {
                showToast("모든 교시 정보를 입력해주세요.", "error");
                return;
            }
            if (slot.start >= slot.end) {
                showToast(`[${slot.name}] 종료 시간이 시작 시간보다 빨라야 합니다.`, "error");
                return;
            }
        }
        try {
            await updateDoc(doc(db, "organizations", orgId), { timeTable: timeTable });
            showToast("시간표 설정이 저장되었습니다.", "success");
        } catch (err) {
            console.error(err);
            showToast("설정 저장 중 오류가 발생했습니다.", "error");
        }
    };

    const addTimeSlot = () => setTimeTable([...timeTable, { name: "", start: "", end: "" }]);
    const removeTimeSlot = (index: number) => setTimeTable(prev => prev.filter((_, i) => i !== index));
    const updateTimeSlot = (index: number, field: keyof TimeSlot, value: string) => {
        const newTable = [...timeTable];
        newTable[index] = { ...newTable[index], [field]: value };
        setTimeTable(newTable);
    };

    const openCreateModal = () => {
        setEditingResource(null);
        setName("");
        setLocation("");
        setApprovalRequired(false);
        setManagers([]);
        setImageFile(null);
        setPreviewUrl("");
        setIsModalOpen(true);
    };

    const openEditModal = (res: Resource) => {
        setEditingResource(res);
        setName(res.name);
        setLocation(res.location);
        setApprovalRequired(res.approvalRequired);
        setManagers(res.managers || []);
        setImageFile(null);
        setPreviewUrl(res.imageUrl || "");
        setIsModalOpen(true);
    };

    const toggleManager = (uid: string) => {
        setManagers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB 제한
                showToast("파일 크기는 5MB 이하여야 합니다.", "error");
                return;
            }
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId) return;

        if (approvalRequired && managers.length === 0) {
            showToast("'확인 후 예약' 방식은 반드시 담당 관리자를 1명 이상 지정해야 합니다.", "error");
            return;
        }

        try {
            setIsUploading(true);
            let imageUrl = editingResource?.imageUrl || "";

            if (imageFile) {
                const storageRef = ref(storage, `resources/${orgId}/${Date.now()}_${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            const data = {
                name,
                location,
                approvalRequired,
                orgId,
                managers,
                imageUrl
            };

            if (editingResource) {
                await updateDoc(doc(db, "resources", editingResource.id), data);
                showToast("자원 정보가 수정되었습니다.", "success");
            } else {
                await addDoc(collection(db, "resources"), data);
                showToast("새 자원이 등록되었습니다.", "success");
            }
            setIsModalOpen(false);
        } catch (err) {
            console.error(err);
            showToast("저장 중 오류가 발생했습니다.", "error");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("정말 삭제하시겠습니까? 관련 예약 데이터는 유지되지만 자원 선택이 불가능해집니다.")) return;
        try {
            await deleteDoc(doc(db, "resources", id));
            showToast("자원이 삭제되었습니다.", "info");
        } catch (err) {
            console.error(err);
            showToast("삭제 중 오류가 발생했습니다.", "error");
        }
    };

    if (loading) return null;

    return (
        <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: 'bold' }}>🛠️ 자원 관리</h1>
                    <p style={{ color: 'var(--text-dim)' }}>조직 내 공용 자원 및 예약 규칙을 설정합니다.</p>
                </div>
                <button className="btn-primary" onClick={openCreateModal}>+ 새 자원 등록</button>
            </div>

            {/* 시간표 설정 패널 */}
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.4rem', color: 'var(--accent)' }}>🕓 일과표(교시) 설정</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>예약의 기준이 되는 교시별 시간을 설정합니다.</p>
                    </div>
                    <button onClick={saveTimeTable} className="glass-card" style={{ padding: '0.6rem 1.2rem', fontWeight: 'bold' }}>교시 설정 저장</button>
                </div>

                <div className="glass-card" style={{ padding: '0.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                <th style={{ padding: '0.8rem', textAlign: 'left', fontSize: '0.9rem' }}>교시명 (예: 1교시)</th>
                                <th style={{ padding: '0.8rem', textAlign: 'left', fontSize: '0.9rem' }}>시작 시간</th>
                                <th style={{ padding: '0.8rem', textAlign: 'left', fontSize: '0.9rem' }}>종료 시간</th>
                                <th style={{ padding: '0.8rem', width: '60px' }}>삭제</th>
                            </tr>
                        </thead>
                        <tbody>
                            {timeTable.map((slot, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            type="text"
                                            value={slot.name}
                                            onChange={e => updateTimeSlot(idx, 'name', e.target.value)}
                                            placeholder="교시명"
                                            className="glass-card"
                                            style={{ width: '100%', padding: '0.5rem', border: 'none' }}
                                        />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            type="time"
                                            value={slot.start}
                                            onChange={e => updateTimeSlot(idx, 'start', e.target.value)}
                                            className="glass-card"
                                            style={{ width: '100%', padding: '0.5rem', border: 'none' }}
                                        />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            type="time"
                                            value={slot.end}
                                            onChange={e => updateTimeSlot(idx, 'end', e.target.value)}
                                            className="glass-card"
                                            style={{ width: '100%', padding: '0.5rem', border: 'none' }}
                                        />
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                        <button onClick={() => removeTimeSlot(idx)} className="glass-card" style={{ color: 'var(--accent)', padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '99px' }}>삭제</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button onClick={addTimeSlot} style={{ width: '100%', padding: '0.8rem', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer', borderTop: '1px solid var(--border-glass)' }}>
                        + 교시 추가
                    </button>
                </div>
            </div>

            {/* 자원 목록 - 그리드 뷰 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                {resources.length === 0 ? (
                    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)', gridColumn: '1 / -1' }}>
                        등록된 자원이 없습니다. 우측 상단 버튼을 눌러 추가하세요.
                    </div>
                ) : (
                    resources.map(res => (
                        <div key={res.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {res.imageUrl ? (
                                        <img src={res.imageUrl} alt={res.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontSize: '2rem' }}>🏢</span>
                                    )}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem', color: 'var(--primary)' }}>{res.name}</h3>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>📍 {res.location}</p>
                                    <p style={{ fontSize: '0.85rem', color: res.approvalRequired ? 'var(--accent)' : 'var(--success)' }}>
                                        {res.approvalRequired ? "🔒 확인 후 예약" : "⚡ 즉시 예약"}
                                    </p>
                                </div>
                            </div>

                            {res.managers && res.managers.length > 0 && (
                                <div style={{ fontSize: '0.85rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                                    <strong>👑 담당자:</strong> {users.filter(u => res.managers?.includes(u.uid)).map(u => u.name).join(", ")}
                                </div>
                            )}

                            <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button onClick={() => openEditModal(res)} className="glass-card" style={{ padding: '0.5rem 1rem' }}>수정</button>
                                <button onClick={() => handleDelete(res.id)} className="glass-card" style={{ padding: '0.5rem 1rem', color: 'var(--accent)', borderColor: 'rgba(255, 100, 100, 0.3)', borderRadius: '99px' }}>삭제</button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '600px', padding: '2.5rem', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>{editingResource ? "자원 수정" : "새 자원 등록"}</h2>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            {/* 이미지 업로드 */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>자원 사진 (선택)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-glass)' }}>
                                        {previewUrl ? (
                                            <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <span style={{ fontSize: '1.5rem', opacity: 0.5 }}>📷</span>
                                        )}
                                    </div>
                                    <input type="file" accept="image/*" onChange={handleImageChange} className="glass-card" style={{ flex: 1, padding: '0.5rem' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>자원 이름</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="예: 대회의실, 노트북 1번" className="glass-card" style={{ width: '100%', padding: '0.8rem' }} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>위치</label>
                                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="예: 본관 2층, 기자재실" className="glass-card" style={{ width: '100%', padding: '0.8rem' }} required />
                            </div>

                            {/* 관리자 지정 */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>자원 담당 관리자 지정</label>
                                <div className="glass-card" style={{ maxHeight: '150px', overflowY: 'auto', padding: '0.5rem' }}>
                                    {users.length > 0 ? users.map(u => (
                                        <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.5rem', borderBottom: '1px solid var(--border-glass)' }}>
                                            <input
                                                type="checkbox"
                                                checked={managers.includes(u.uid)}
                                                onChange={() => toggleManager(u.uid)}
                                                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>{u.name} <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginLeft: '0.3rem' }}>({u.email})</span></span>
                                        </div>
                                    )) : (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                            지정 가능한 사용자가 없습니다.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>예약 방식</label>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input type="radio" checked={!approvalRequired} onChange={() => setApprovalRequired(false)} />
                                        즉시 예약
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input type="radio" checked={approvalRequired} onChange={() => setApprovalRequired(true)} />
                                        확인 후 예약
                                    </label>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                                    {approvalRequired ? "관리자가 승인해야 예약이 확정됩니다." : "중복된 시간이 없다면 즉시 예약됩니다."}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="glass-card" style={{ flex: 1, padding: '1rem' }} disabled={isUploading}>취소</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '1rem' }} disabled={isUploading}>
                                    {isUploading ? "업로드 중..." : "저장"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}
