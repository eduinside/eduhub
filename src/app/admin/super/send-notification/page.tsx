'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function SendNotificationPage() {
    const { user, isSuperAdmin } = useAuth();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [target, setTarget] = useState('all_users');
    const [targetType, setTargetType] = useState('topic'); // 'topic' or 'token'
    const [status, setStatus] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSending(true);
        setStatus('전송 중...');

        try {
            const payload: any = {
                title,
                body,
                [targetType]: target,
                url: '/notices' // Default link
            };

            const res = await fetch('/api/fcm/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setStatus(`✅ 전송 성공! (ID: ${data.messageId})`);
                // Clear form
                setTitle('');
                setBody('');
            } else {
                setStatus(`❌ 실패: ${data.error}`);
            }
        } catch (err) {
            setStatus('❌ 요청 실패');
        } finally {
            setIsSending(false);
        }
    };

    if (!user) return null;

    // Simple protection logic (Client-side)
    if (!isSuperAdmin) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>접근 권한이 없습니다.</h2>
                <button onClick={() => router.push('/')} className="btn-primary" style={{ marginTop: '1rem' }}>홈으로</button>
            </div>
        );
    }

    return (
        <div className="bg-main text-main min-h-screen">
            <Navbar />
            <main className="app-container" style={{ maxWidth: '600px', margin: '2rem auto' }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>📢 푸시 알림 전송 (테스트)</h1>

                <form onSubmit={handleSend} className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>제목</label>
                        <input
                            value={title} onChange={e => setTitle(e.target.value)}
                            className="glass-card" style={{ width: '100%', padding: '0.8rem' }}
                            placeholder="알림 제목" required
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>내용</label>
                        <textarea
                            value={body} onChange={e => setBody(e.target.value)}
                            className="glass-card" style={{ width: '100%', padding: '0.8rem', minHeight: '100px' }}
                            placeholder="알림 내용" required
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>전송 타입</label>
                            <select
                                value={targetType} onChange={e => setTargetType(e.target.value)}
                                className="glass-card" style={{ width: '100%', padding: '0.8rem' }}
                            >
                                <option value="topic">토픽 (Topic)</option>
                                <option value="token">개인 토큰 (Token)</option>
                            </select>
                        </div>
                        <div style={{ flex: 2 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>타겟 ({targetType})</label>
                            <input
                                value={target} onChange={e => setTarget(e.target.value)}
                                className="glass-card" style={{ width: '100%', padding: '0.8rem' }}
                                placeholder={targetType === 'topic' ? 'all_users' : 'FCM Token'}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        style={{ padding: '1rem', fontSize: '1rem', fontWeight: 'bold', marginTop: '1rem' }}
                        disabled={isSending}
                    >
                        {isSending ? '전송 중...' : '알림 전송'}
                    </button>

                    {status && (
                        <div className="glass-card" style={{ padding: '1rem', background: status.includes('성공') ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)' }}>
                            {status}
                        </div>
                    )}
                </form>
            </main>
        </div>
    );
}
