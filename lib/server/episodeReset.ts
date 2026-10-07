// Deletes an episode, or starts it over from its recording (lib/episodeReset.ts says what each keeps).
// Delete: its files in Storage, its transcript Google Doc (to the Drive bin), then its record with its
// approvals and media bin. Start over: its files in Storage except the recording and speaker tracks, the
// transcript Doc, its approvals and media bin, then the record is reset and ingest is started for it.
// Neither touches the original in Drive, nor anything already on YouTube.

import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { docIdOf, keptOnStartOver, runningJobs, startedOver } from '@/lib/episodeReset';
import type { Episode } from '@/types/episode';
import { studioDrive } from './drive';
import { adminBucket, adminDb } from './firebaseAdmin';
import { startIngest } from './github';
import { HttpError } from './staff';
import { getSettings } from './studioSettings';

async function load(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    const ref = adminDb().collection('episodes').doc(id);
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new HttpError(404, 'Episode not found');
    const running = runningJobs(episode);
    if (running.length) {
        throw new HttpError(409, `${running.join(', ')} ${running.length > 1 ? 'are' : 'is'} working on this episode. Wait for ${running.length > 1 ? 'them' : 'it'} to finish (or fail), then try again.`);
    }
    return { ref, episode };
}

// The transcript Doc goes to the Drive bin (it can be restored from there for 30 days). A failure is a
// warning: the episode goes anyway.
async function binTranscriptDoc(episode: Episode): Promise<string | null> {
    const fileId = docIdOf(episode.review?.docUrl);
    if (!fileId) return null;
    try {
        await studioDrive().files.update({ fileId, supportsAllDrives: true, requestBody: { trashed: true } });
        return null;
    } catch (error) {
        return `The transcript Google Doc was not moved to the bin (${(error as Error).message}); delete it in Drive.`;
    }
}

// Deletes the episode's files in Storage, all of them or all but `keep`.
async function deleteFiles(id: string, keep?: (path: string) => boolean) {
    const bucket = adminBucket();
    const prefix = `episodes/${id}/`;
    if (!keep) {
        await bucket.deleteFiles({ prefix, force: true });
        return;
    }
    const [files] = await bucket.getFiles({ prefix });
    const doomed = files.filter(f => !keep(f.name));
    for (let i = 0; i < doomed.length; i += 20) {
        await Promise.all(doomed.slice(i, i + 20).map(f => f.delete({ ignoreNotFound: true })));
    }
}

// The approvals and media bin records (subcollections), which a reset of the record itself leaves behind.
async function deleteSubcollections(ref: DocumentReference) {
    for (const sub of await ref.listCollections()) await adminDb().recursiveDelete(sub);
}

export async function deleteEpisode(id: string): Promise<{ warnings: string[] }> {
    const { ref, episode } = await load(id);
    // Files first: if that fails, the episode is still listed and can be deleted again.
    await deleteFiles(id);
    const docWarning = await binTranscriptDoc(episode);
    await adminDb().recursiveDelete(ref);
    return { warnings: docWarning ? [docWarning] : [] };
}

export async function startOver(id: string): Promise<{ started: boolean; warnings: string[] }> {
    const { ref, episode } = await load(id);
    const sourcePath = episode.media?.sourcePath;
    const [inStorage] = sourcePath ? await adminBucket().file(sourcePath).exists() : [false];
    if (!sourcePath || !inStorage) {
        throw new HttpError(409, 'The recording never reached the Studio\'s storage, so there is nothing to start over from. Press Retry, or delete the episode and add the recording again.');
    }
    const settings = await getSettings();
    await deleteFiles(id, path => keptOnStartOver(id, path));
    const warnings: string[] = [];
    const docWarning = await binTranscriptDoc(episode);
    if (docWarning) warnings.push(docWarning);
    await deleteSubcollections(ref);
    await ref.set({ ...startedOver(episode, settings.hosts), updatedAt: FieldValue.serverTimestamp() });
    try {
        await startIngest({ skip_wait: true });
        return { started: true, warnings };
    } catch (error) {
        warnings.push(`Processing could not start yet (${(error as Error).message}); the next processing run picks it up.`);
        return { started: false, warnings };
    }
}
