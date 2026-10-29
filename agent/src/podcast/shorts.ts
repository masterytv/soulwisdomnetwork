// Spec 005 step 14: Shorts from the key quotes, cut from the final cut (docs/specs/013-shorts.md).
// Four jobs, picked by SHORTS_MODE:
//   pick     Claude reads the final cut and suggests the moments that would make the strongest
//            YouTube Shorts, best first, each with a score out of 10, a hook and a reason,
//            following the producer's direction if given
//   titles   Claude writes a headline and a YouTube title for each short the producer picked
//            from the key quotes and has not given both yet
//   render   draws each short that changed: 1080x1920, the episode's picture trimmed at the
//            sides above large word-by-word captions, in the brand look (shortsRender.ts)
//   upload   uploads the shorts approved at Checkpoint E to YouTube, Private and scheduled one a
//            day, each linking to the full episode
// The producer edits, watches and approves them on the show notes page in between. Runs in GitHub
// Actions (.github/workflows/podcast_shorts.yml). No Descript: nothing here uses its credits.

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { TimedWord } from '../../../lib/retime';
import {
    aspectRatio, DEFAULT_ASPECT, renderInputs, sameRender, SHORT_HEIGHT, SHORT_MAX_MS, SHORT_MIN_MS, SHORT_TITLE_MAX,
    SHORT_WIDTH, shortLayout, shortMetadata, ShortTextsSchema, wordsBetween,
    HEADLINE_MAX_CHARS, type ShortAspect,
} from '../../../lib/shorts';
import { shortsSystemPrompt, type StudioSettings } from '../../../lib/studioSettings';
import { YOUTUBE_CATEGORY } from '../../../lib/youtube';
import type { Episode, ShortItem } from '../../../types/episode';
import { loadAlert } from './config';
import { withRetry } from './errors';
import { redactUrls, renderShort, runWithLog, shortBackground, urlInputOptions } from './media';
import { NOTES_EFFORT, NOTES_MODEL } from './notesDraft';
import { describeError, failureSubject, sendEmail } from './notify';
import { loadSettings, storageBucket } from './settings';
import { FONTS_DIR, LOGO, shortAss } from './shortsRender';
import { createYoutube, YoutubeError } from './youtubeApi';
import {
    PICK_ASK, PICK_COUNT, pickInstructions, pickingTranscript, rankPicks, ShortPicksSchema, snapPick, speakerFor,
} from '../../../lib/shortPicks';
import { randomUUID } from 'node:crypto';

// US dollars per million tokens, for the cost record.
const TEXTS_USD_PER_MTOK = { input: 4, output: 20 };
// YouTube needs a scheduled time comfortably in the future.
const MIN_LEAD_MS = 10 * 60_000;

type Mode = 'pick' | 'titles' | 'render' | 'upload';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const episodeId = required('EPISODE_ID');
if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
const mode = required('SHORTS_MODE') as Mode;
// A debug run (podcast_shorts.yml debug_short): one short, every step timed, nothing written to the episode.
const debugKey = process.env.SHORTS_DEBUG?.trim() || '';
if (!['pick', 'titles', 'render', 'upload'].includes(mode)) throw new Error(`Not a shorts job: ${mode}`);
const alert = loadAlert();
const runUrl = process.env.GITHUB_RUN_URL || '';
const serviceAccount = JSON.parse(required('PODCAST_SA_JSON'));
initializeApp({ credential: cert(serviceAccount), storageBucket: storageBucket() });
const db = getFirestore();
const ref = db.collection('episodes').doc(episodeId);
const bucket = getStorage().bucket();
const workDir = path.join(process.env.RUNNER_TEMP || '/tmp', 'shorts', episodeId);
// The Studio settings (lib/studioSettings.ts): writing, brand colours, logo, links. Loaded first in main().
let settings: StudioSettings;
let notesPage = `https://soulwisdomcollective.com/admin/podcast/${episodeId}/notes#shorts`;

const finalAtOf = (episode: Episode) => (episode.final?.finishedAt as Timestamp | undefined)?.toMillis?.() ?? 0;

async function loadWords(episode: Episode) {
    if (!episode.final?.wordsPath) throw new Error('The final cut has no transcript; get the final cut again');
    const [raw] = await withRetry('Storage download', () => bucket.file(episode.final!.wordsPath!).download());
    return (JSON.parse(raw.toString('utf8')) as { words: TimedWord[] }).words;
}

