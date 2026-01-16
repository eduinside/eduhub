import admin from 'firebase-admin';

// Check if firebase-admin is already initialized
if (!admin.apps.length) {
    try {
        // FIREBASE_SERVICE_ACCOUNT_KEY should be a JSON string of your service account key
        // You can get this from Firebase Console > Project Settings > Service accounts
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

        if (serviceAccountKey) {
            const serviceAccount = JSON.parse(serviceAccountKey);

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('🔥 Firebase Admin Initialized');
        } else {
            console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_KEY is missing in environment variables.');
        }
    } catch (error) {
        console.error('🔥 Firebase Admin Init Error:', error);
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminMessaging = admin.messaging();
