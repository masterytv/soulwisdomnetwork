// Browser helper for the API routes (Studio, admin and community): attaches the signed-in
// user's ID token, which the server verifies (lib/server/staff.ts), and the App Check token
// once App Check is on (lib/server/community.ts).

import { getToken } from 'firebase/app-check';
import { appCheck, auth } from '@/lib/firebase/config';

async function signedFetch(path: string, init: RequestInit): Promise<Response> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const check = appCheck ? await getToken(appCheck).then(t => t.token, () => '') : '';
    return fetch(path, {
        ...init,
        headers: {
            ...init.headers,
            Authorization: `Bearer ${await user.getIdToken()}`,
            ...(check ? { 'X-Firebase-AppCheck': check } : {}),
            // A FormData body sets its own multipart type.
            ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        },
    });
}

export async function studioFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await signedFetch(path, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body as T;
}

// The same for a route that answers with bytes, such as the timeline's waveform peaks.
export async function studioFetchBytes(path: string, init: RequestInit = {}): Promise<ArrayBuffer> {
    const res = await signedFetch(path, init);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.arrayBuffer();
}