// Changes one short without touching the others, which the producer may be editing.
async function updateItem(id: string, change: (item: ShortItem) => ShortItem) {
    await db.runTransaction(async tx => {
        const shorts = ((await tx.get(ref)).data() as Episode | undefined)?.shorts;
        if (!shorts) return;
        tx.update(ref, { 'shorts.items': shorts.items.map(i => (i.id === id ? change(i) : i)) });
    });
}

// The instructions come from the Studio settings (lib/studioSettings.ts shortsSystemPrompt).

// Claude reads the final cut and picks the moments that would make the strongest Shorts.
async function pickMoments(episode: Episode, words: TimedWord[]) {
    const notes = episode.notes!.approved!;
    const quotes = episode.final!.quotes ?? [];
    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    let userMessage = `Episode: ${notes.titles[notes.chosenTitle] ?? episode.title}\n\nSummary:\n${notes.summary}\n\n`;
    if (quotes.length) {
        userMessage += 'Key quotes, to tell who is speaking:\n' +
            quotes.map(q => `[${q.startMs}ms] ${q.speaker}: ${q.text}`).join('\n') + '\n\n';
    }
    userMessage += `The final cut, each line starting with its time in milliseconds:\n${pickingTranscript(words)}\n\n` +
        pickInstructions(PICK_ASK, episode.shorts?.direction ?? '');
    const response = await client.beta.messages.stream({
        model: NOTES_MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: NOTES_EFFORT, format: betaZodOutputFormat(ShortPicksSchema) },
        system: shortsSystemPrompt(settings),
        messages: [{ role: 'user', content: userMessage }],
    }).finalMessage();
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to pick moments for Shorts');
    if (!response.parsed_output) throw new Error('Claude returned its picks in an unexpected shape');
    const { input_tokens, output_tokens } = response.usage;
    const usd = Math.round((input_tokens * TEXTS_USD_PER_MTOK.input + output_tokens * TEXTS_USD_PER_MTOK.output) / 1e4) / 100;
    // For each pick: snap to clean word ends, drop nulls, and take the speaker from the key quotes.
    const snapped = response.parsed_output.picks
        .map(p => {
            const s = snapPick(words, p.startMs, p.endMs);
            if (!s) return null;
            return {
                startMs: s.startMs,
                endMs: s.endMs,
                score: p.score,
                speaker: speakerFor(quotes, s.startMs, s.endMs, p.speaker),
                hook: p.hook,
                reason: p.reason,
            };
        })
        .filter((s): s is NonNullable<typeof s> => !!s);
    const ranked = rankPicks(snapped, PICK_COUNT);
    const suggestions = ranked.map(r => ({ ...r, id: randomUUID().slice(0, 8) }));
    if (!suggestions.length) throw new Error("None of Claude's picks fit a Short (5 seconds to 3 minutes); try again");
    return { suggestions, usd };
}


