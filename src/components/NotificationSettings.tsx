'use client';

import { useState, useEffect } from 'react';
import useFcmToken from '@/hooks/useFcmToken';
import { useAuth } from '@/context/AuthContext';

export default function NotificationSettings() {
    const { user } = useAuth();
    const { token, notificationPermissionStatus } = useFcmToken();
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setPermission(Notification.permission);
        }
    }, [notificationPermissionStatus]);

    const requestPermission = async () => {
        setLoading(true);
        setMsg('');
        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            if (result === 'granted') {
                setMsg('알림 권한이 허용되었습니다.');
                // 윈도우 리로드 대신 상태 업데이트로 처리하고 싶지만, 
                // useFcmToken hook이 permission change를 감지하지 못할 수도 있으므로
                // 간단히 hook이 리렌더링되게 유도하거나, 사용자가 새로고침하게 안내.
                // 일단 hook이 notificationPermissionStatus dependency를 가지고 있으므로 괜찮을 듯.
            } else if (result === 'denied') {
                setMsg('알림 권한이 차단되었습니다. 브라우저 설정에서 권한을 허용해주세요.');
            }
        } catch (error) {
            console.error(error);
            setMsg('오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🔔 알림 설정
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>푸시 알림 상태</span>
                    <span style={{
                        fontWeight: 'bold',
                        color: permission === 'granted' ? 'var(--primary)' : (permission === 'denied' ? '#ff6b6b' : 'var(--text-dim)')
                    }}>
                        {permission === 'granted' ? '켜짐 (허용됨)' : (permission === 'denied' ? '꺼짐 (차단됨)' : '꺼짐 (미설정)')}
                    </span>
                </div>

                {permission !== 'granted' && (
                    <button
                        onClick={requestPermission}
                        className="btn-primary"
                        disabled={loading}
                        style={{ padding: '0.8rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                        <span>🔔</span> {loading ? '처리 중...' : '알림 켜기'}
                    </button>
                )}

                {permission === 'denied' && (
                    <div style={{ fontSize: '0.85rem', color: '#ff6b6b', background: 'rgba(255,0,0,0.1)', padding: '1rem', borderRadius: '8px', lineHeight: '1.4' }}>
                        ⚠️ <strong>알림이 차단되어 있습니다.</strong><br />
                        브라우저 주소창 왼쪽의 🔒 <strong>자물쇠 아이콘</strong>을 누르거나 설정에서<br />
                        <strong>[알림]</strong> 권한을 <strong>[허용]</strong>으로 변경해주세요.
                    </div>
                )}

                {permission === 'granted' && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.03)', padding: '0.8rem', borderRadius: '8px' }}>
                        {token ? (
                            <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>✅ 이 기기는 알림을 받을 수 있습니다.</span>
                        ) : (
                            <span>⏳ 알림 서버에 연결 중입니다... (잠시만 기다려주세요)</span>
                        )}
                        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>중요한 공지사항과 소식을 푸시 알림으로 받아보세요.</p>
                    </div>
                )}

                {msg && <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '0.5rem', fontWeight: 'bold' }}>{msg}</div>}
            </div>
        </div>
    );
}
