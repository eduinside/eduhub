import { NextResponse } from 'next/server';
import { adminMessaging, adminDb } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
    try {
        const { title, body, token, topic, targetUserId, url, data } = await request.json();

        if (!adminMessaging) {
            return NextResponse.json({ error: 'Config Error' }, { status: 500 });
        }

        const notification = { title, body };
        // Convert all data values to strings
        const stringData = Object.entries({
            url: url || '/',
            click_action: url || '/',
            ...data
        }).reduce((acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
        }, {} as Record<string, string>);

        const webpush = {
            fcmOptions: {
                link: url || '/',
            },
            notification: {
                icon: '/icon-192x192.png',
                badge: '/icon-192x192.png'
            }
        };

        // 1. Single Token
        if (token) {
            await adminMessaging.send({ token, notification, data: stringData, webpush });
            return NextResponse.json({ success: true, type: 'single' });
        }

        // 2. Topic
        if (topic) {
            const res = await adminMessaging.send({ topic, notification, data: stringData, webpush });
            return NextResponse.json({ success: true, messageId: res, type: 'topic' });
        }

        // 3. Target User ID (DB Lookup)
        if (targetUserId) {
            if (!adminDb) return NextResponse.json({ error: 'DB Error' }, { status: 500 });

            const userSnap = await adminDb.collection('users').doc(targetUserId).get();
            if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

            const userData = userSnap.data();
            const tokens = userData?.fcmTokens || [];

            if (!Array.isArray(tokens) || tokens.length === 0) {
                return NextResponse.json({ success: false, message: 'No tokens found for user' });
            }

            const validTokens = tokens.filter((t: any) => typeof t === 'string' && t.length > 0);
            if (validTokens.length === 0) return NextResponse.json({ success: false, message: 'No valid tokens' });

            const res = await adminMessaging.sendEachForMulticast({
                tokens: validTokens,
                notification,
                data: stringData,
                webpush
            });

            return NextResponse.json({
                success: true,
                successCount: res.successCount,
                failureCount: res.failureCount,
                type: 'multicast'
            });
        }

        return NextResponse.json({ error: 'No target specified' }, { status: 400 });

    } catch (error: any) {
        console.error('Send Error:', error);
        return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
    }
}
