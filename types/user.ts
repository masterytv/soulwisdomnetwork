export type UserRole = 'admin' | 'user';

export interface UserProfile {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    role: UserRole;
    bio?: string;
    createdAt: any; // Firestore Timestamp
}
