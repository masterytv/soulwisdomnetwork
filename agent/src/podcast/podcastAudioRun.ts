// The audio podcast feed's MP3 (docs/specs/019-editor-light-v2.md item 5.1) as GitHub Actions runs it
// (.github/workflows/podcast_audio.yml), started from the show notes page: downloads the final cut and the show's
// artwork, makes the MP3 (podcastAudio.ts) and saves it to Cloud Storage, where the site's feed serves it from.
// Whether it is in the feed is the producer's choice in the Studio; making it again keeps that.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { podcastText } from '../../../lib/podcastFeed';
import type { Episode } from '../../../types/episode';
import { loadAlert } from './config';
import { withRetry } from './errors';
import { probeDuration } from './media';
import { describeError, failureSubject, sendEmail } from './notify';
import { makePodcastMp3 } from './podcastAudio';
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
initializeApp({ credential: cert(JSON.parse(required('PODCAST_SA_JSON'))), storageBucket: storageBucket() });
const db = getFirestore();
const ref = db.collection('episodes').doc(episodeId);
const bucket = getStorage().bucket();
const workDir = path.join(process.env.RUNNER_TEMP || '/tmp', 'podcast-audio', episodeId);

async function main() {
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    const final = episode.final;
    if (final?.status !== 'ready' || !final.videoPath) throw new Error('Get the final cut first');
    const settings = await loadSettings(db);
    await ref.update({ 'podcast.status': 'making', 'podcast.startedAt': FieldValue.serverTimestamp(), 'podcast.error': null });
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });

    const video = path.join(workDir, `final${path.extname(final.videoPath) || '.mp4'}`);
    await withRetry('Storage download', () => bucket.file(final.videoPath!).download({ destination: video }));
    // The feed's artwork, else the Studio's logo, else the site's.
    let art: string | null = null;
    for (const p of [settings.podcastArtPath, settings.logoPath]) {
        if (!p) continue;
        art = path.join(workDir, `art${path.extname(p) || '.png'}`);
        await withRetry('Storage download', () => bucket.file(p).download({ destination: art! }));
        break;
    }
    if (!art && fs.existsSync(path.resolve('public/logo.png'))) art = path.resolve('public/logo.png');

    const durationMs = Math.round((await probeDuration(video)) * 1000);
    const { title } = podcastText(episode, settings);
    const out = path.join(workDir, 'episode.mp3');
    const loud = await makePodcastMp3({
        video, out, title, artist: settings.showName, durationMs, art, background: settings.colors.background,
        chapters: (final.chapters ?? []).map(c => ({ title: c.title, startMs: c.startMs })),
    });
    const audioPath = `episodes/${episodeId}/podcast/episode.mp3`;
    await withRetry('Storage upload', () => bucket.upload(out, { destination: audioPath, resumable: true, metadata: { contentType: 'audio/mpeg' } }));
    const finishedAt = final.finishedAt as Timestamp | undefined;
    await ref.update({
        'podcast.status': 'ready', 'podcast.audioPath': audioPath, 'podcast.bytes': fs.statSync(out).size,
        'podcast.durationSeconds': durationMs / 1000, 'podcast.finalAt': finishedAt?.toMillis?.() ?? 0,
        'podcast.loudness': { afterLufs: loud.afterLufs, truePeak: loud.truePeak },
        'podcast.finishedAt': FieldValue.serverTimestamp(), 'podcast.error': null, updatedAt: FieldValue.serverTimestamp(),
    });
    fs.rmSync(workDir, { recursive: true, force: true });
    console.log(`✅ ${title}: MP3 at ${loud.afterLufs.toFixed(1)} LUFS, ${(final.chapters ?? []).length} chapters`);
}

main().catch(async error => {
    const message = (error as Error).message;
    console.error(`❌ ${message}`);
    await ref.update({ 'podcast.status': 'failed', 'podcast.error': message, 'podcast.finishedAt': FieldValue.serverTimestamp() }).catch(() => {});
    await sendEmail({ alert }, failureSubject(`Podcast audio failed: ${episodeId}`, message),
        `The podcast feed's MP3 could not be made.\n\n${describeError(message)}\n\nTry again from the show notes page.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
    process.exit(1);
});
