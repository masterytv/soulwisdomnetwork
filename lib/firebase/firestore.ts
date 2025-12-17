import { db } from "@/lib/firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// Collection References
export const usersCol = collection(db, "users");
export const postsCol = collection(db, "posts");
export const commentsCol = collection(db, "comments");

// Types (to be expanded)
export interface UserProfile {
    uid: string;
    displayName: string | null;
    username?: string;
    photoURL: string | null;
    bio?: string;
    createdAt: any;
}
