import { db } from "@/lib/firebase/config";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    addDoc,
    serverTimestamp,
    updateDoc,
    query,
    where,
    orderBy,
    onSnapshot
} from "firebase/firestore";

/**
 * Generates a unique conversation ID for two users by sorting their UIDs.
 * This ensures 1v1 conversations are always pinned to a single deterministic ID.
 */
export function getConversationId(uid1: string, uid2: string): string {
    return [uid1, uid2].sort().join("_");
}

/**
 * Ensures a conversation document exists and returns its ID.
 */
export async function getOrCreateConversation(currentUserId: string, otherUserId: string, otherUserName: string, otherUserPhoto: string | null) {
    const convId = getConversationId(currentUserId, otherUserId);
    const convRef = doc(db, "conversations", convId);
    const convSnap = await getDoc(convRef);

    if (!convSnap.exists()) {
        await setDoc(convRef, {
            id: convId,
            participants: [currentUserId, otherUserId],
            participantNames: {
                [otherUserId]: otherUserName,
                // We'll update the current user's name on first message if needed
            },
            participantPhotos: {
                [otherUserId]: otherUserPhoto,
            },
            lastMessage: "",
            lastMessageTimestamp: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    return convId;
}

/**
 * Sends a message and updates the conversation metadata.
 */
export async function sendMessage(convId: string, senderId: string, content: string) {
    const messagesRef = collection(db, "messages");

    await addDoc(messagesRef, {
        conversationId: convId,
        senderId,
        content: content.trim(),
        createdAt: serverTimestamp(),
    });

    const convRef = doc(db, "conversations", convId);
    await updateDoc(convRef, {
        lastMessage: content.trim(),
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}
