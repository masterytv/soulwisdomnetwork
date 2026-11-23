// The Studio's daily spending limit for the social job (docs/specs/026-social-publishing.md): the same $10 in any 24
// hours as the Studio's own paid starts (lib/server/spending.ts, whose rules this follows on the job's Firestore). Each
// paid call reserves its estimate in studio/spending first; a refused call leaves the post to a later run. The real
// cost is then recorded on the episode's costs.items, as every job records its own.

import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Episode } from '../../../types/episode';

export const DAILY_LIMIT_USD = 10;          // lib/server/spending.ts DAILY_LIMIT_USD
const DAY_MS = 24 * 60 * 60_000;

interface Reservation { id: string; at: number; usd: number; what: string }

const millis = (t: unknown) => (t instanceof Date ? t.getTime()
    : t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : 0);

export class OverLimit extends Error {}

// Reserves `usd` for `what` if it fits under the limit; throws OverLimit if not.
export async function reserve(db: Firestore, what: string, usd: number): Promise<void> {
    const since = Date.now() - DAY_MS;
    let actual = 0;
    for (const d of (await db.collection('episodes').select('costs').get()).docs) {
        for (const item of (d.data() as Pick<Episode, 'costs'>).costs?.items ?? []) if (millis(item.at) >= since) actual += item.usd ?? 0;
    }
    const ledger = db.collection('studio').doc('spending');
    await db.runTransaction(async tx => {
        const entries = (((await tx.get(ledger)).get('entries') as Reservation[] | undefined) ?? []).filter(e => e.at >= since);
        const spent = Math.max(actual, entries.reduce((t, e) => t + e.usd, 0));
        if (spent + usd > DAILY_LIMIT_USD) {
            throw new OverLimit(`Daily spending limit: about $${spent.toFixed(2)} spent in the last 24 hours; this would add $${usd.toFixed(2)} (limit $${DAILY_LIMIT_USD})`);
        }
        tx.set(ledger, { entries: [...entries, { id: randomUUID(), at: Date.now(), usd, what }], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
}

// Records what a call really cost on its episode, for the limit and the Usage page.
export async function record(db: Firestore, episodeId: string, item: string, usd: number): Promise<void> {
    await db.collection('episodes').doc(episodeId).update({
        'costs.items': FieldValue.arrayUnion({ item, usd, at: new Date() }),
        'costs.totalUsd': FieldValue.increment(usd),
    });
}
