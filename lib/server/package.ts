// The edit package for Descript (docs/specs/009-edit-package.md): ask GitHub Actions to
// build it from the approved show notes, and show where it stands on the notes page.

import { FieldValue } from 'firebase-admin/firestore';
import type { Episode, EpisodePackage } from '@/types/episode';
import type { PackageView } from '@/types/studio';
import { adminDb } from './firebaseAdmin';
import { startPackage } from './github';
import { HttpError } from './staff';

// A request that has not finished by now is treated as lost and can be retried.
const STALE_MS = 70 * 60_000;

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

function millis(t: unknown): number | null {
    return t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;
}

function busy(p: EpisodePackage | undefined) {
    if (p?.status !== 'queued' && p?.status !== 'building') return false;
    const since = Math.max(millis(p.requestedAt) ?? 0, millis(p.startedAt) ?? 0);
    return Date.now() - since < STALE_MS;
}

export async function requestPackage(id: string) {
    const ref = episodeRef(id);
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        if (episode.notes?.status !== 'approved') throw new HttpError(409, 'Approve the show notes first');
        if (busy(episode.package)) throw new HttpError(409, 'The edit package is already being built');
        tx.set(ref, {
            package: { status: 'queued', requestedAt: FieldValue.serverTimestamp(), error: null },
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    try {
        await startPackage(id);
    } catch (error) {
        const message = `Could not start building: ${(error as Error).message}`;
        await ref.update({ 'package.status': 'failed', 'package.error': message });
        throw new HttpError(502, message);
    }
}

export async function getPackage(id: string): Promise<PackageView> {
    const snap = await episodeRef(id).get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    const p = episode.package;
    const lost = (p?.status === 'queued' || p?.status === 'building') && !busy(p);
    return {
        // A request whose run died reads as failed, so the page offers a retry.
        status: lost ? 'failed' : p?.status ?? null,
        error: p?.error ?? (lost ? 'Building did not finish. Check the Podcast Edit Package run in GitHub Actions, then try again.' : null),
        folderUrl: p?.folderUrl ?? null,
        files: p?.files ?? [],
        warnings: p?.warnings ?? [],
        finishedAt: millis(p?.finishedAt),
        builtFromVersion: p?.notesVersion ?? null,
        notesApproved: episode.notes?.status === 'approved',
        approvedVersion: episode.notes?.approvedVersion ?? null,
    };
}
