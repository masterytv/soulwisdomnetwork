// Editor Light (spec 015): the render job as GitHub Actions runs it
// (.github/workflows/podcast_edit_render.yml). Connects Firestore, Cloud Storage and Drive,
// as final.ts does, then hands them to runEditRender in editRenderJob.ts. On failure it
// marks the render failed and emails the alert address, so the Studio can offer a retry. A render with Auphonic
// as its voice clean-up (spec 019 item 3.2) that fails before sending anything gives its hold on the month's
// free hours back (lib/server/spending.ts holdAuphonic).

import * as fs from 'fs';
import * as path from 'path';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { mmss } from '../../../lib/showNotes';
import type { Episode } from '../../../types/episode';
import { EMPTY_LICENCE, type LibraryEntry } from '../../../lib/audio';
import type { AuphonicHold } from '../../../lib/voice';
import { loadAlert } from './config';
import { createDrive, ensureFolder, parentOf, putFile } from './drive';
import { renderEdit } from './editRender';
import { makeEditExports } from './editExport';
import { runEditRender } from './editRenderJob';
import { withRetry } from './errors';
import { cutClip } from './media';
import { teaserAss } from './teaserBanner';
import { FONTS_DIR } from './shortsRender';
import { describeError, failureSubject, sendEmail } from './notify';
import { loadSettings, storageBucket } from './settings';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const episodeId = required('EPISODE_ID');
if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
const alert = loadAlert();
const runUrl = process.env.GITHUB_RUN_URL || '';
const serviceAccount = JSON.parse(required('PODCAST_SA_JSON'));
initializeApp({ credential: cert(serviceAccount), storageBucket: storageBucket() });
const ref = getFirestore().collection('episodes').doc(episodeId);
const bucket = getStorage().bucket();
const drive = createDrive(serviceAccount);
const workDir = path.join(process.env.RUNNER_TEMP || '/tmp', 'edit-render', episodeId);
// Set once audio has gone to Auphonic: its hours are then spent, whatever happens next.
let auphonicSent = false;

// Gives this render's hold on Auphonic's free hours back, in the same document the Studio counts them in.
async function releaseHold() {
    const hold = ((await ref.get()).data() as Episode | undefined)?.editRender?.auphonicHold;
    if (!hold || auphonicSent) return;
    const ledger = getFirestore().collection('studio').doc('spending');
    await getFirestore().runTransaction(async tx => {
        const holds = ((await tx.get(ledger)).get('auphonic') as AuphonicHold[] | undefined) ?? [];
        tx.set(ledger, { auphonic: holds.filter(h => h.id !== hold) }, { merge: true });
    });
}