// Headlines and titles for the shorts that lack one or the other; the producer picked the moments.
// Shorts are numbered for Claude (random ids are easy to copy wrong); any it leaves out are asked
// for once more.
async function writeTexts(episode: Episode, words: TimedWord[]) {
    const todo = (episode.shorts?.items ?? []).filter(i => !i.youtube && (!i.headline.trim() || !i.title.trim()));
    if (!todo.length) throw new Error('Every short already has a headline and a title; clear one to have it rewritten');
    const notes = episode.notes!.approved!;
    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    const texts = new Map<string, { headline: string; title: string }>();
    let usd = 0;
    for (let round = 1; round <= 2; round++) {
        const batch = todo.filter(i => !texts.has(i.id));
        if (!batch.length) break;
        const listing = batch.map((i, n) => `Short ${n + 1} (${i.speaker}, ${Math.round((i.endMs - i.startMs) / 1000)}s):\n` +
            wordsBetween(words, i.startMs, i.endMs).map(w => w.text).join(' ')).join('\n\n');
        const response = await client.beta.messages.stream({
            model: NOTES_MODEL,
            max_tokens: 32000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            thinking: { type: 'adaptive' },
            output_config: { effort: NOTES_EFFORT, format: betaZodOutputFormat(ShortTextsSchema) },
            system: shortsSystemPrompt(settings),
            messages: [{
                role: 'user',
                content: `Episode: ${notes.titles[notes.chosenTitle] ?? episode.title}\n\nSummary:\n${notes.summary}\n\n` +
                    `These ${batch.length} Shorts were cut from the episode; each is shown with the words heard in it.\n\n${listing}\n\n` +
                    `Write a headline and a YouTube title for every one of the ${batch.length}, numbered as above. Each should make ` +
                    'someone stop scrolling and fit what is actually said in that Short.',
            }],
        }).finalMessage();
        if (response.stop_reason === 'refusal') throw new Error('Claude declined to write the headlines and titles');
        if (!response.parsed_output) throw new Error('Claude returned headlines and titles in an unexpected shape');
        const { input_tokens, output_tokens } = response.usage;
        usd += (input_tokens * TEXTS_USD_PER_MTOK.input + output_tokens * TEXTS_USD_PER_MTOK.output) / 1e6;
        for (const t of response.parsed_output.shorts) {
            const item = batch[t.short - 1];
            const headline = t.headline.replace(/\s+/g, ' ').trim().slice(0, HEADLINE_MAX_CHARS);
            const title = t.title.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, SHORT_TITLE_MAX);
            if (!item || !headline || !title) continue;
            texts.set(item.id, { headline, title });
            console.log(`  ✅ ${headline} | ${title}`);
        }
        console.log(`  Round ${round}: ${texts.size} of ${todo.length} done`);
    }
    const missing = todo.length - texts.size;
    return {
        texts, usd: Math.round(usd * 100) / 100,
        warnings: missing ? [`Claude left out ${missing} short${missing === 1 ? '' : 's'}; press the button again for ${missing === 1 ? 'it' : 'them'}.`] : [],
    };
}

// The backdrop every short of this aspect is drawn on: the settings' logo when one is uploaded, the site's otherwise.
async function makeBackground(aspect: ShortAspect) {
    const l = shortLayout(aspect);
    const background = path.join(workDir, 'background.png');
    let logo = LOGO;
    if (settings.logoPath) {
        logo = path.join(workDir, `logo${path.extname(settings.logoPath)}`);
        await withRetry('Storage download', () => bucket.file(settings.logoPath!).download({ destination: logo }));
    }
    await shortBackground(logo, background, {
        width: SHORT_WIDTH, height: SHORT_HEIGHT, logoSize: l.logo.size, logoTop: l.logo.top, videoTop: l.video.top, videoHeight: l.video.height,
    }, settings.colors);
    return background;
}

// ffmpeg reads the final cut straight from Storage, only around each short.
async function finalCutUrl(episode: Episode) {
    const [url] = await bucket.file(episode.final!.videoPath!).getSignedUrl({ action: 'read', expires: Date.now() + 3 * 60 * 60_000 });
    return url;
}

// Each step of a run with the time since it started, so a log shows where a run is, or where it stopped.
const runStarted = Date.now();
const step = (what: string) => console.log(`  [${((Date.now() - runStarted) / 1000).toFixed(0)} s] ${what}`);

