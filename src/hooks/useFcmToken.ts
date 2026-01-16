import { useEffect, useState } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db, app } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

const useFcmToken = () => {
    const { user, orgIds } = useAuth();
    const [token, setToken] = useState<string | null>(null);
    const [notificationPermissionStatus, setNotificationPermissionStatus] = useState<NotificationPermission>('default');

    useEffect(() => {
        const retrieveToken = async () => {
            try {
                if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                    // Check if messaging is supported
                    let messaging;
                    try {
                        messaging = getMessaging(app);
                    } catch (e) {
                        console.log("Messaging not supported");
                        return;
                    }

                    const permission = await Notification.requestPermission();
                    setNotificationPermissionStatus(permission);

                    if (permission === 'granted') {
                        const currentToken = await getToken(messaging, {
                            vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID_KEY
                        });
                        if (currentToken) {
                            setToken(currentToken);
                            // Save token to Firestore if user is logged in
                            if (user) {
                                const userRef = doc(db, 'users', user.uid);
                                // Use arrayUnion to handle multiple devices per user
                                await updateDoc(userRef, {
                                    fcmTokens: arrayUnion(currentToken)
                                });

                                // Subscribe to global topic 'all_users'
                                await fetch('/api/fcm/subscribe', {
                                    method: 'POST',
                                    body: JSON.stringify({ token: currentToken, topic: 'all_users' }),
                                    headers: { 'Content-Type': 'application/json' }
                                });

                                // Subscribe to org member topics
                                if (orgIds && orgIds.length > 0) {
                                    for (const oid of orgIds) {
                                        await fetch('/api/fcm/subscribe', {
                                            method: 'POST',
                                            body: JSON.stringify({ token: currentToken, topic: `org_${oid}_member` }),
                                            headers: { 'Content-Type': 'application/json' }
                                        });
                                    }
                                }

                                // Subscribe to org admin topics
                                const snap = await getDoc(userRef);
                                if (snap.exists()) {
                                    const data = snap.data();
                                    const profiles = data.profiles || {};
                                    const adminOrgIds = Object.keys(profiles).filter(oid =>
                                        profiles[oid].role === 'admin' || profiles[oid].role === 'manager'
                                    );

                                    for (const oid of adminOrgIds) {
                                        await fetch('/api/fcm/subscribe', {
                                            method: 'POST',
                                            body: JSON.stringify({ token: currentToken, topic: `org_${oid}_admin` }),
                                            headers: { 'Content-Type': 'application/json' }
                                        });
                                        console.log(`Subscribed to org_${oid}_admin`);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.log('An error occurred while retrieving token:', error);
            }
        };

        if (user) {
            retrieveToken();
        }
    }, [user, orgIds]);

    return { token, notificationPermissionStatus };
};

export default useFcmToken;