async function main() {
    const result = await runEditRender(episodeId, {
        getEpisode: async () => (await ref.get()).data() as Episode | undefined,
        download: async (storagePath, dest) => {
            await withRetry('Storage download', () => bucket.file(storagePath).download({ destination: dest }));
        },
        upload: async (local, storagePath, contentType) => {
            await withRetry('Storage upload', () => bucket.upload(local, { destination: storagePath, resumable: true, metadata: { contentType } }));
        },
        // "04 Final" sits beside "02 Processed" unless a folder is set explicitly, as in final.ts.
        // With no Drive folders set up, the video stays in Cloud Storage only.
        saveToDrive: async (local, name, contentType = 'video/mp4', subfolder) => {
            if (!process.env.DRIVE_FINAL_FOLDER_ID && !process.env.DRIVE_PROCESSED_FOLDER_ID) return null;
            const final = process.env.DRIVE_FINAL_FOLDER_ID
                || await ensureFolder(drive, await parentOf(drive, required('DRIVE_PROCESSED_FOLDER_ID')), '04 Final');
            const folderId = subfolder ? await ensureFolder(drive, final, subfolder) : final;
            const fileId = await putFile(drive, folderId, name, contentType, local);
            return { fileId, folderId };
        },
        update: async fields => { await ref.update(fields); },
        removeFolder: async prefix => { await bucket.deleteFiles({ prefix: `${prefix}/` }); },
        exists: async storagePath => (await bucket.file(storagePath).exists())[0],
        render: renderEdit,
        // The files for Resolve, Premiere and Final Cut (spec 019 item 4.1), with the auto-editor the workflow downloads.
        ...(process.env.AUTO_EDITOR_BIN ? { exportEdit: o => makeEditExports({ ...o, bin: process.env.AUTO_EDITOR_BIN! }) } : {}),
        now: () => FieldValue.serverTimestamp(),
        // The Studio settings: intro, teasers, and whether this becomes the final cut.
        settings: await loadSettings(getFirestore()),
        showIntro: path.resolve('public/studio/show-intro.mp4'),
        siteLogo: path.resolve('public/logo.png'),
        // The show library (spec 020 item E7): its entries' licence state, and the log of every use.
        library: async ids => {
            const items = getFirestore().collection('studio').doc('media').collection('items');
            const snaps = await getFirestore().getAll(...ids.map(id => items.doc(id)));
            return new Map(snaps.filter(s => s.exists).map(s => {
                const d = s.data() as Pick<LibraryEntry, 'path' | 'checked' | 'licence'>;
                return [s.id, { path: d.path, checked: d.checked ?? null, licence: { ...EMPTY_LICENCE, ...d.licence } }];
            }));
        },
        logUses: async (ids, use) => {
            const items = getFirestore().collection('studio').doc('media').collection('items');
            await Promise.all(ids.map(id => items.doc(id).update({ uses: FieldValue.arrayUnion(use) })));
        },
        // The edit's own teasers (spec 020 item E10) carry the "In this episode" tag and their speaker, as the package's do.
        cutClip: async (input, output, start, seconds, tag) => {
            if (!tag) { await cutClip(input, output, start, seconds, true); return; }
            const ass = output.replace(/\.mp4$/, '.ass');
            fs.writeFileSync(ass, teaserAss({ speaker: tag.speaker, durationMs: Math.round(seconds * 1000) }));
            await cutClip(input, output, start, seconds, true, { ass, fontsDir: FONTS_DIR });
        },
        // The voice clean-ups (spec 019 item 3.2): the workflow downloads deep-filter; Auphonic's key is a repo secret.
        voice: {
            deepFilter: process.env.DEEPFILTER_BIN || undefined,
            auphonicKey: process.env.AUPHONIC_API_KEY || undefined,
            onAuphonicSending: async () => { auphonicSent = true; },
        },
    }, workDir, process.env.GITHUB_RUN_ID || undefined);
    const episode = (await ref.get()).data() as Episode;
    console.log(`✅ Rendered ${mmss(result.durationSeconds * 1000)}, ${result.cuts} cuts: ${result.driveUrl}`);
    await sendEmail({ alert }, `Editor Light render ready: ${episode.title}`, [
        `The Editor Light render of "${episode.title}" is saved (${mmss(result.durationSeconds * 1000)}, ` +
            `${result.cuts} cuts, ${mmss(result.timeSavedSeconds * 1000)} shorter):`,
        result.driveUrl ?? '(saved in Cloud Storage; open it from the show notes page)',
        ...(result.warnings.length ? ['', 'Check:', ...result.warnings.map(w => `  - ${w}`)] : []),
    ].join('\n'));
}

main().catch(async error => {
    const message = (error as Error).message;
    console.error(`❌ ${message}`);
    await releaseHold().catch(e => console.warn(`⚠️ Could not give Auphonic's hours back: ${(e as Error).message}`));
    await ref.update({
        'editRender.status': 'failed', 'editRender.error': message, 'editRender.finishedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
    await sendEmail({ alert }, failureSubject(`Editor Light render failed: ${episodeId}`, message),
        `The Editor Light render could not be made.\n\n${describeError(message)}\n\nTry again from the show notes page.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
    process.exit(1);
});
