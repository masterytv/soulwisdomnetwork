// B-roll for one episode: ask GitHub Actions to find stock footage and photos (docs/specs/023-stock-broll.md) or make
// AI stills (docs/specs/008-broll-images.md) from the approved show notes, and show them on the notes page.

import { FieldValue } from 'firebase-admin/firestore';
import { brollStale, isAiBroll } from '@/lib/broll';
import type { Episode, EpisodeBroll } from '@/types/episode';
import type { BrollView } from '@/types/studio';
import { adminBucket, adminDb } from './firebaseAdmin';
import { startBroll } from './github';
import { ESTIMATE_USD, withinDailyLimit } from './spending';
import { HttpError } from './staff';

const IMAGE_LINK_MS = 6 * 60 * 60_000;
// A request that has not finished by now is treated as lost and can be retried.
const STALE_MS = 40 * 60_000;

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

function millis(t: unknown): number | null {
    return t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;
}

function busy(broll: EpisodeBroll | undefined) {
    if (broll?.status !== 'queued' && broll?.status !== 'generating') return false;
    const since = Math.max(millis(broll.requestedAt) ?? 0, millis(broll.startedAt) ?? 0);
    return Date.now() - since < STALE_MS;
}

// Starts the Podcast B-roll workflow for the approved ideas: `mode` "stock" finds real footage and photos (free), "ai"
// makes AI images; `index` does one idea.
export async function requestBroll(id: string, index: number | null, mode: 'stock' | 'ai' = 'ai') {
    const ref = episodeRef(id);
    let images = 0;   // to fill, as agent/src/podcast/broll.ts decides: new ideas, or changed ones
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        const ideas = episode.notes?.status === 'approved' ? episode.notes.approved?.broll ?? [] : [];
        const made = episode.broll?.images ?? {};
        images = index !== null ? 1 : ideas.filter((b, i) => brollStale(made[i], b)).length;
        if (!ideas.length) throw new HttpError(409, 'Approve the show notes with at least one b-roll idea first');
        if (index !== null && index >= ideas.length) throw new HttpError(400, 'There is no such b-roll idea');
        if (index === null && !images) throw new HttpError(409, 'Every b-roll idea already has its b-roll');
        if (busy(episode.broll)) throw new HttpError(409, 'B-roll is already being made');
        tx.set(ref, {
            broll: { status: 'queued', mode, only: index, requestedAt: FieldValue.serverTimestamp(), error: null },
            brollSkipped: null,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    try {
        await withinDailyLimit(mode === 'stock' ? 'stock b-roll' : 'b-roll images',
            mode === 'stock' ? ESTIMATE_USD.brollStock : images * ESTIMATE_USD.brollImage, () => startBroll(id, index, mode));
    } catch (error) {
        const message = `Could not start: ${(error as Error).message}`;
        await ref.update({ 'broll.status': 'failed', 'broll.error': message });
        throw new HttpError(502, message);
    }
}

export async function getBroll(id: string): Promise<BrollView> {
    const snap = await episodeRef(id).get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    const b = episode.broll;
    const lost = (b?.status === 'queued' || b?.status === 'generating') && !busy(b);
    const images = await Promise.all(Object.values(b?.images ?? {}).map(async image => ({
        index: image.index,
        idea: image.idea,
        style: image.style ?? 'photo',
        source: isAiBroll(image) ? 'ai' as const : image.source as 'pexels' | 'pixabay',
        kind: image.kind ?? 'image',
        credit: image.credit ?? null,
        pageUrl: image.pageUrl ?? null,
        seconds: image.seconds ?? null,
        url: (await adminBucket().file(image.path).getSignedUrl({ action: 'read', expires: Date.now() + IMAGE_LINK_MS }))[0],
        model: image.model,
        prompt: image.prompt,
        usd: image.usd,
        createdAt: millis(image.createdAt),
    })));
    return {
        // A request whose run died reads as failed, so the page offers a retry.
        status: lost ? 'failed' : b?.status ?? null,
        only: b?.only ?? null,
        mode: b?.mode ?? 'ai',
        error: b?.error ?? (lost ? 'The b-roll run did not finish. Check the Podcast B-roll run in GitHub Actions, then try again.' : null),
        notesApproved: episode.notes?.status === 'approved',
        skipped: episode.brollSkipped ?? null,
        images: images.sort((x, y) => x.index - y.index),
    };
}

// Skips b-roll (or takes the skip back), so editing and the edit package need not wait for images
// (lib/brollGate.ts). Making images later takes the skip back too.
export async function skipBroll(id: string, skip: boolean, user: { uid: string }) {
    const ref = episodeRef(id);
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new HttpError(404, 'Episode not found');
    if (skip && busy(episode.broll)) throw new HttpError(409, 'B-roll is being made; wait for it to finish');
    let by = 'a producer';
    if (skip) {
        const profile = (await adminDb().collection('users').doc(user.uid).get()).data() ?? {};
        by = (profile.displayName as string) || by;
    }
    await ref.update({ brollSkipped: skip ? { by, at: Date.now() } : null, updatedAt: FieldValue.serverTimestamp() });
}
