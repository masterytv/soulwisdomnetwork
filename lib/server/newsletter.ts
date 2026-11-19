// The "Soul Wisdom Video of the Week" sign-up (Tom, 2026-11-19: Soul Wisdom's own list, on its own system). The
// list is Firestore's newsletter_subscribers, server only (firestore.rules): one document per address, its ID a
// hash of the address. This only records the sign-up; the newsletter job (agent/src/newsletter/run.ts, GitHub
// Actions, which holds the Resend key) puts it into Resend's Soul Wisdom segment and sends the welcome, started
// here at most every two minutes, and also every day by its own schedule.
//
// Called by the public route /newsletter/subscribe (no requireRole: anyone may sign up), so it guards itself:
// a hidden field bots fill in, a few sign-ups an hour per IP and per address, and nothing that reveals whether an
// address was already on the list.

import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { HttpError } from './staff';
import { startNewsletterSync } from './github';
import { signupEmail } from '@/lib/newsletter';

export const SUBSCRIBERS = 'newsletter_subscribers';
const LIMITS = 'newsletter_limits';
const HOURLY = { ip: 10, email: 3 };
const SYNC_EVERY_MS = 2 * 60_000;

export const subscriberId = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
const ipKey = (ip: string) => `ip-${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;

// The calling IP as App Hosting forwards it; '' when unknown (then only the per-address limit applies).
export function clientIp(request: Request): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
}

// One more sign-up for this key in the last hour, or a 429.
async function takeTurn(key: string, max: number) {
    const ref = adminDb().collection(LIMITS).doc(key);
    const hourAgo = Date.now() - 3600_000;
    await adminDb().runTransaction(async tx => {
        const recent = (((await tx.get(ref)).get('at') as number[] | undefined) ?? []).filter(t => t > hourAgo);
        if (recent.length >= max) throw new HttpError(429, 'Too many tries. Please wait a little and try again.');
        tx.set(ref, { at: [...recent, Date.now()] });
    });
}

export async function subscribe(body: unknown, ip: string): Promise<void> {
    const b = (body ?? {}) as { email?: unknown; website?: unknown };
    // The hidden "website" field: people never see it, bots fill it in. Answer as if it worked.
    if (typeof b.website === 'string' && b.website.trim()) return;
    const email = signupEmail(typeof b.email === 'string' ? b.email : '');
    if (!email) throw new HttpError(400, 'That email address doesn’t look right.');

    if (ip) await takeTurn(ipKey(ip), HOURLY.ip);
    const id = subscriberId(email);
    await takeTurn(`email-${id.slice(0, 32)}`, HOURLY.email);

    const ref = adminDb().collection(SUBSCRIBERS).doc(id);
    await adminDb().runTransaction(async tx => {
        const doc = await tx.get(ref);
        if (doc.exists && doc.get('status') === 'subscribed') return;          // already on the list: nothing to do
        tx.set(ref, {
            email,
            status: 'subscribed',
            source: doc.exists ? doc.get('source') : 'site',
            subscribedAt: FieldValue.serverTimestamp(),
            unsubscribedAt: null,
            resendSynced: false,                                              // the job puts them (back) into Resend
            ...(doc.exists ? {} : { createdAt: FieldValue.serverTimestamp(), welcomedAt: null }),
        }, { merge: true });
    });

    // Start the sync, at most every two minutes; a sign-up it misses waits for the next one or the daily run.
    const gate = adminDb().collection('studio').doc('newsletter');
    const due = await adminDb().runTransaction(async tx => {
        const last = ((await tx.get(gate)).get('lastSyncStartedAt') as number | undefined) ?? 0;
        if (Date.now() - last < SYNC_EVERY_MS) return false;
        tx.set(gate, { lastSyncStartedAt: Date.now() }, { merge: true });
        return true;
    });
    if (due) await startNewsletterSync().catch(e => console.error('[newsletter] could not start the sync:', e instanceof Error ? e.message : e));
}
