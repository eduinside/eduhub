"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NoticePage() {
    const router = useRouter();

    useEffect(() => {
        // 오늘 날짜를 YYYYMMDD 형식으로 변환
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}${month}${day}`;

        // 오늘 날짜 페이지로 리다이렉트
        router.replace(`/notice/${dateStr}`);
    }, [router]);

    return (
        <div style={{ padding: '4rem', textAlign: 'center' }}>
            <p>공지사항 페이지로 이동 중...</p>
        </div>
    );
}
