// The voice clean-up bake-off (docs/specs/019-editor-light-v2.md item 3.1): cuts a stretch of an
// episode (10 minutes by default) and makes it up to five ways, each brought to −14 LUFS (cleanupVersions.ts):
// as recorded, today's chain, DeepFilterNet in that chain, Auphonic, and Descript's Studio Sound from
// the same stretch of its final cut. The files are named A, B, C… so they can be heard blind, with the
// key in its own file. They go to Cloud Storage and, when Drive is on, a "Clean-up comparison" folder
// beside "04 Final"; an email gives the links and each one's loudness, time and cost. Read-only: nothing
// on the episode changes. Runs in GitHub Actions (.github/workflows/podcast_cleanup_compare.yml), by hand.

import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { timeMap, type TimedWord } from '../../../lib/retime';
import type { Episode } from '../../../types/episode';
import {
    answerKey, applyChain, auphonicClean, blindLetters, chainFor, chooseStretch, chooseVersions, clock, cutStretch, reportTable,
    type VersionResult,
} from './cleanupVersions';
import { loadAlert } from './config';
import { createDrive, ensureFolder, parentOf, putFile } from './drive';
import { normalizeLoudness } from './media';
import { sendEmail } from './notify';
import { loadSettings, storageBucket } from './settings';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const episodeId = required('EPISODE_ID');
if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
const serviceAccount = JSON.parse(required('PODCAST_SA_JSON'));
initializeApp({ credential: cert(serviceAccount), storageBucket: storageBucket() });

const LINK_MS = 7 * 24 * 3600_000;    // the longest a signed link can last
const workDir = path.join(process.env.RUNNER_TEMP || '/tmp', `cleanup-${episodeId}`);

