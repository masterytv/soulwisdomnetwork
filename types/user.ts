// 'producer' can use the Podcast Studio; 'admin' can also manage members.
export type UserRole = 'admin' | 'producer' | 'user';

export interface UserProfile {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    role: UserRole;
    bio?: string;
    createdAt: any; // Firestore Timestamp
}
