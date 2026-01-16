import { NextResponse } from 'next/server';
import { adminMessaging } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
    try {
        const { token, topic } = await request.json();

        if (!token || !topic) {
            return NextResponse.json({ error: 'Missing token or topic' }, { status: 400 });
        }

        // adminMessaging might be undefined if not initialized
        if (!adminMessaging) {
            // Log detailed error for debugging
            console.error("Firebase Admin SDK not initialized properly. Check env vars.");
            return NextResponse.json({ error: 'Firebase Admin SDK not initialized' }, { status: 500 });
        }

        await adminMessaging.subscribeToTopic(token, topic);
        return NextResponse.json({ success: true, message: `Subscribed to ${topic}` });

    } catch (error: any) {
        console.error('Subscribe Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to subscribe' }, { status: 500 });
    }
}
