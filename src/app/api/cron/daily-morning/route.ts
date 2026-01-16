import { NextResponse } from 'next/server';
import { adminMessaging } from '@/lib/firebaseAdmin';

export async function GET(request: Request) {
    // Optional: Verify Vercel Cron signature if needed (process.env.CRON_SECRET)

    if (!adminMessaging) {
        return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    try {
        // Send notification to 'all_users' topic
        const response = await adminMessaging.send({
            topic: 'all_users',
            notification: {
                title: '[EduHub] 공지사항 확인 알림',
                body: '오늘의 주요 공지사항을 확인해보세요.'
            },
            data: {
                url: '/notice'
            },
            webpush: {
                fcmOptions: {
                    link: '/notice'
                }
            }
        });
        console.log('Daily morning notification sent:', response);
        return NextResponse.json({ success: true, messageId: response });
    } catch (error: any) {
        console.error('Cron job error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