async function render(episode: Episode, words: TimedWord[]) {
    const shorts = episode.shorts!;
    const finalAt = finalAtOf(episode);
    const aspect: ShortAspect = shorts.aspect ?? DEFAULT_ASPECT;
    const todo = shorts.items.filter(i => !i.youtube && !sameRender(i.render, renderInputs(i, aspect, finalAt)));
    if (!todo.length) throw new Error('Every short is already made; change one first');
    const l = shortLayout(aspect);
    const background = await makeBackground(aspect);
    const url = await finalCutUrl(episode);
    const warnings: string[] = [];
    const fmtTime = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    let done = 0;
    for (const item of todo) {
        const inputs = renderInputs(item, aspect, finalAt);
        const durationMs = inputs.endMs - inputs.startMs;
        if (durationMs < SHORT_MIN_MS || durationMs > SHORT_MAX_MS) {
            warnings.push(`"${item.title}" is ${(durationMs / 1000).toFixed(1)}s long; a Short must be 5 seconds to 3 minutes, so it was not made.`);
            continue;
        }
        const ass = path.join(workDir, `${item.id}.ass`);
        fs.writeFileSync(ass, shortAss({
            headline: inputs.headline, speaker: inputs.speaker, words: wordsBetween(words, inputs.startMs, inputs.endMs),
            startMs: inputs.startMs, durationMs, aspect, colors: settings.colors,
        }));
        const local = path.join(workDir, `${item.id}.mp4`);
        step(`${item.title} (${fmtTime(inputs.startMs)}–${fmtTime(inputs.endMs)}): rendering`);
        // One short that cannot be made (stuck past its time limit, or refused by ffmpeg) is reported and the
        // rest are still made: the job fails only when none could be.
        try {
            await withRetry('Render', () => renderShort(url, local, {
                startSeconds: inputs.startMs / 1000, durationSeconds: durationMs / 1000, aspect: aspectRatio(aspect),
                background, ass, fontsDir: FONTS_DIR, width: SHORT_WIDTH, videoTop: l.video.top,
            }), 2);
        } catch (error) {
            const message = (error as Error).message;
            console.warn(`  ⚠️ ${item.title}: ${message}`);
            warnings.push(`"${item.title}" (${fmtTime(inputs.startMs)}–${fmtTime(inputs.endMs)}) could not be made: ${message.slice(0, 400)}`);
            continue;
        }
        const renderedAt = Date.now();
        const dest = `episodes/${episodeId}/shorts/${item.id}-${renderedAt}.mp4`;
        step(`${item.title}: uploading`);
        await withRetry('Storage upload', () => bucket.upload(local, { destination: dest, metadata: { contentType: 'video/mp4' } }));
        step(`${item.title}: saving`);
        const previous = item.render?.path;
        await updateItem(item.id, i => ({ ...i, render: { ...inputs, path: dest, renderedAt, durationMs }, approved: null }));
        if (previous) await bucket.file(previous).delete().catch(() => {});
        // A short cut from a final cut with show library sounds may carry them: noted on each entry (spec 020
        // item E7), so a Content ID claim on the short can be traced to its licence.
        const library = episode.final?.library ?? [];
        if (library.length) {
            const items = db.collection('studio').doc('media').collection('items');
            const use = { episodeId, kind: 'short', ref: dest, at: new Date().toISOString() };
            await Promise.all(library.map(id => items.doc(id).update({ uses: FieldValue.arrayUnion(use) })))
                .catch(error => console.warn(`⚠️ Could not log the library's uses: ${(error as Error).message}`));
        }
        done++;
        console.log(`  ✅ ${item.title} (${Math.round(durationMs / 1000)}s)`);
    }
    if (!done) throw new Error(warnings[0] ?? 'No short could be made');
    return { done, warnings };
}