async function main() {
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const episode = (await db.collection('episodes').doc(episodeId).get()).data() as Episode | undefined;
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    const sourcePath = episode.media?.sourcePath;
    const duration = episode.media?.durationSeconds;
    if (!sourcePath || !duration) throw new Error('The episode has no recording in Cloud Storage yet');
    const { startSec, seconds } = chooseStretch(duration, process.env.CLEANUP_START, process.env.CLEANUP_MINUTES);
    const kinds = chooseVersions(process.env.CLEANUP_VERSIONS);
    const runId = process.env.GITHUB_RUN_ID || String(Date.now());
    const letters = blindLetters(kinds, Number(runId.slice(-9)) || Date.now());
    const span = `${clock(startSec)}–${clock(startSec + seconds)}`;
    console.log(`🎧 ${episode.title}: ${span}; ${kinds.join(', ')}`);

    rmSync(workDir, { recursive: true, force: true });
    mkdirSync(workDir, { recursive: true });
    const link = async (p: string) => (await bucket.file(p).getSignedUrl({ action: 'read', expires: Date.now() + LINK_MS }))[0];
    const stretch = path.join(workDir, 'stretch.wav');
    await cutStretch(await link(sourcePath), startSec, seconds, stretch);

    const results: VersionResult[] = [];
    for (const kind of kinds) {
        const letter = letters.get(kind)!;
        const raw = path.join(workDir, `${kind}.raw.${kind === 'auphonic' ? 'flac' : 'wav'}`);
        const file = path.join(workDir, `${letter}.m4a`);
        const t0 = Date.now();
        try {
            let cost = 'runner time only';
            if (kind === 'auphonic') {
                const key = process.env.AUPHONIC_API_KEY;
                if (!key) throw new Error('no AUPHONIC_API_KEY repo secret');
                await auphonicClean(stretch, raw, key, `Clean-up comparison: ${episode.title} ${span}`);
                cost = `${Math.ceil(seconds / 60)} min of Auphonic credit (2 h free a month)`;
            } else if (kind === 'descript') {
                await descriptStretch(episode, startSec, seconds, raw, link);
                cost = 'already paid (Descript)';
            } else {
                await applyChain(stretch, chainFor(kind, process.env.DEEPFILTER_LADSPA), raw);
            }
            const took = (Date.now() - t0) / 1000;
            const loud = await normalizeLoudness(raw, file);
            results.push({ kind, letter, file, beforeLufs: loud.beforeLufs, afterLufs: loud.afterLufs, truePeak: loud.truePeak, seconds: took, cost });
            // The log names the version but never its letter, so it cannot give the key away.
            console.log(`  ✅ ${kind}: ${Math.round(took)} s`);
        } catch (error) {
            results.push({ kind, letter, note: (error as Error).message });
            console.warn(`  ⚠️ ${kind} not made: ${(error as Error).message}`);
        }
    }
    if (!results.some(r => r.file)) throw new Error(`No version was made. ${results.map(r => `${r.kind}: ${r.note}`).join('; ')}`);

    // Cloud Storage always; Drive too when the Studio uses it.
    const prefix = `episodes/${episodeId}/cleanup-compare/${runId}`;
    const key = path.join(workDir, 'Which is which.txt');
    const keyText = `Clean-up comparison: ${episode.title}, ${span}\nListen first; then:\n\n${answerKey(results)}`;
    writeFileSync(key, keyText);
    const links: string[] = [];
    for (const r of results.filter(x => x.file)) {
        const p = `${prefix}/${r.letter}.m4a`;
        await bucket.upload(r.file!, { destination: p, contentType: 'audio/mp4' });
        links.push(`${r.letter}: ${await link(p)}`);
    }
    await bucket.upload(key, { destination: `${prefix}/which-is-which.txt`, contentType: 'text/plain; charset=utf-8' });

    let folderUrl: string | null = null;
    const settings = await loadSettings(db);
    if (settings.useDrive && process.env.DRIVE_PROCESSED_FOLDER_ID) {
        try {
            const drive = createDrive(serviceAccount);
            const root = await ensureFolder(drive, await parentOf(drive, process.env.DRIVE_PROCESSED_FOLDER_ID), 'Clean-up comparison');
            const folder = await ensureFolder(drive, root, `${episode.title.replace(/[\\/]/g, '-')} ${span.replace(/:/g, '.')} (${runId})`);
            for (const r of results.filter(x => x.file)) await putFile(drive, folder, `${r.letter}.m4a`, 'audio/mp4', r.file!);
            await putFile(drive, folder, 'Which is which.txt', 'text/plain', key);
            folderUrl = `https://drive.google.com/drive/folders/${folder}`;
        } catch (error) {
            console.warn(`  ⚠️ Not saved to Drive: ${(error as Error).message}`);
        }
    }

    const table = reportTable(results);
    const summary = `## Clean-up comparison: ${episode.title}, ${span}\n\n${table}\n`;
    // The run log is public: it gets the numbers by letter, never the key or the links.
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log(summary);
    await sendEmail({ alert: loadAlert() }, `Clean-up comparison: ${episode.title}`, [
        `The same ${clock(seconds)} of "${episode.title}" (${span}), cleaned up ${results.filter(r => r.file).length} ways, all brought to −14 LUFS.`,
        'Listen without knowing which is which, pick the best, then open the attached "which-is-which.txt" (also beside the files).',
        '',
        folderUrl ? `In Drive: ${folderUrl}` : 'Links (for 7 days):',
        ...(folderUrl ? ['', 'Or for 7 days:'] : []),
        ...links,
        '',
        table,
        '',
        'Nothing on the episode was changed. Write the choice and why in spec 015 (spec 019 item 3.1).',
    ].join('\n'), [{ filename: 'which-is-which.txt', content: keyText }]);
    rmSync(workDir, { recursive: true, force: true });
}

// The same stretch of Descript's final cut, found through the words: where the stretch's start and end
// fall in the final cut, which is shorter wherever the edit cut something.
async function descriptStretch(episode: Episode, startSec: number, seconds: number, out: string, link: (p: string) => Promise<string>) {
    const final = episode.final;
    if (final?.status !== 'ready' || !final.videoPath) throw new Error('there is no final cut yet');
    if (final.source === 'editorLight' || !final.projectId) throw new Error("the final cut is the Studio's render, not Descript's");
    if (!final.wordsPath || !episode.review?.reviewedPath || !final.durationSeconds) throw new Error('the final cut has no words to line it up with');
    const bucket = getStorage().bucket();
    const read = async (p: string) => JSON.parse((await bucket.file(p).download())[0].toString('utf8'));
    const finalWords = (await read(final.wordsPath) as { words: TimedWord[] }).words;
    const original = (await read(episode.review.reviewedPath) as { lines: { words: TimedWord[] }[] }).lines.flatMap(l => l.words);
    const map = timeMap(original, finalWords, final.durationSeconds * 1000);
    if (map.coverage < 0.5) throw new Error(`the final cut matches only ${Math.round(map.coverage * 100)}% of the recording's words`);
    const from = map.at(startSec * 1000) / 1000, to = map.at((startSec + seconds) * 1000) / 1000;
    if (to - from < 30) throw new Error('that stretch is almost all cut from the final cut');
    await cutStretch(await link(final.videoPath), from, to - from, out);
}

main().catch(error => {
    console.error(`❌ ${(error as Error).message}`);
    process.exit(1);
});
