// Browser helper for Studio and admin API routes: attaches the signed-in user's ID token,
// which the server verifies (lib/server/staff.ts).

import { auth } from '@/lib/firebase/config';

export async function studioFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const res = await fetch(path, {
        ...init,
        headers: {
            ...init.headers,
            Authorization: `Bearer ${await user.getIdToken()}`,
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body as T;
}