async function upload(episode: Episode, words: TimedWord[]) {
    const shorts = episode.shorts!;
    const notes = episode.notes!.approved!;
    // The episode once it is on YouTube; before that, the podcast playlist, then the site.
    const playlistId = process.env.YOUTUBE_PLAYLIST_ID?.trim();
    const link = episode.youtube?.url ? { url: episode.youtube.url, linkText: 'Watch the full conversation' }
        : playlistId ? { url: `https://www.youtube.com/playlist?list=${playlistId}`, linkText: 'Full episodes' }
            : { url: settings.siteUrl, linkText: 'Full episodes' };
    const youtube = createYoutube({
        clientId: required('YOUTUBE_CLIENT_ID'),
        clientSecret: required('YOUTUBE_CLIENT_SECRET'),
        refreshToken: required('YOUTUBE_REFRESH_TOKEN'),
    });
    const aspect = shorts.aspect ?? DEFAULT_ASPECT;
    const finalAt = finalAtOf(episode);
    const todo = shorts.items
        .filter(i => !i.youtube && i.publishAt && i.render && i.approved?.renderedAt === i.render.renderedAt &&
            sameRender(i.render, renderInputs(i, aspect, finalAt)))
        .sort((a, b) => a.publishAt! - b.publishAt!);
    if (!todo.length) throw new Error('No approved short is waiting to be scheduled');
    const warnings: string[] = [];
    const scheduled: { title: string; url: string; publishAt: number }[] = [];
    for (const item of todo) {
        if (item.publishAt! < Date.now() + MIN_LEAD_MS) {
            const message = 'Its time slot has passed; schedule it again.';
            await updateItem(item.id, i => ({ ...i, error: message }));
            warnings.push(`"${item.title}": ${message}`);
            continue;
        }
        const spoken = wordsBetween(words, item.startMs, item.endMs).map(w => w.text).join(' ');
        const meta = shortMetadata(item, spoken, { ...link, hashtags: notes.hashtags, tags: notes.tags, credits: episode.final?.credits ?? [] });
        const local = path.join(workDir, `${item.id}.mp4`);
        await withRetry('Storage download', () => bucket.file(item.render!.path).download({ destination: local }));
        const publishAt = new Date(item.publishAt!).toISOString();
        console.log(`🎬 Uploading "${meta.title}" for ${publishAt}`);
        try {
            const video = await youtube.upload(local, {
                snippet: {
                    title: meta.title, description: meta.description, tags: meta.tags, categoryId: YOUTUBE_CATEGORY,
                    defaultLanguage: 'en', defaultAudioLanguage: 'en',
                },
                status: {
                    privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false,
                    containsSyntheticMedia: meta.containsSyntheticMedia, embeddable: true, license: 'youtube',
                },
            });
            if (!video.id) throw new Error('YouTube did not return a video ID');
            const youtubeUrl = `https://youtube.com/shorts/${video.id}`;
            // Recorded straight away, so a failure later never leads to a second copy.
            await updateItem(item.id, i => ({
                ...i, error: null, youtube: { videoId: video.id!, url: youtubeUrl, publishAt: item.publishAt!, uploadedAt: Date.now() },
            }));
            scheduled.push({ title: meta.title, url: youtubeUrl, publishAt: item.publishAt! });
            console.log(`  ✅ ${youtubeUrl}`);
        } catch (error) {
            const message = (error as Error).message;
            console.warn(`  ⚠️ ${message}`);
            await updateItem(item.id, i => ({ ...i, error: message }));
            warnings.push(`"${item.title}": ${message}`);
            // Out of quota: the rest would fail the same way today.
            if (error instanceof YoutubeError && ['quotaExceeded', 'uploadLimitExceeded'].includes(error.reason)) {
                warnings.push('The rest wait until tomorrow; press "Schedule on YouTube" again then.');
                break;
            }
        } finally {
            fs.rmSync(local, { force: true });
        }
    }
    return { scheduled, warnings };
}

// In the producer's time zone, as the Studio sent it.
function when(ms: number, timeZone = 'UTC') {
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
    try {
        return new Date(ms).toLocaleString('en-GB', { ...options, timeZone });
    } catch {
        return new Date(ms).toLocaleString('en-GB', { ...options, timeZone: 'UTC' });
    }
}

