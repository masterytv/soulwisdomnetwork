// Show notes for one episode (docs/specs/007-show-notes.md): ask GitHub Actions to draft
// them, load and save a producer's edits, and approve them (Checkpoint B).

import { FieldValue } from 'firebase-admin/firestore';
import { parseShowNotes } from '@/lib/showNotes';
import type { Episode, EpisodeNotes } from '@/types/episode';
import type { EpisodeNotesView } from '@/types/studio';
import { adminBucket, adminDb } from './firebaseAdmin';
import { startNotes } from './github';
import { HttpError } from './staff';

const VIDEO_LINK_MS = 6 * 60 * 60_000;
// A request that has not turned into notes by now is treated as lost and can be retried.
const STALE_MS = 20 * 60_000;

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

function millis(t: unknown): number | null {
    return t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;
}

function busy(notes: EpisodeNotes | undefined) {
    if (notes?.status !== 'queued' && notes?.status !== 'generating') return false;
    const since = Math.max(millis(notes.requestedAt) ?? 0, millis(notes.startedAt) ?? 0);
    return Date.now() - since < STALE_MS;
}

// Starts the Podcast Show Notes workflow. Approved notes are only redrafted when `force`.
export async function requestNotes(id: string, { force = false } = {}) {
    const ref = episodeRef(id);
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        if (episode.status !== 'speakers_confirmed') throw new HttpError(409, 'Accept the transcript first');
        if (busy(episode.notes)) throw new HttpError(409, 'Show notes are already being drafted');
        if (episode.notes?.status === 'approved' && !force) throw new HttpError(409, 'Show notes are already approved');
        tx.update(ref, {
            'notes.status': 'queued',
            'notes.requestedAt': FieldValue.serverTimestamp(),
            'notes.error': null,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
    try {
        await startNotes(id);
    } catch (error) {
        const message = `Could not start drafting: ${(error as Error).message}`;
        await ref.update({ 'notes.status': 'failed', 'notes.error': message });
        throw new HttpError(502, message);
    }
}

export async function getNotes(id: string): Promise<EpisodeNotesView> {
    const snap = await episodeRef(id).get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    const n = episode.notes;
    const videoUrl = episode.media?.proxyPath
        ? (await adminBucket().file(episode.media.proxyPath)
            .getSignedUrl({ action: 'read', expires: Date.now() + VIDEO_LINK_MS }))[0]
        : null;
    return {
        id,
        title: episode.title,
        recordedAt: episode.recordedAt ?? null,
        durationSeconds: episode.media?.durationSeconds ?? null,
        videoUrl,
        transcriptAccepted: episode.status === 'speakers_confirmed',
        notes: n ? {
            // A request whose run died reads as failed, so the page offers a retry.
            status: (n.status === 'queued' || n.status === 'generating') && !busy(n) ? 'failed' : n.status,
            draft: n.draft ?? null,
            version: n.version ?? 0,
            model: n.model ?? null,
            unverifiedQuotes: n.unverifiedQuotes ?? [],
            error: n.error ?? ((n.status === 'queued' || n.status === 'generating') && !busy(n)
                ? 'Drafting did not finish. Check the Podcast Show Notes run in GitHub Actions, then try again.' : null),
            requestedAt: millis(n.requestedAt),
            generatedAt: millis(n.generatedAt),
            approved: n.approvedBy
                ? { by: n.approvedBy.name, at: millis(n.approvedAt) ?? 0, version: n.approvedVersion ?? 0 }
                : null,
        } : null,
    };
}

export async function saveNotes(id: string, input: unknown, version: unknown) {
    let draft;
    try {
        draft = parseShowNotes(input);
    } catch (error) {
        throw new HttpError(400, `Invalid show notes: ${(error as Error).message}`);
    }
    const ref = episodeRef(id);
    return adminDb().runTransaction(async tx => {
        const notes = ((await tx.get(ref)).data() as Episode | undefined)?.notes;
        if (!notes?.draft) throw new HttpError(409, 'There are no show notes to edit yet');
        if (busy(notes)) throw new HttpError(409, 'New notes are being drafted; your edits would be replaced');
        const current = notes.version ?? 0;
        if (version !== current) throw new HttpError(409, 'Someone else changed these notes. Reload to see their changes.');
        tx.update(ref, { 'notes.draft': draft, 'notes.version': current + 1, updatedAt: FieldValue.serverTimestamp() });
        return current + 1;
    });
}

// Checkpoint B: freezes the current draft as the approved notes.
export async function approveNotes(id: string, version: unknown, user: { uid: string }) {
    const ref = episodeRef(id);
    const profile = (await adminDb().collection('users').doc(user.uid).get()).data() ?? {};
    const approvedBy = { uid: user.uid, name: (profile.displayName as string) || (profile.email as string) || 'a producer' };
    await adminDb().runTransaction(async tx => {
        const notes = ((await tx.get(ref)).data() as Episode | undefined)?.notes;
        if (!notes?.draft) throw new HttpError(409, 'There are no show notes to approve yet');
        if (busy(notes)) throw new HttpError(409, 'New notes are being drafted');
        if (version !== (notes.version ?? 0)) throw new HttpError(409, 'Someone else changed these notes. Reload to see their changes.');
        tx.update(ref, {
            'notes.status': 'approved',
            'notes.approved': notes.draft,
            'notes.approvedBy': approvedBy,
            'notes.approvedAt': FieldValue.serverTimestamp(),
            'notes.approvedVersion': notes.version ?? 0,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}
