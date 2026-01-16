"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { useToast } from "@/context/ToastContext";
import { useRouter, usePathname } from "next/navigation";
import { formatDate } from "@/utils/dateUtils";

interface Resource {
    id: string;
    name: string;
    location: string;
    approvalRequired: boolean; // false: 즉시 예약, true: 확인 후 예약
    orgId: string;
    imageUrl?: string;
    managers?: string[];
    order?: number;
}

interface Reservation {
    id: string;
    resourceId: string;
    resourceName: string;
    userId: string;
    userName: string;
    date: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    status: 'pending' | 'approved' | 'rejected';
    purpose: string;
}

interface TimeSlot {
    name: string;
    start: string;
    end: string;
}

const toYYYYMMDD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function ReservationsPage() {
    const { user, orgId, loading: authLoading } = useAuth();
    const { showToast } = useToast();

    // Dynamic page title
    useEffect(() => {
        document.title = "예약현황 - EduHub";
    }, []);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push(`/?redirect=${encodeURIComponent(pathname)}`);
        }
    }, [user, authLoading, pathname, router]);

    const [resources, setResources] = useState<Resource[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [timeTable, setTimeTable] = useState<TimeSlot[]>([]);

    const [currentDate, setCurrentDate] = useState(new Date());
    const [weekDates, setWeekDates] = useState<Date[]>([]);
    const [selectedDateStr, setSelectedDateStr] = useState(toYYYYMMDD(new Date()));
    const [nowTimeStr, setNowTimeStr] = useState("");

    const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

    const [targetResId, setTargetResId] = useState("");
    const [startPeriodIdx, setStartPeriodIdx] = useState<number>(0);
    const [endPeriodIdx, setEndPeriodIdx] = useState<number>(0);
    const [reservePurpose, setReservePurpose] = useState("");

    const [myPendingResvs, setMyPendingResvs] = useState<Reservation[]>([]);
    const [orgUserName, setOrgUserName] = useState("");

    // Highlight State
    const [highlightResvId, setHighlightResvId] = useState("");

    // Tooltip State
    const [tooltipData, setTooltipData] = useState<{ resv: Reservation, x: number, y: number } | null>(null);

    useEffect(() => {
        const updateNow = () => {
            const now = new Date();
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            setNowTimeStr(`${h}:${m}`);
        };
        updateNow();
        const interval = setInterval(updateNow, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!orgId || !user) return;

        getDoc(doc(db, "users", user.uid)).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                const profileName = data.profiles?.[orgId]?.name;
                setOrgUserName(profileName || user.displayName || "사용자");
            } else {
                setOrgUserName(user.displayName || "사용자");
            }
        });

        const orgRef = doc(db, "organizations", orgId);
        getDoc(orgRef).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.timeTable && Array.isArray(data.timeTable)) {
                    const sorted = data.timeTable.sort((a: TimeSlot, b: TimeSlot) => a.start.localeCompare(b.start));
                    setTimeTable(sorted);
                }
            }
        });

        const q = query(collection(db, "resources"), where("orgId", "==", orgId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Resource[];
            list.sort((a, b) => (a.order || 999999) - (b.order || 999999));
            setResources(list);
        });

        const qResv = query(collection(db, "reservations"), where("orgId", "==", orgId));
        const unsubResv = onSnapshot(qResv, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[];
            // 현재 존재하는 자원 목록의 ID들만 추출 가능하게 잠시 대기하거나,
            // 렌더링 시점에 필터링하도록 구성 (여기서는 가져올 때 resources 상태를 아직 보장할 수 없으므로 렌더링 필터 권장)
            // 하지만 사용자 요청대로 데이터 정리를 위해 resources가 갱신될 때마다 필터링된 상태를 유지하도록 구성
            setReservations(list);
        });

        return () => { unsubscribe(); unsubResv(); };
    }, [orgId, user]);

    useEffect(() => {
        if (!user || resources.length === 0 || reservations.length === 0) return;
        const myManagedResIds = resources.filter(r => r.managers?.includes(user.uid)).map(r => r.id);
        const pending = reservations.filter(r =>
            r.status === 'pending' && myManagedResIds.includes(r.resourceId)
        );
        pending.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
        setMyPendingResvs(pending);
    }, [user, resources, reservations]);

    useEffect(() => {
        const startOfWeek = new Date(currentDate);
        const day = startOfWeek.getDay() || 7;
        if (day !== 1) startOfWeek.setHours(-24 * (day - 1));
        else startOfWeek.setHours(0, 0, 0, 0);

        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            dates.push(d);
        }
        setWeekDates(dates);

        const todayStr = toYYYYMMDD(new Date());
        // 만약 selectedDateStr가 새로 생성된 주간에 포함되어 있다면 유지, 아니면 첫날로
        // 단, highlightResvId가 있다면(복사 직후) 강제 이동 로직을 타지 않도록 주의 (이미 이동시켰으므로 이 이펙트는 안전하게 동작해야 함)
        const inWeek = dates.some(d => toYYYYMMDD(d) === selectedDateStr);

        if (!inWeek) {
            // 주간 이동 시에는 해당 주간의 첫날 또는 오늘로 기본 선택하는 것이 UX상 좋음 (단, 명시적 선택이 없었다면)
            // 여기서 복사 기능으로 이동한 경우에는 selectedDateStr가 이미 미래 날짜로 세팅되어 있으므로 inWeek가 true일 것임.
            // 따라서 여기 로직은 '사용자가 < > 버튼으로 이동했을 때' 주로 동작
            if (dates.some(d => toYYYYMMDD(d) === todayStr)) {
                setSelectedDateStr(todayStr);
            } else {
                setSelectedDateStr(toYYYYMMDD(dates[0]));
            }
        }

    }, [currentDate]);

    const handleReserve = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !targetResId || timeTable.length === 0) return;

        const targetRes = resources.find(r => r.id === targetResId);
        if (!targetRes) return;

        if (startPeriodIdx > endPeriodIdx) {
            showToast("종료 교시는 시작 교시보다 뒤여야 합니다.", "error");
            return;
        }

        const startPeriod = timeTable[startPeriodIdx];
        const endPeriod = timeTable[endPeriodIdx];
        const finalStartTime = startPeriod.start;
        const finalEndTime = endPeriod.end;

        const conflict = reservations.some(r => {
            if (r.resourceId !== targetResId) return false;
            // Reservation Modifeier: 본인이 수정 중인 예약은 제외
            if (r.date !== selectedDateStr) return false;
            return (r.startTime < finalEndTime) && (r.endTime > finalStartTime) && r.status !== 'rejected';
        });

        if (conflict) {
            showToast("선택하신 시간에 이미 예약이 존재합니다.", "error");
            return;
        }

        try {
            await addDoc(collection(db, "reservations"), {
                resourceId: targetResId,
                resourceName: targetRes.name,
                userId: user.uid,
                userName: orgUserName,
                orgId: orgId,
                date: selectedDateStr,
                startTime: finalStartTime,
                endTime: finalEndTime,
                status: targetRes.approvalRequired ? 'pending' : 'approved',
                purpose: reservePurpose,
                createdAt: new Date().toISOString()
            });
            showToast(targetRes.approvalRequired ? "예약 신청되었습니다. (관리자 승인 대기)" : "예약이 확정되었습니다.", "success");
            setIsReserveModalOpen(false);
            setReservePurpose("");
        } catch (err) {
            console.error(err);
            showToast("예약 중 오류가 발생했습니다.", "error");
        }
    };

    const handleCopyNextWeek = async () => {
        if (!selectedReservation || !user || !orgId) return;

        const [y, m, d] = selectedReservation.date.split('-').map(Number);
        const currentDateObj = new Date(y, m - 1, d);
        currentDateObj.setDate(currentDateObj.getDate() + 7);
        const nextWeekDateStr = toYYYYMMDD(currentDateObj);

        const conflict = reservations.some(r => {
            if (r.resourceId !== selectedReservation.resourceId) return false;
            if (r.date !== nextWeekDateStr) return false;
            return (r.startTime < selectedReservation.endTime) && (r.endTime > selectedReservation.startTime) && r.status !== 'rejected';
        });

        if (conflict) {
            showToast(`다음 주(${nextWeekDateStr}) 동일 시간에 이미 예약이 존재합니다.`, "error");
            return;
        }

        try {
            const docRef = await addDoc(collection(db, "reservations"), {
                resourceId: selectedReservation.resourceId,
                resourceName: selectedReservation.resourceName,
                userId: user.uid,
                userName: orgUserName,
                orgId: orgId,
                date: nextWeekDateStr,
                startTime: selectedReservation.startTime,
                endTime: selectedReservation.endTime,
                status: 'approved',
                purpose: selectedReservation.purpose,
                createdAt: new Date().toISOString()
            });
            showToast(`다음 주(${nextWeekDateStr})로 예약이 복사되었습니다.`, "success");
            setIsDetailModalOpen(false);

            // 날짜 이동 및 강조 표시
            setCurrentDate(currentDateObj); // 해당 주간으로 이동
            setSelectedDateStr(nextWeekDateStr); // 해당 날짜 선택
            setHighlightResvId(docRef.id); // 하이라이트 활성화

            // 3초 후 하이라이트 해제
            setTimeout(() => setHighlightResvId(""), 3000);

        } catch (err) {
            console.error(err);
            showToast("복사 중 오류가 발생했습니다.", "error");
        }
    };

    const handleUpdateReservation = async () => {
        if (!selectedReservation || !user || !orgId) return;
        try {
            await updateDoc(doc(db, "reservations", selectedReservation.id), {
                purpose: reservePurpose
            });
            showToast("예약 내용이 수정되었습니다.", "success");
            setIsDetailModalOpen(false);
        } catch (err) {
            console.error(err);
            showToast("수정 중 오류가 발생했습니다.", "error");
        }
    };

    const handleCancelReservation = async () => {
        if (!selectedReservation) return;
        if (!confirm("예약을 취소하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "reservations", selectedReservation.id));
            showToast("예약이 취소되었습니다.", "info");
            setIsDetailModalOpen(false);
        } catch (err) {
            console.error(err);
            showToast("취소 중 오류가 발생했습니다.", "error");
        }
    };

    const handleApproval = async (resv: Reservation, isApproved: boolean) => {
        if (!confirm(`${isApproved ? '승인' : '반려'} 하시겠습니까?`)) return;
        try {
            await updateDoc(doc(db, "reservations", resv.id), {
                status: isApproved ? 'approved' : 'rejected'
            });
            showToast(`예약이 ${isApproved ? '승인' : '반려'}되었습니다.`, "success");
        } catch (err) {
            console.error(err);
            showToast("처리 중 오류가 발생했습니다.", "error");
        }
    };

    const getCellColor = (resv: Reservation) => {
        if (resv.userId === user?.uid) return 'var(--primary)';
        if (resv.status === 'pending') return 'var(--accent)';
        return 'var(--secondary)';
    };

    const handleCellClick = (resId: string, periodIdx: number) => {
        setTargetResId(resId);
        setStartPeriodIdx(periodIdx);
        setEndPeriodIdx(periodIdx);
        setReservePurpose("");
        setIsReserveModalOpen(true);
    };

    const handleMyReservationClick = (e: React.MouseEvent, resv: Reservation) => {
        e.stopPropagation();
        setTooltipData(null);
        if (resv.userId !== user?.uid) return;

        setSelectedReservation(resv);
        setReservePurpose(resv.purpose);
        setIsDetailModalOpen(true);
    };

    const weekStartStr = weekDates.length > 0 ? formatDate(weekDates[0]) : "";
    const weekEndStr = weekDates.length > 0 ? formatDate(weekDates[weekDates.length - 1]) : "";

    const isCurrentTime = (slot: TimeSlot) => {
        const todayStr = toYYYYMMDD(new Date());
        if (todayStr !== selectedDateStr) return false;
        return nowTimeStr >= slot.start && nowTimeStr <= slot.end;
    };

    const isInstantRes = selectedReservation && resources.find(r => r.id === selectedReservation.resourceId)?.approvalRequired === false;

    const getNextWeekDateDisplay = () => {
        if (!selectedReservation) return "";
        const [y, m, d] = selectedReservation.date.split('-').map(Number);
        const nextDate = new Date(y, m - 1, d);
        nextDate.setDate(nextDate.getDate() + 7);
        return `${nextDate.getMonth() + 1}/${nextDate.getDate()}`;
    };

    if (authLoading) return null;
    if (!orgId) return <div style={{ padding: '4rem', textAlign: 'center' }}>조직에 소속되어 있지 않습니다.</div>;

    return (
        <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <div className="resv-header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗓️ 예약현황</h1>
                    <p style={{ color: 'var(--text-dim)' }}>원하는 날짜와 자원을 선택하여 예약하세요.</p>
                </div>
                <div className="resv-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button onClick={() => {
                        const d = new Date(currentDate);
                        d.setDate(d.getDate() - 7);
                        setCurrentDate(d);
                    }} className="glass-card" style={{ padding: '0.5rem 1rem' }}>&lt; 이전 주</button>

                    <button onClick={() => {
                        setCurrentDate(new Date());
                    }} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>오늘</button>

                    <button onClick={() => {
                        const d = new Date(currentDate);
                        d.setDate(d.getDate() + 7);
                        setCurrentDate(d);
                    }} className="glass-card" style={{ padding: '0.5rem 1rem' }}>다음 주 &gt;</button>

                    <div className="resv-date-text" style={{ fontWeight: 'bold', fontSize: '1.1rem', marginLeft: '0.5rem' }}>{weekStartStr} ~ {weekEndStr}</div>
                </div>
            </div>

            {myPendingResvs.length > 0 && (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', border: '1px solid var(--accent)', background: 'rgba(255, 100, 100, 0.05)' }}>
                    <h3 style={{ color: 'var(--accent)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        🔔 승인 대기중인 예약이 {myPendingResvs.length}건 있습니다
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {myPendingResvs.map(resv => (
                            <div key={resv.id} className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>{resv.resourceName}</span>
                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>{formatDate(resv.date)} / {resv.startTime}~{resv.endTime}</span>
                                    <div style={{ fontSize: '0.9rem', marginTop: '0.2rem' }}>
                                        👤 {resv.userName} : {resv.purpose}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={() => handleApproval(resv, true)} style={{ background: 'var(--success)', border: 'none', color: 'white', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✔</button>
                                    <button onClick={() => handleApproval(resv, false)} style={{ background: 'var(--accent)', border: 'none', color: 'white', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="resv-date-container" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
                {weekDates.map(date => {
                    const dateStr = toYYYYMMDD(date);
                    const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
                    const isActive = selectedDateStr === dateStr;
                    const isToday = toYYYYMMDD(new Date()) === dateStr;

                    const resIds = new Set(resources.map(r => r.id));
                    const hasReservation = reservations.some(r => r.date === dateStr && r.status !== 'rejected' && resIds.has(r.resourceId));

                    return (
                        <button
                            key={dateStr}
                            onClick={() => setSelectedDateStr(dateStr)}
                            className={`resv-date-btn ${isActive ? "btn-primary" : "glass-card"}`}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                borderStyle: isActive ? 'none' : 'solid',
                                borderWidth: isActive ? '0' : '1px',
                                borderColor: isToday ? 'var(--primary)' : 'var(--border-glass)',
                                flex: 1,
                                position: 'relative'
                            }}
                        >
                            <span style={{ fontSize: '0.9rem', opacity: 0.8, color: dayName === '일' ? '#ff6b6b' : dayName === '토' ? '#4dabf7' : 'inherit' }}>{dayName}</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{(date.getMonth() + 1)}/{date.getDate()}</span>
                            {hasReservation && (
                                <div style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: isActive ? 'white' : 'var(--accent)',
                                    opacity: 0.8,
                                    position: 'absolute',
                                    bottom: '8px',
                                    left: '50%',
                                    transform: 'translateX(-50%)'
                                }}></div>
                            )}
                        </button>
                    );
                })}
            </div>
            <style jsx>{`
                .resv-date-btn {
                    padding: 1rem;
                    min-width: 80px;
                }
                @media (max-width: 768px) {
                    .resv-date-container {
                        gap: 0.25rem !important;
                    }
                    .resv-date-btn {
                        padding: 0.6rem 0.2rem !important;
                        min-width: 0 !important;
                        border-radius: 10px !important;
                    }
                    .resv-date-btn span:first-child {
                        font-size: 0.75rem !important;
                        margin-bottom: 0.2rem;
                    }
                    .resv-date-btn span:nth-child(2) {
                        font-size: 0.95rem !important;
                    }
                }
            `}</style>

            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                {resources.length === 0 ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        등록된 자원이 없습니다.
                    </div>
                ) : timeTable.length === 0 ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        시간표(교시)가 설정되지 않았습니다. 관리자에게 문의하세요.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', paddingBottom: '100px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    <th style={{ padding: '1rem', textAlign: 'left', minWidth: '150px', position: 'sticky', left: 0, background: 'var(--bg-panel)', zIndex: 10, borderBottom: '1px solid var(--border-glass)' }}>자원명</th>
                                    {timeTable.map((slot, idx) => (
                                        <th key={idx} style={{
                                            padding: '0.8rem',
                                            borderBottom: '1px solid var(--border-glass)',
                                            textAlign: 'center',
                                            background: isCurrentTime(slot) ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent',
                                            borderLeft: isCurrentTime(slot) ? '2px solid var(--primary)' : 'none',
                                            borderRight: isCurrentTime(slot) ? '2px solid var(--primary)' : 'none',
                                        }}>
                                            <div style={{ fontWeight: 'bold', color: isCurrentTime(slot) ? 'var(--primary)' : 'inherit' }}>{slot.name}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{slot.start}~{slot.end}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {resources.map(res => {
                                    return (
                                        <tr key={res.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                            <td style={{ padding: '1rem', position: 'sticky', left: 0, background: 'var(--bg-panel)', zIndex: 5, borderRight: '1px solid var(--border-glass)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--bg-card)', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                                                        {res.imageUrl ? <img src={res.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>📦</div>}
                                                    </div>
                                                    <div style={{ overflow: 'hidden' }}>
                                                        <div style={{ fontWeight: 'bold', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                                                            {res.name}
                                                            <span
                                                                title={res.approvalRequired ? "확인 후 예약 (관리자 승인이 필요합니다)" : "즉시 예약 (신청 즉시 확정됩니다)"}
                                                                style={{
                                                                    fontSize: '0.7rem',
                                                                    padding: '0.1rem 0.3rem',
                                                                    borderRadius: '4px',
                                                                    background: res.approvalRequired ? 'rgba(255, 107, 107, 0.15)' : 'rgba(56, 217, 169, 0.15)',
                                                                    color: res.approvalRequired ? '#ff6b6b' : '#38d9a9',
                                                                    border: `1px solid ${res.approvalRequired ? '#ff6b6b' : '#38d9a9'}`,
                                                                    cursor: 'help'
                                                                }}
                                                            >
                                                                {res.approvalRequired ? "🔒 승인" : "⚡ 즉시"}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{res.location}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            {timeTable.map((slot, slotIdx) => {
                                                const resvs = reservations.filter(r =>
                                                    r.resourceId === res.id &&
                                                    r.date === selectedDateStr &&
                                                    r.startTime < slot.end && r.endTime > slot.start &&
                                                    r.status !== 'rejected'
                                                );

                                                const isReserved = resvs.length > 0;
                                                const isNow = isCurrentTime(slot);

                                                return (
                                                    <td
                                                        key={`${res.id}-${slotIdx}`}
                                                        style={{
                                                            padding: '0.5rem',
                                                            textAlign: 'center',
                                                            borderRight: '1px solid var(--border-glass)',
                                                            height: '60px',
                                                            cursor: isReserved ? 'default' : 'pointer',
                                                            background: isNow ? 'rgba(var(--primary-rgb), 0.05)' : isReserved ? undefined : 'rgba(255,255,255,0.01)',
                                                            transition: 'background 0.2s',
                                                            position: 'relative',
                                                        }}
                                                        onClick={() => !isReserved && handleCellClick(res.id, slotIdx)}
                                                        className={!isReserved ? "hover-cell" : ""}
                                                    >
                                                        {resvs.map(r => (
                                                            <div
                                                                key={r.id}
                                                                className={`resv-chip ${highlightResvId === r.id ? 'highlight-resv' : ''}`}
                                                                onMouseEnter={(e) => {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setTooltipData({ resv: r, x: rect.left + rect.width / 2, y: rect.bottom + 5 });
                                                                }}
                                                                onMouseLeave={() => setTooltipData(null)}
                                                                onClick={(e) => handleMyReservationClick(e, r)}
                                                                style={{
                                                                    background: getCellColor(r),
                                                                    color: 'white',
                                                                    fontSize: '0.75rem',
                                                                    padding: '0.2rem 0.4rem',
                                                                    borderRadius: '4px',
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    marginBottom: '2px',
                                                                    cursor: r.userId === user?.uid ? 'pointer' : 'help'
                                                                }}>
                                                                {r.userName}
                                                            </div>
                                                        ))}
                                                        {!isReserved && (
                                                            <div style={{ opacity: 0, fontSize: '1.2rem', color: 'var(--text-dim)' }} className="plus-icon">+</div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {tooltipData && (
                <div
                    className="animate-fade"
                    style={{
                        position: 'fixed',
                        top: tooltipData.y,
                        left: tooltipData.x,
                        transform: 'translateX(-50%)',
                        background: 'rgba(30, 30, 35, 0.95)',
                        border: '1px solid var(--border-glass)',
                        color: 'white',
                        padding: '1rem',
                        borderRadius: '8px',
                        zIndex: 9999,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        pointerEvents: 'none',
                        textAlign: 'left',
                        minWidth: '200px',
                        backdropFilter: 'blur(10px)'
                    }}
                >
                    <div style={{ fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>{tooltipData.resv.userName}</div>
                    <div style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>🏷️ {tooltipData.resv.purpose}</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.3rem' }}>🕓 {tooltipData.resv.startTime} ~ {tooltipData.resv.endTime}</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: tooltipData.resv.status === 'pending' ? 'var(--accent)' : 'var(--success)' }}>
                        {tooltipData.resv.status === 'pending' ? '⚠ 승인 대기중' : '✅ 예약 확정됨'}
                    </div>
                    {tooltipData.resv.userId === user?.uid && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'cyan', textAlign: 'right' }}>클릭하여 수정/취소</div>
                    )}
                </div>
            )}

            <style jsx>{`
                @media (max-width: 768px) {
                    .resv-header {
                        flex-direction: column !important;
                        align-items: stretch !important;
                        gap: 1.5rem;
                    }
                    .resv-controls {
                        flex-wrap: wrap;
                        justify-content: space-between;
                    }
                    .resv-date-text {
                        width: 100%;
                        text-align: center;
                        margin-left: 0 !important;
                        margin-top: 0.5rem;
                        display: block;
                    }
                }
                .hover-cell:hover {
                    background: rgba(255,255,255,0.05) !important;
                }
                .hover-cell:hover .plus-icon {
                    opacity: 0.5 !important;
                }
                @keyframes highlightPulse {
                    0% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0.7); transform: scale(1); }
                    50% { box-shadow: 0 0 0 6px rgba(var(--primary-rgb), 0); transform: scale(1.05); }
                    100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb), 0); transform: scale(1); }
                }
                .highlight-resv {
                    animation: highlightPulse 1.5s ease-out infinite;
                    z-index: 10;
                    position: relative;
                    border: 1px solid white !important;
                }
            `}</style>

            {isReserveModalOpen && (
                <div className="modal-overlay" onClick={() => setIsReserveModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '500px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>
                            📅 예약 신청
                            <div style={{ fontSize: '1rem', color: 'var(--primary)', marginTop: '0.5rem' }}>
                                {resources.find(r => r.id === targetResId)?.name} / {formatDate(selectedDateStr)}
                            </div>
                        </h2>
                        <form onSubmit={handleReserve} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>시작 교시</label>
                                    <select
                                        value={startPeriodIdx}
                                        onChange={e => setStartPeriodIdx(Number(e.target.value))}
                                        className="glass-card"
                                        style={{ width: '100%', padding: '0.8rem' }}
                                    >
                                        {timeTable.map((t, i) => (
                                            <option key={i} value={i}>{t.name} ({t.start})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>종료 교시</label>
                                    <select
                                        value={endPeriodIdx}
                                        onChange={e => setEndPeriodIdx(Number(e.target.value))}
                                        className="glass-card"
                                        style={{ width: '100%', padding: '0.8rem' }}
                                    >
                                        {timeTable.map((t, i) => (
                                            <option key={i} value={i}>{t.name} ({t.end})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>사용 목적</label>
                                <input type="text" value={reservePurpose} onChange={e => setReservePurpose(e.target.value)} placeholder="예: 3학년 기획 회의" className="glass-card" style={{ width: '100%', padding: '0.8rem' }} required />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsReserveModalOpen(false)} className="glass-card" style={{ flex: 1, padding: '1rem' }}>취소</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '1rem' }}>신청하기</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDetailModalOpen && selectedReservation && (
                <div className="modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
                    <div className="glass-panel animate-fade" style={{ width: '90%', maxWidth: '500px', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>예약 상세 관리</h2>
                        <div style={{ marginBottom: '1.5rem', lineHeight: '1.6', color: 'var(--text-dim)' }}>
                            <div><strong>자원:</strong> {selectedReservation.resourceName}</div>
                            <div><strong>일시:</strong> {formatDate(selectedReservation.date)} / {selectedReservation.startTime} ~ {selectedReservation.endTime}</div>
                            <div><strong>상태:</strong> {selectedReservation.status === 'pending' ? '승인 대기중' : '승인됨 (즉시 예약)'}</div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)' }}>사용 목적 수정</label>
                            <input type="text" value={reservePurpose} onChange={e => setReservePurpose(e.target.value)} className="glass-card" style={{ width: '100%', padding: '0.8rem' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button onClick={handleUpdateReservation} className="btn-primary" style={{ flex: 1, padding: '1rem' }}>수정 저장</button>
                                {isInstantRes && (
                                    <button onClick={handleCopyNextWeek} className="glass-card" style={{ flex: 1, padding: '1rem' }}>
                                        다음 주({getNextWeekDateDisplay()})로 복사
                                    </button>
                                )}
                            </div>
                            <button onClick={handleCancelReservation} style={{ width: '100%', padding: '1rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer' }}>예약 취소</button>
                        </div>
                        <button onClick={() => setIsDetailModalOpen(false)} style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>닫기</button>
                    </div>
                </div>
            )}
        </main>
    );
}
