// Server-side access check for the admin area and Podcast Studio. The browser's own role
// check only decides what to show; every API route must call requireRole.

import type { UserRole } from '@/types/user';
import { adminAuth, adminDb } from './firebaseAdmin';

export class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

export const STUDIO_ROLES: UserRole[] = ['admin', 'producer'];

export async function requireRole(request: Request, allowed: UserRole[]) {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new HttpError(401, 'Not signed in');

    let uid: string;
    try {
        uid = (await adminAuth().verifyIdToken(token)).uid;
    } catch {
        throw new HttpError(401, 'Sign-in expired, please sign in again');
    }

    // Read the role server-side: members cannot change it (firestore.rules), so it is trusted.
    const role = (await adminDb().collection('users').doc(uid).get()).get('role') as UserRole | undefined;
    if (!role || !allowed.includes(role)) throw new HttpError(403, 'You do not have access to this');
    return { uid, role };
}

// Wraps a route handler: turns HttpError into a JSON error response, anything else into 500.
export function handle(fn: (request: Request) => Promise<Response>) {
    return async (request: Request) => {
        try {
            return await fn(request);
        } catch (error) {
            if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
            console.error(error);
            return Response.json({ error: 'Something went wrong' }, { status: 500 });
        }
    };
}
