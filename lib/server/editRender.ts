// Editor Light (spec 015): asks GitHub Actions to render the edit saved in the Studio, and
// reports where the render stands, for the "Edit here instead" panel on the notes page. With Auphonic as
// the voice clean-up (spec 019 item 3.2), the stretch it will be sent is held against the free plan's
// hours this month before the render starts, and a render that would go over is refused.

import { FieldValue } from 'firebase-admin/firestore';
import type { Episode, EpisodeEditRender } from '@/types/episode';
import { adminBucket, adminDb } from './firebaseAdmin';
import { startEditRender } from './github';
import { HttpError } from './staff';
import { getSettings } from './studioSettings';
import { auphonicHours, holdAuphonic, releaseAuphonic } from './spending';
import { auphonicSpan, voiceFor, type VoiceCleanup } from '@/lib/voice';

// A request that has not finished by now is treated as lost and can be retried.
const STALE_MS = 360 * 60_000;       // the workflow's own limit is 350 minutes

const WORKING: EpisodeEditRender['status'][] = ['queued', 'downloading', 'rendering', 'saving'];

export interface EditRenderView {
    status: EpisodeEditRender['status'] | null;
    error: string | null;
    canStart: boolean;
    stale: boolean;                   // the edit, or the accepted transcript's words (spec 019 item 2.3), changed after this render was made
    driveUrl: string | null;
    videoUrl: string | null;          // a short-lived link to watch or download the render
    durationSeconds: number | null;
    cuts: number | null;
    warnings: string[];
    qc: NonNullable<EpisodeEditRender['qc']> | null;   // the quality report (spec 019 item 0.2)
    // The voice clean-up (spec 019 item 3.2): the Studio's, what the next render uses, and what this one used.
    voice: { studio: VoiceCleanup; next: VoiceCleanup; rendered: VoiceCleanup | null };
    // Auphonic's free hours this month, and what the saved edit would use (null: not known).
    auphonic: { usedSeconds: number; freeSeconds: number; needSeconds: number | null };
    // Files that open the render's cuts in another editor (spec 019 item 4.1), each with an hour-long download link.
    exports: { kind: NonNullable<EpisodeEditRender['exports']>[number]['kind']; name: string; url: string | null; driveUrl: string | null }[];
}

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

function millis(t: unknown): number | null {
    return t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;
}

function busy(r: EpisodeEditRender | undefined) {
    if (!r || !WORKING.includes(r.status)) return false;
    const since = Math.max(millis(r.requestedAt) ?? 0, millis(r.startedAt) ?? 0);
    return Date.now() - since < STALE_MS;
}

// The seconds of the recording Auphonic would be sent for this edit (lib/voice.ts auphonicSpan).
function auphonicSeconds(episode: Episode): number | null {
    const durationMs = (episode.media?.durationSeconds ?? 0) * 1000;
    if (!episode.edit || !durationMs) return null;
    const span = auphonicSpan(episode.edit, durationMs);
    return span ? (span.endMs - span.startMs) / 1000 : 0;
}

// Renders the edit as it is saved now; running it again replaces the files.
export async function requestEditRender(id: string) {
    const ref = episodeRef(id);
    const [first, settings] = await Promise.all([ref.get(), getSettings()]);
    const before = first.data() as Episode | undefined;
    const voice = voiceFor(before?.edit, settings.voiceCleanup);
    // Auphonic: this month's free hours are held first (refused when they would not fit), and given back
    // if the render does not start.
    let hold: string | null = null;
    if (before && voice === 'auphonic') {
        if (busy(before.editRender)) throw new HttpError(409, 'The edit is already being rendered');
        const seconds = auphonicSeconds(before);
        if (seconds === null) throw new HttpError(409, 'The recording\'s length is not known, so Auphonic\'s hours cannot be counted. Choose Standard or DeepFilterNet.');
        hold = await holdAuphonic(id, seconds);
    }
    const giveBack = async () => { if (hold) await releaseAuphonic(hold).catch(() => {}); };
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        if (!episode.edit) throw new HttpError(409, 'Make at least one change in the editor first');
        if (!episode.media?.sourcePath) throw new HttpError(409, 'The original video is not in Cloud Storage yet');
        if (busy(episode.editRender)) throw new HttpError(409, 'The edit is already being rendered');
        if (voiceFor(episode.edit, settings.voiceCleanup) !== voice) throw new HttpError(409, 'The voice clean-up changed while starting; try again');
        tx.set(ref, {
            editRender: { status: 'queued', requestedAt: FieldValue.serverTimestamp(), error: null, auphonicHold: hold },
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    }).catch(async error => { await giveBack(); throw error; });
    try {
        await startEditRender(id);
    } catch (error) {
        await giveBack();
        const message = `Could not start the render: ${(error as Error).message}`;
        await ref.update({ 'editRender.status': 'failed', 'editRender.error': message });
        throw new HttpError(502, message);
    }
}

export async function getEditRender(id: string): Promise<EditRenderView> {
    const [snap, settings, hours] = await Promise.all([episodeRef(id).get(), getSettings(), auphonicHours()]);
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    const r = episode.editRender;
    const lost = !!r && WORKING.includes(r.status) && !busy(r);
    const ready = r?.status === 'ready';
    return {
        // A request whose run died reads as failed, so the panel offers a retry.
        status: lost ? 'failed' : r?.status ?? null,
        error: r?.error ?? (lost ? 'The render did not finish. Check the Podcast Edit Render run in GitHub Actions, then try again.' : null),
        canStart: !!episode.edit && !!episode.media?.sourcePath && !busy(r),
        stale: ready && (r.editVersion !== episode.edit?.version
            || (r.transcriptVersion !== undefined && r.transcriptVersion !== (episode.review?.acceptedVersion ?? 0))),
        driveUrl: ready ? r.driveUrl ?? null : null,
        videoUrl: ready && r.videoPath
            ? await adminBucket().file(r.videoPath).getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60_000 }).then(([u]) => u).catch(() => null)
            : null,
        durationSeconds: ready ? r.durationSeconds ?? null : null,
        cuts: ready ? r.cuts ?? null : null,
        warnings: ready ? r.warnings ?? [] : [],
        qc: ready ? r.qc ?? null : null,
        voice: { studio: settings.voiceCleanup, next: voiceFor(episode.edit, settings.voiceCleanup), rendered: ready ? r.voice ?? null : null },
        auphonic: { ...hours, needSeconds: auphonicSeconds(episode) },
        exports: ready ? await Promise.all((r.exports ?? []).map(async e => ({
            kind: e.kind, name: e.name, driveUrl: e.driveUrl,
            url: await adminBucket().file(e.path).getSignedUrl({
                action: 'read', expires: Date.now() + 60 * 60_000, responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(e.name)}`,
            }).then(([u]) => u).catch(() => null),
        }))) : [],
    };
}
