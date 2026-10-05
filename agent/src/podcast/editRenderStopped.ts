// Editor Light (spec 015): the last step of podcast_edit_render.yml, run only when the render
// step was cancelled or died without reaching its own error handler (out of memory, out of
// time). Marks a render that is still in progress as failed, so the Studio offers a retry at
// once instead of after the 6-hour staleness window.

import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { Episode, EpisodeEditRender } from '../../../types/episode';
import { loadAlert } from './config';
import { sendEmail } from './notify';

const WORKING: EpisodeEditRender['status'][] = ['queued', 'downloading', 'rendering', 'saving'];

async function main() {
    const episodeId = process.env.EPISODE_ID ?? '';
    if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
    initializeApp({ credential: cert(JSON.parse(process.env.PODCAST_SA_JSON ?? '{}')) });
    const ref = getFirestore().collection('episodes').doc(episodeId);
    const runUrl = process.env.GITHUB_RUN_URL || '';
    const message = 'The render stopped before it finished: it was cancelled, ran out of memory or ran out of time.';
    const marked = await getFirestore().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode?.editRender || !WORKING.includes(episode.editRender.status)) return false;
        tx.update(ref, {
            'editRender.status': 'failed', 'editRender.error': message,
            'editRender.finishedAt': FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
    });
    if (!marked) return;    // the job already recorded how it ended
    console.log(`Marked the render of ${episodeId} as failed.`);
    await sendEmail({ alert: loadAlert() }, `Editor Light render stopped: ${episodeId}`,
        `${message}\n\nTry again from the show notes page.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
}

main().catch(error => { console.error(`❌ ${(error as Error).message}`); process.exit(1); });