// A debug run of one short (`key`: its number as the Studio lists it, or its id). It writes nothing to the episode and
// emails no one; each step is timed and limited, ffmpeg prints its own detail into the log as it goes, and a step that
// fails or hangs is reported and the next one still runs. The steps take apart what making a short does: read the
// final cut over the network, cut the short's stretch out of it as it is, look at that stretch's timestamps, make the
// short from the local copy, make it as the job does (from Storage), and upload it (to a debug path, then deleted).
// `key` is the short's number or id; "2 files" only cuts its stretch (and a wider one) for the workflow to keep as
// a download, without the renders, so the real bytes can be tried anywhere.
async function debugShort(episode: Episode, debug: string) {
    const [key, only] = debug.split(/\s+/);
    const items = episode.shorts?.items ?? [];
    const item = /^\d+$/.test(key) ? items[Number(key) - 1] : items.find(i => i.id === key);
    if (!item) throw new Error(`No short ${key}: there are ${items.length}`);
    const limit = <T>(what: string, ms: number, p: Promise<T>) => Promise.race([p,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what}: still not done after ${ms / 1000} s`)), ms))]);
    const attempt = async (what: string, fn: () => Promise<string | void>) => {
        step(`${what}…`);
        try { const said = await fn(); step(`${what}: done${said ? ` (${said})` : ''}`); return true; } catch (error) { step(`${what}: FAILED: ${redactUrls((error as Error).message)}`); return false; }
    };
    const aspect: ShortAspect = episode.shorts!.aspect ?? DEFAULT_ASPECT;
    const inputs = renderInputs(item, aspect, finalAtOf(episode));
    const durationMs = inputs.endMs - inputs.startMs;
    step(`DEBUG short ${key}: ${JSON.stringify({ id: item.id, title: item.title, startMs: inputs.startMs, endMs: inputs.endMs, durationMs, aspect, made: !!item.render, onYoutube: !!item.youtube })}`);
    step(`final cut ${episode.final!.videoPath}, finished ${new Date(finalAtOf(episode)).toISOString()}`);
    fs.mkdirSync(workDir, { recursive: true });
    let words: TimedWord[] = [];
    await attempt('the final cut\'s words', async () => { words = await limit('words', 120_000, loadWords(episode)); return `${words.length} words`; });
    let background = '';
    await attempt('the backdrop', async () => { background = await limit('backdrop', 120_000, makeBackground(aspect)); });
    let url = '';
    await attempt('a link to the final cut', async () => { url = await limit('link', 60_000, finalCutUrl(episode)); });
    await attempt('ffprobe the final cut over the network', async () =>
        (await runWithLog('ffprobe', ['-v', 'error', ...urlInputOptions(url, 30), '-show_entries',
            'format=duration,size,bit_rate:stream=index,codec_type,codec_name,profile,width,height,r_frame_rate,avg_frame_rate,start_time,duration,nb_frames,sample_rate',
            '-of', 'compact', url], 90_000)).stdout.trim().replace(/\n/g, ' | '));
    const seg = path.join(workDir, `${item.id}-stretch.mkv`);
    const start = (inputs.startMs / 1000).toFixed(3), seconds = (durationMs / 1000).toFixed(3);
    await attempt('cut the stretch out of the final cut, as it is (no re-encoding)', async () => {
        await runWithLog('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'verbose', '-stats_period', '5', ...urlInputOptions(url, 30),
            '-ss', start, '-t', seconds, '-i', url, '-map', '0', '-c', 'copy', seg], 240_000, true);
        return `${fs.statSync(seg).size} bytes`;
    });
    await attempt('the stretch\'s timestamps', async () => {
        const { stdout } = await runWithLog('ffprobe', ['-v', 'error', '-show_entries', 'packet=stream_index,pts_time,dts_time,duration_time,flags', '-of', 'csv=p=0', seg], 120_000);
        const streams = new Map<string, { n: number; first: number; last: number; back: number; gap: number; keys: number; noPts: number }>();
        for (const line of stdout.trim().split('\n')) {
            const [s, pts, dts, , flags] = line.split(',');
            const t = Number(dts !== 'N/A' ? dts : pts);
            const x = streams.get(s) ?? { n: 0, first: t, last: t, back: 0, gap: 0, keys: 0, noPts: 0 };
            if (x.n && t < x.last) x.back++;
            if (x.n) x.gap = Math.max(x.gap, t - x.last);
            if (pts === 'N/A') x.noPts++;
            if (flags?.includes('K')) x.keys++;
            x.n++; x.last = t;
            streams.set(s, x);
        }
        return [...streams].map(([s, x]) => `stream ${s}: ${x.n} packets ${x.first}–${x.last} s, ${x.keys} key, ${x.back} going back, ${x.noPts} without a time, largest gap ${x.gap.toFixed(3)} s`).join(' | ');
    });
    // Ten seconds either side too, for a stretch that hangs only when read from further back.
    await attempt('cut a wider stretch (10 s either side)', async () => {
        const wide = path.join(workDir, `${item.id}-wide.mkv`);
        await runWithLog('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...urlInputOptions(url, 30),
            '-ss', Math.max(0, inputs.startMs / 1000 - 10).toFixed(3), '-t', (durationMs / 1000 + 20).toFixed(3), '-i', url, '-map', '0', '-c', 'copy', wide], 240_000);
        return `${fs.statSync(wide).size} bytes`;
    });
    const ass = path.join(workDir, `${item.id}.ass`);
    fs.writeFileSync(ass, shortAss({
        headline: inputs.headline, speaker: inputs.speaker, words: wordsBetween(words, inputs.startMs, inputs.endMs),
        startMs: inputs.startMs, durationMs, aspect, colors: settings.colors,
    }));
    step(`captions file: ${fs.readFileSync(ass, 'utf8').split('\n').filter(l => l.startsWith('Dialogue')).length} lines; headline ${JSON.stringify(inputs.headline)}`);
    if (only === 'files') {
        // Into the episode's Storage too, with links good for an hour, for a machine that cannot reach GitHub's downloads.
        for (const name of [`${item.id}-stretch.mkv`, `${item.id}-wide.mkv`, `${item.id}.ass`, 'background.png']) {
            const local = path.join(workDir, name);
            if (!fs.existsSync(local)) continue;
            const dest = `episodes/${episodeId}/shorts-debug/${name}`;
            await attempt(`keep ${name} in Storage`, async () => {
                await limit('upload', 180_000, bucket.upload(local, { destination: dest }));
                const [link] = await bucket.file(dest).getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60_000 });
                console.log(`DEBUG FILE ${name} ${link}`);
            });
        }
        step('DEBUG done (files only): nothing was written to the episode');
        return;
    }
    const l = shortLayout(aspect);
    const options = { startSeconds: inputs.startMs / 1000, durationSeconds: durationMs / 1000, aspect: aspectRatio(aspect), background, ass,
        fontsDir: FONTS_DIR, width: SHORT_WIDTH, videoTop: l.video.top, verbose: true };
    if (fs.existsSync(seg)) {
        await attempt('make the short from the local stretch', async () => {
            const out = path.join(workDir, `${item.id}-local.mp4`);
            // The stretch starts at the keyframe before the short, so it is read from its own start for the whole length.
            await renderShort(seg, out, { ...options, startSeconds: 0, timeLimitMs: 300_000 });
            return `${fs.statSync(out).size} bytes`;
        });
    }
    // The burned-in text taken apart: no text, the headline and name alone, the captions alone (each from the local
    // stretch, 2 minutes at most), so a short that hangs on its text says which part.
    if (fs.existsSync(seg)) {
        const lines = fs.readFileSync(ass, 'utf8').split('\n');
        const head = lines.filter(x => !x.startsWith('Dialogue'));
        const parts: [string, (x: string) => boolean][] = [
            ['no text', () => false],
            ['the headline and name only', x => /,(Headline|Speaker),/.test(x)],
            ['the captions only', x => /,Caption,/.test(x)],
        ];
        for (const [what, keep] of parts) {
            const partAss = path.join(workDir, `${item.id}-${what.replace(/\W+/g, '-')}.ass`);
            fs.writeFileSync(partAss, [...head, ...lines.filter(x => x.startsWith('Dialogue') && keep(x))].join('\n'));
            await attempt(`make it with ${what}`, async () => {
                const part = path.join(workDir, `${item.id}-part.mp4`);
                await renderShort(seg, part, { ...options, ass: partAss, startSeconds: 0, verbose: false, timeLimitMs: 120_000 });
                return `${fs.statSync(part).size} bytes`;
            });
        }
        step(`the captions file:\n${lines.filter(x => x.startsWith('Dialogue')).join('\n')}`);
    }
    const out = path.join(workDir, `${item.id}.mp4`);
    const made = await attempt('make the short as the job does (from Storage)', async () => {
        await renderShort(url, out, { ...options, timeLimitMs: 300_000 });
        return `${fs.statSync(out).size} bytes`;
    });
    if (made) {
        await attempt('upload it to Storage (a debug copy, deleted after)', async () => {
            const dest = `episodes/${episodeId}/shorts-debug/${item.id}-${Date.now()}.mp4`;
            await limit('upload', 180_000, bucket.upload(out, { destination: dest, metadata: { contentType: 'video/mp4' } }));
            await bucket.file(dest).delete().catch(() => {});
        });
    }
    step('DEBUG done: nothing was written to the episode');
}

async function main() {
    settings = await loadSettings(db);
    notesPage = `${settings.studioUrl}/admin/podcast/${episodeId}/notes#shorts`;
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    if (episode.notes?.status !== 'approved' || !episode.notes.approved) throw new Error('Approve the show notes first');
    const final = episode.final;
    if (final?.status !== 'ready' || !final.videoPath) throw new Error('Get the final cut first (from Descript or the Editor Light render)');
    if (!episode.shorts?.items.length && mode !== 'pick') throw new Error('Pick some key quotes for shorts first');
    if (debugKey) {
        if (mode !== 'render') throw new Error('A debug run makes a short: mode render');
        return debugShort(episode, debugKey);
    }
    fs.mkdirSync(workDir, { recursive: true });
    await ref.update({
        'shorts.status': 'working', 'shorts.startedAt': FieldValue.serverTimestamp(), 'shorts.error': null,
        updatedAt: FieldValue.serverTimestamp(),
    });
    const words = await loadWords(episode);
    const done: Record<string, unknown> = {
        'shorts.status': 'ready', 'shorts.finishedAt': FieldValue.serverTimestamp(), 'shorts.error': null,
        updatedAt: FieldValue.serverTimestamp(),
    };

    if (mode === 'pick') {
        console.log(`🎯 Finding the best moments for ${episode.title}`);
        const { suggestions, usd } = await withRetry('Claude', () => pickMoments(episode, words), 3);
        await ref.update({
            ...done,
            'shorts.suggestions': suggestions,
            'shorts.warnings': [],
            'costs.items': FieldValue.arrayUnion({ item: 'shorts_pick', usd, at: new Date() }),
            'costs.totalUsd': FieldValue.increment(usd),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return;
    }

    if (mode === 'titles') {
        console.log(`✍️  Headlines and titles for the shorts of ${episode.title}`);
        const { texts, usd, warnings } = await withRetry('Claude', () => writeTexts(episode, words), 3);
        // Fills only what is still empty, on the shorts as they are now. The version bump stops an
        // open page from saving its older copy over the new texts.
        await db.runTransaction(async tx => {
            const shorts = ((await tx.get(ref)).data() as Episode).shorts!;
            tx.update(ref, {
                ...done,
                'shorts.items': shorts.items.map(i => {
                    const t = texts.get(i.id);
                    if (!t || i.youtube) return i;
                    return { ...i, headline: i.headline.trim() ? i.headline : t.headline, title: i.title.trim() ? i.title : t.title };
                }),
                'shorts.version': (shorts.version ?? 0) + 1,
                'shorts.warnings': warnings,
                'costs.items': FieldValue.arrayUnion({ item: 'shorts_titles', usd, at: new Date() }),
                'costs.totalUsd': FieldValue.increment(usd),
            });
        });
        return;
    }

    if (mode === 'render') {
        console.log(`🎞️  Making shorts for ${episode.title}`);
        const { done: count, warnings } = await render(episode, words);
        await ref.update({ ...done, 'shorts.warnings': warnings });
        await sendEmail({ alert }, `Shorts ready to review: ${episode.title}`, [
            `${count} short${count === 1 ? ' is' : 's are'} made for "${episode.title}". Watch and approve them (Checkpoint E):`,
            notesPage,
            ...(warnings.length ? ['', 'Check:', ...warnings.map(w => `  - ${w}`)] : []),
        ].join('\n'));
        return;
    }

    const { scheduled, warnings } = await upload(episode, words);
    if (!scheduled.length) throw new Error(warnings.join(' ') || 'No short was scheduled');
    await ref.update({ ...done, 'shorts.warnings': warnings });
    await sendEmail({ alert }, `Shorts scheduled: ${episode.title}`, [
        `${scheduled.length} short${scheduled.length === 1 ? '' : 's'} from "${episode.title}" scheduled on YouTube (Private until each goes live):`,
        ...scheduled.map(s => `  ${when(s.publishAt, episode.shorts?.timeZone)}  ${s.title}\n    ${s.url}`),
        ...(warnings.length ? ['', 'Check:', ...warnings.map(w => `  - ${w}`)] : []),
    ].join('\n'));
}

main().catch(async error => {
    const message = (error as Error).message;
    console.error(`❌ ${message}`);
    if (debugKey) process.exit(1);     // a debug run writes nothing and emails no one
    await ref.update({
        'shorts.status': 'failed', 'shorts.error': message, 'shorts.finishedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
    const what = { pick: 'Finding the best moments', titles: 'Writing the headlines and titles', render: 'Making the shorts', upload: 'Scheduling the shorts' }[mode] ?? 'The shorts job';
    await sendEmail({ alert }, failureSubject(`Shorts failed: ${episodeId}`, message),
        `${what} did not finish.\n\n${describeError(message)}\n\nTry again from the show notes page: ${notesPage}${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
    process.exit(1);
});
