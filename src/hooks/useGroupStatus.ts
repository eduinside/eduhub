import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

export function useGroupStatus() {
    const { user, orgId } = useAuth();
    const [updatedGroupIds, setUpdatedGroupIds] = useState<string[]>([]);

    // States
    const [groups, setGroups] = useState<any[]>([]);
    const [visits, setVisits] = useState<{ [key: string]: any }>({});
    const [activeSurveys, setActiveSurveys] = useState<any[]>([]);
    const [myResponses, setMyResponses] = useState<string[]>([]);

    // 1. Groups & Visits
    useEffect(() => {
        if (!user || !orgId) return;

        const qG = query(collection(db, "groups"), where("orgId", "==", orgId), where("memberIds", "array-contains", user.uid));
        const unsubG = onSnapshot(qG, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setGroups(list);
        });

        const qV = collection(db, "users", user.uid, "group_visits");
        const unsubV = onSnapshot(qV, (snap) => {
            const v: any = {};
            snap.docs.forEach(d => v[d.id] = d.data().lastVisit);
            setVisits(v);
        });

        return () => { unsubG(); unsubV(); };
    }, [user, orgId]);

    // 2. Surveys & Responses
    useEffect(() => {
        if (!user) return;

        // Responses
        const qR = query(collection(db, "survey_responses"), where("userId", "==", user.uid));
        const unsubR = onSnapshot(qR, (snap) => {
            setMyResponses(snap.docs.map(d => d.data().surveyId));
        });

        // Surveys - Fetch active ones. 
        const today = new Date().toISOString().slice(0, 10);
        const qS = query(collection(db, "surveys"), where("endDate", ">=", today));
        const unsubS = onSnapshot(qS, (snap) => {
            setActiveSurveys(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => { unsubR(); unsubS(); };
    }, [user]);

    // 3. Calculator
    useEffect(() => {
        if (groups.length === 0) {
            setUpdatedGroupIds([]);
            return;
        }

        const ids: string[] = [];

        groups.forEach(g => {
            // Self-authored actions shouldn't trigger "Update"?
            // User requirement: "Updated group finding".
            // If I posted a message, lastMessageAt updates. 
            // My visit time updates (because I'm in the group page posting it).
            // So `lastMessageAt` ~ `visitTime`.
            // Ideally `lastMessageAt` > `visitTime`.

            const visitTime = visits[g.id]; // Timestamp

            // 1. New Message
            let isUpdated = false;

            if (g.lastMessageAt) {
                if (!visitTime) isUpdated = true;
                else if (g.lastMessageAt.toMillis() > visitTime.toMillis() + 1000) isUpdated = true; // Add buffer
                // Note: If I am the sender, I just visited, so visitTime should be >= lastMessageAt.
            }

            // 2. New Notice
            if (!isUpdated && g.lastNoticeAt) {
                if (!visitTime) isUpdated = true;
                else if (g.lastNoticeAt.toMillis() > visitTime.toMillis() + 1000) isUpdated = true;
            }

            // 3. Pending & New Survey (New since last visit)
            if (!isUpdated) {
                const gSurveys = activeSurveys.filter(s => s.orgId === g.id);
                const hasNewPending = gSurveys.some(s => {
                    const isResponded = myResponses.includes(s.id);
                    if (isResponded) return false;

                    // Unanswered. Now check if it's "New" since visit.
                    // If never visited, it is new.
                    if (!visitTime) return true;

                    const sTime = s.createdAt;
                    if (!sTime) return false; // Safety

                    // Compare timestamps (Firestore Timestamp has seconds/nanoseconds, or toMillis())
                    // React state might have it as object if not converted, but map uses data().
                    const visitMillis = visitTime.toMillis ? visitTime.toMillis() : (visitTime.seconds * 1000);
                    const sMillis = sTime.toMillis ? sTime.toMillis() : (sTime.seconds * 1000);

                    return sMillis > visitMillis + 1000;
                });

                if (hasNewPending) isUpdated = true;
            }

            if (isUpdated) ids.push(g.id);
        });

        setUpdatedGroupIds(ids);

    }, [groups, visits, activeSurveys, myResponses]);

    return updatedGroupIds;
}
