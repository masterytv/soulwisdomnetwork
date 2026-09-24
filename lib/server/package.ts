// The edit package for Descript and the Descript project made from it
// (docs/specs/009-edit-package.md): ask GitHub Actions to build them from the approved show
// notes, and show where they stand on the notes page.

import { FieldValue } from 'firebase-admin/firestore';
import type { Episode, EpisodeDescript, EpisodePackage } from '@/types/episode';
import type { PackageView } from '@/types/studio';
import { adminDb } from './firebaseAdmin';
import { startDescript, startPackage } from './github';
import { HttpError } from './staff';

// A request that has not finished by now is treated as lost and can be retried.
const STALE_MS = 70 * 60_000;
const DESCRIPT_STALE_MS = 250 * 60_000;     // the workflow's own limit is 240 minutes

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

// Packages built before the Descript step kept their clips only in Drive.
function clipsStored(episode: Episode) {
    return (episode.package?.clipPaths?.length ?? -1) === (episode.notes?.approved?.teaserClips.length ?? 0);
}

function descriptBusy(d: EpisodeDescript | undefined) {
    if (d?.status !== 'queued' && d?.status !== 'importing' && d?.status !== 'cleaning') return false;
    const since = Math.max(millis(d.requestedAt) ?? 0, millis(d.startedAt) ?? 0);
    return Date.now() - since < DESCRIPT_STALE_MS;
}

// Makes a Descript project from the current edit package. Each call makes a new project, so a
// second one needs `again`.
export async function requestDescript(id: string, { again = false } = {}) {
    const ref = episodeRef(id);
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        if (episode.notes?.status !== 'approved') throw new HttpError(409, 'Approve the show notes first');
        if (episode.package?.status !== 'ready') throw new HttpError(409, 'Build the edit package first');
        if ((episode.package.notesVersion ?? -1) !== (episode.notes.approvedVersion ?? 0)) {
            throw new HttpError(409, 'The notes changed since the edit package was built; rebuild it first');
        }
        if (busy(episode.package)) throw new HttpError(409, 'The edit package is being rebuilt');
        if (!clipsStored(episode)) throw new HttpError(409, 'The edit package was built before clips were kept for Descript; rebuild it first');
        if (descriptBusy(episode.descript)) throw new HttpError(409, 'Already sending to Descript');
        if (episode.descript?.projectUrl && !again) throw new HttpError(409, 'There is already a Descript project for this episode');
        tx.set(ref, {
            descript: { status: 'queued', requestedAt: FieldValue.serverTimestamp(), error: null, warnings: [] },
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    try {
        await startDescript(id);
    } catch (error) {
        const message = `Could not start sending: ${(error as Error).message}`;
        await ref.update({ 'descript.status': 'failed', 'descript.error': message });
        throw new HttpError(502, message);
    }
}

export async function requestPackage(id: string) {
    const ref = episodeRef(id);
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        if (episode.notes?.status !== 'approved') throw new HttpError(409, 'Approve the show notes first');
        if (busy(episode.package)) throw new HttpError(409, 'The edit package is already being built');
        if (descriptBusy(episode.descript)) throw new HttpError(409, 'Wait until the Descript project is made');
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
    const d = episode.descript;
    const dLost = (d?.status === 'queued' || d?.status === 'importing' || d?.status === 'cleaning') && !descriptBusy(d);
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
        clipsStored: clipsStored(episode),
        descript: {
            status: dLost ? 'failed' : d?.status ?? null,
            error: d?.error ?? (dLost ? 'Sending did not finish. Check the Podcast Descript run in GitHub Actions and the project in Descript.' : null),
            projectUrl: d?.projectUrl ?? null,
            agentResponse: d?.agentResponse ?? null,
            warnings: d?.warnings ?? [],
            mediaMinutes: d?.mediaSecondsUsed != null ? Math.round(d.mediaSecondsUsed / 60) : null,
            aiCredits: d?.aiCreditsUsed ?? null,
            finishedAt: millis(d?.finishedAt),
            builtFromVersion: d?.notesVersion ?? null,
        },
    };
}
