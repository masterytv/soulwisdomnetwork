// The last step of each podcast job's workflow, run only when the job's own step was cancelled or died
// before its error handler (out of time, out of memory): a job still marked in progress is marked failed,
// so the Studio offers to try again at once instead of after its staleness window (70 minutes for the
// shorts: 29 October 2026, a cancelled shorts run held the page that long). editRenderStopped.ts does the
// same for the edit render. JOB_FIELD names the job's field on the episode (shorts, notes, broll, ...).

import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { loadAlert } from './config';
import { sendEmail } from './notify';

// Each job's own name, as its emails and the Studio say it.
export const JOB_LABELS: Record<string, string> = {
    notes: 'Show notes', extras: 'Social posts and follow-up email', translations: 'Caption translations', retakes: 'Tighter edit',
    highlights: 'Highlight suggestions', broll: 'B-roll images', package: 'The edit package', descript: 'The Descript project',
    final: 'The final cut', thumbnails: 'Thumbnail options', youtube: 'The YouTube upload', shorts: 'The shorts job', podcast: 'The podcast MP3',
};

// Every job ends ready, failed or (show notes) approved; any other status is still in progress.
const ENDED = new Set(['ready', 'failed', 'approved']);

// The update that marks the job stopped, or null when it already recorded how it ended (or never started).
export function stoppedUpdate(field: string, job: { status?: unknown } | undefined): Record<string, unknown> | null {
    if (!job || typeof job.status !== 'string' || ENDED.has(job.status)) return null;
    return {
        [`${field}.status`]: 'failed',
        [`${field}.error`]: `${JOB_LABELS[field] ?? 'The job'} stopped before it finished: it was cancelled in GitHub Actions, or ran out of time or memory. Try again.`,
        [`${field}.finishedAt`]: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };
}

async function main() {
    const episodeId = process.env.EPISODE_ID ?? '';
    const field = process.env.JOB_FIELD ?? '';
    if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
    if (!JOB_LABELS[field]) throw new Error(`Not a job: ${field}`);
    initializeApp({ credential: cert(JSON.parse(process.env.PODCAST_SA_JSON ?? '{}')) });
    const db = getFirestore();
    const ref = db.collection('episodes').doc(episodeId);
    const marked = await db.runTransaction(async tx => {
        const update = stoppedUpdate(field, (await tx.get(ref)).data()?.[field]);
        if (update) tx.update(ref, update);
        return !!update;
    });
    if (!marked) return;
    const runUrl = process.env.GITHUB_RUN_URL || '';
    console.log(`Marked ${field} of ${episodeId} as stopped.`);
    await sendEmail({ alert: loadAlert() }, `${JOB_LABELS[field]} stopped: ${episodeId}`,
        `${JOB_LABELS[field]} stopped before it finished: it was cancelled in GitHub Actions, or ran out of time or memory.\n\nTry again from the Podcast Studio.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
}

if (require.main === module) main().catch(error => { console.error(`❌ ${(error as Error).message}`); process.exit(1); });
