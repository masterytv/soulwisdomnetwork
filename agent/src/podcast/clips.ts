// Clips of 5 to 15 minutes beside the Shorts (docs/specs/025-clips.md), from the final cut. Five jobs, picked by
// CLIPS_MODE:
//   pick     Claude reads the final cut, with the chapters as hints, and suggests self-contained topics,
//            best first, each with a working title, a score, its opening words and a reason; code checks
//            each opening is where Claude says and places it on whole thoughts (lib/clipPicks.ts)
//   titles   Claude writes the YouTube title, description, thumbnail title and the thumbnail's feeling for
//            each clip missing any of them, filling only what is empty
//   render   cuts each clip that changed from the final cut, 16:9 with a half-second fade at each end (clipsRender.ts)
//   moments  finds the main speaker's most expressive moments that fit each clip's title and cuts them out, for the
//            "Soul Wisdom Clips" thumbnail (clipMoments.ts); with CLIPS_MOMENT=<clip>@<ms>, the one frame chosen by hand
//   upload   uploads the clips approved at Checkpoint F to YouTube, Private and scheduled at their slots, each with
//            its caption track, thumbnail and the Clips playlist (YOUTUBE_CLIPS_PLAYLIST_ID)
// Runs in GitHub Actions (.github/workflows/podcast_clips.yml).

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import {
    CLIP_PICK_ASK, CLIP_PICK_COUNT, clipPickInstructions, ClipPicksSchema, placePick, rankClipPicks, type PlacedPick,
} from '../../../lib/clipPicks';
import {
    canMake, clipChapters, clipMetadata, clipWords, CLIP_DESCRIPTION_MAX, CLIP_FEELINGS, CLIP_TITLE_MAX, clipRenderInputs, ClipTextsSchema, MAX_FEELINGS, MAX_MOMENTS, sameClipRender,
    THUMB_TEXT_MAX, withClipDefaults, type ClipFeeling,
} from '../../../lib/clips';
import { momentInputs, sameMoments } from '../../../lib/clipThumbs';
import { buildCues, toSrt } from '../../../lib/captions';
import { episodeLink } from '../../../lib/publishing';
import { YOUTUBE_CATEGORY } from '../../../lib/youtube';
import type { TimedWord } from '../../../lib/retime';
import { pickingTranscript } from '../../../lib/shortPicks';
import { wordsBetween } from '../../../lib/shorts';
import { clipsSystemPrompt, type StudioSettings } from '../../../lib/studioSettings';
import type { ClipItem, Episode } from '../../../types/episode';
import { cachedText, claudeUsd, priceOf } from './claudeCost';
import { loadAlert } from './config';
import { withRetry } from './errors';
import { finalTurns, findMoments, handMoment } from './clipMoments';
import { renderClip } from './clipsRender';
import { createYoutube, YoutubeError } from './youtubeApi';
import { NOTES_EFFORT, NOTES_MODEL } from './notesDraft';
import { describeError, failureSubject, sendEmail } from './notify';
import { loadSettings, storageBucket } from './settings';

type Mode = 'pick' | 'titles' | 'render' | 'moments' | 'upload';
// YouTube needs a scheduled time comfortably in the future.
const MIN_LEAD_MS = 10 * 60_000;
// Our caption track, told apart from any added by hand in YouTube Studio (as on the episode).
const CAPTION_NAME = 'English';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const episodeId = required('EPISODE_ID');
if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
const mode = required('CLIPS_MODE') as Mode;
if (!['pick', 'titles', 'render', 'moments', 'upload'].includes(mode)) throw new Error(`Not a clips job: ${mode}`);
// "Use this moment": one clip's frame chosen by hand, as <clip id>@<ms on the final cut>.
const handPick = /^([\w-]{4,40})@(\d{1,9})$/.exec(process.env.CLIPS_MOMENT?.trim() ?? '');
const alert = loadAlert();
const runUrl = process.env.GITHUB_RUN_URL || '';
initializeApp({ credential: cert(JSON.parse(required('PODCAST_SA_JSON'))), storageBucket: storageBucket() });
const db = getFirestore();
const ref = db.collection('episodes').doc(episodeId);
const bucket = getStorage().bucket();
let settings: StudioSettings;
let notesPage = `https://soulwisdomcollective.com/admin/podcast/${episodeId}/notes#clips`;
const workDir = path.join(process.env.RUNNER_TEMP || '/tmp', 'clips', episodeId);
const finalAtOf = (episode: Episode) => (episode.final?.finishedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

// Changes one clip without touching the others, which the producer may be editing. A change to a field the page
// also saves (the thumbnail's moment) bumps the version, so an open page reloads instead of saving over it.
async function updateItem(id: string, change: (item: ClipItem) => ClipItem, bumpVersion = false) {
    await db.runTransaction(async tx => {
        const clips = ((await tx.get(ref)).data() as Episode | undefined)?.clips;
        if (!clips) return;
        tx.update(ref, {
            'clips.items': clips.items.map(i => (i.id === id ? change(i) : i)),
            ...(bumpVersion ? { 'clips.version': (clips.version ?? 0) + 1 } : {}),
        });
    });
}

async function finalCutUrl(episode: Episode) {
    const [url] = await bucket.file(episode.final!.videoPath!).getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 60_000 });
    return url;
}

const upload = (local: string, dest: string, contentType: string) =>
    withRetry('Storage upload', () => bucket.upload(local, { destination: dest, metadata: { contentType } })).then(() => {});

async function loadWords(episode: Episode) {
    if (!episode.final?.wordsPath) throw new Error('The final cut has no transcript; get the final cut again');
    const [raw] = await withRetry('Storage download', () => bucket.file(episode.final!.wordsPath!).download());
    return (JSON.parse(raw.toString('utf8')) as { words: TimedWord[] }).words;
}

const episodeTitle = (episode: Episode) => episode.notes!.approved!.titles[episode.notes!.approved!.chosenTitle] ?? episode.title;

// Claude reads the final cut and suggests topics; each is checked and placed in code.
async function pickTopics(episode: Episode, words: TimedWord[]) {
    const notes = episode.notes!.approved!;
    const chapters = episode.final!.chapters ?? [];
    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    const response = await client.beta.messages.stream({
        model: NOTES_MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: NOTES_EFFORT, format: betaZodOutputFormat(ClipPicksSchema) },
        system: clipsSystemPrompt(settings),
        messages: [{
            role: 'user',
            content: `Episode: ${episodeTitle(episode)}\n\nSummary:\n${notes.summary}\n\n` +
                `The final cut, each line starting with its time in milliseconds:\n${pickingTranscript(words)}\n\n` +
                clipPickInstructions(CLIP_PICK_ASK, chapters, episode.clips?.direction ?? ''),
        }],
    }).finalMessage();
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to suggest clips');
    if (!response.parsed_output) throw new Error('Claude returned its suggestions in an unexpected shape');
    const usd = Math.round(claudeUsd(response.usage, priceOf(response.model, NOTES_MODEL)) * 100) / 100;
    const placed: PlacedPick[] = [];
    let unverified = 0, unfit = 0;
    for (const p of response.parsed_output.picks) {
        const r = placePick(words, p);
        if (r === 'unverified') {
            unverified++;
            console.warn(`  ⚠️ Not found where Claude said (${p.startMs}ms): "${p.opening}"`);
        } else if (!r) {
            unfit++;
            console.warn(`  ⚠️ Not 2 to 20 minutes once placed: "${p.title}"`);
        } else {
            placed.push(r);
        }
    }
    const suggestions = rankClipPicks(placed, CLIP_PICK_COUNT).map(p => ({ ...p, id: randomUUID().slice(0, 8) }));
    for (const s of suggestions) console.log(`  ✅ ${s.score}/10 ${s.title} (${Math.round((s.endMs - s.startMs) / 60_000)} min)`);
    if (!suggestions.length) throw new Error("None of Claude's suggestions could be placed as a clip of 2 to 20 minutes; try again");
    const warnings = [
        ...(unverified ? [`${unverified} suggestion${unverified === 1 ? ' was' : 's were'} left out: the opening words were not found where Claude said.`] : []),
        ...(unfit ? [`${unfit} suggestion${unfit === 1 ? ' was' : 's were'} left out: not 2 to 20 minutes once placed on whole sentences.`] : []),
    ];
    return { suggestions, unverified, warnings, usd };
}

const needsTexts = (i: ClipItem) => !i.title.trim() || !i.description.trim() || !i.thumbText.trim() || !i.thumbFeeling?.length;
const clean = (s: string, max: number) => s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

interface Texts { title: string; description: string; thumbText: string; feeling: ClipFeeling[] }

// The texts of each clip missing any of them, from the words heard in it. Clips are numbered for Claude
// (random ids are easy to copy wrong); any it leaves out are asked for once more.
async function writeTexts(episode: Episode, words: TimedWord[]) {
    const todo = (episode.clips?.items ?? []).filter(i => !i.youtube && needsTexts(i));
    if (!todo.length) throw new Error('Every clip already has its title, description and thumbnail title; clear one to have it rewritten');
    const notes = episode.notes!.approved!;
    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    const texts = new Map<string, Texts>();
    let usd = 0;
    for (let round = 1; round <= 2; round++) {
        const batch = todo.filter(i => !texts.has(i.id));
        if (!batch.length) break;
        const listing = batch.map((i, n) => `Clip ${n + 1} (${Math.round((i.endMs - i.startMs) / 60_000)} minutes):\n` +
            wordsBetween(words, i.startMs, i.endMs).map(w => w.text).join(' ')).join('\n\n');
        const response = await client.beta.messages.stream({
            model: NOTES_MODEL,
            max_tokens: 32000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            thinking: { type: 'adaptive' },
            output_config: { effort: NOTES_EFFORT, format: betaZodOutputFormat(ClipTextsSchema) },
            // Cached: a second round, for the clips the first one missed, sends it again.
            system: [cachedText(clipsSystemPrompt(settings))],
            messages: [{
                role: 'user',
                content: `Episode: ${episodeTitle(episode)}\n\nSummary:\n${notes.summary}\n\n` +
                    `These ${batch.length} clips were cut from the episode; each is shown with the words heard in it.\n\n${listing}\n\n` +
                    `For every one of the ${batch.length}, numbered as above, write its YouTube title, its description, the thumbnail ` +
                    'title and the feeling the speaker\'s face on the thumbnail should show. Each must fit what is actually said in that clip.',
            }],
        }).finalMessage();
        if (response.stop_reason === 'refusal') throw new Error('Claude declined to write the clips\' texts');
        if (!response.parsed_output) throw new Error('Claude returned the clips\' texts in an unexpected shape');
        usd += claudeUsd(response.usage, priceOf(response.model, NOTES_MODEL));
        for (const t of response.parsed_output.clips) {
            const item = batch[t.clip - 1];
            const out: Texts = {
                title: clean(t.title, CLIP_TITLE_MAX),
                description: t.description.replace(/[<>]/g, '').trim().slice(0, CLIP_DESCRIPTION_MAX),
                thumbText: clean(t.thumbText, THUMB_TEXT_MAX),
                feeling: [...new Set(t.feeling.filter(f => (CLIP_FEELINGS as readonly string[]).includes(f)))].slice(0, MAX_FEELINGS),
            };
            if (!item || !out.title || !out.description || !out.thumbText) continue;
            texts.set(item.id, out);
            console.log(`  ✅ ${out.title} | ${out.thumbText} | ${out.feeling.join(', ')}`);
        }
        console.log(`  Round ${round}: ${texts.size} of ${todo.length} done`);
    }
    const missing = todo.length - texts.size;
    return {
        texts, usd: Math.round(usd * 100) / 100,
        warnings: missing ? [`Claude left out ${missing} clip${missing === 1 ? '' : 's'}; press the button again for ${missing === 1 ? 'it' : 'them'}.`] : [],
    };
}

// Cuts each clip that changed since it was made. One that cannot be made is reported and the rest still are.
async function render(episode: Episode) {
    const finalAt = finalAtOf(episode);
    const todo = episode.clips!.items.filter(i => !i.youtube && !sameClipRender(i.render, clipRenderInputs(i, finalAt)));
    if (!todo.length) throw new Error('Every clip is already made; change one first');
    const input = await finalCutUrl(episode);
    const warnings: string[] = [];
    let done = 0;
    for (const item of todo) {
        const name = item.title || `the clip at ${Math.round(item.startMs / 60_000)} min`;
        const durationMs = item.endMs - item.startMs;
        if (!canMake(durationMs)) {
            warnings.push(`"${name}" is not 2 to 20 minutes long, so it was not made.`);
            continue;
        }
        const local = path.join(workDir, `${item.id}.mp4`);
        console.log(`🎞️  ${name} (${Math.round(durationMs / 60_000)} min)`);
        try {
            await withRetry('Render', () => renderClip(input, local, item.startMs / 1000, durationMs / 1000), 2);
        } catch (error) {
            warnings.push(`"${name}" could not be made: ${(error as Error).message.slice(0, 300)}`);
            continue;
        }
        const renderedAt = Date.now();
        const dest = `episodes/${episodeId}/clips/${item.id}-${renderedAt}.mp4`;
        await upload(local, dest, 'video/mp4');
        fs.rmSync(local, { force: true });
        const previous = item.render?.path;
        await updateItem(item.id, i => ({ ...i, render: { ...clipRenderInputs(item, finalAt), path: dest, renderedAt, durationMs }, approved: null }));
        if (previous) await bucket.file(previous).delete().catch(() => {});
        // A clip cut from a final cut with show library sounds carries them: noted on each entry (spec 020 item E7).
        const library = episode.final?.library ?? [];
        if (library.length) {
            const items = db.collection('studio').doc('media').collection('items');
            const use = { episodeId, kind: 'clip', ref: dest, at: new Date().toISOString() };
            await Promise.all(library.map(id => items.doc(id).update({ uses: FieldValue.arrayUnion(use) })))
                .catch(error => console.warn(`⚠️ Could not log the library's uses: ${(error as Error).message}`));
        }
        done++;
    }
    if (!done) throw new Error(warnings[0] ?? 'No clip could be made');
    return { done, warnings };
}

// The reviewed transcript's lines, with who speaks in each.
async function reviewedLines(episode: Episode) {
    if (!episode.review?.reviewedPath) throw new Error('The transcript was never accepted, so who speaks when is not known');
    const [raw] = await withRetry('Storage download', () => bucket.file(episode.review!.reviewedPath!).download());
    return (JSON.parse(raw.toString('utf8')) as { lines: { name: string; start: number; end: number; words: TimedWord[] }[] }).lines;
}

// The thumbnail moments of each clip whose moments are missing or stale, or the one frame chosen by hand.
async function moments(episode: Episode, words: TimedWord[]) {
    const finalAt = finalAtOf(episode);
    const input = await finalCutUrl(episode);
    const items = episode.clips!.items.map(withClipDefaults);
    if (handPick) {
        const [, id, ms] = handPick;
        const item = items.find(i => i.id === id);
        if (!item) throw new Error('That clip is no longer on the page');
        const atMs = Number(ms);
        if (atMs < item.startMs || atMs > item.endMs) throw new Error('That frame is not inside the clip');
        const hand = await handMoment(item, atMs, { input, workDir, upload, destPrefix: `episodes/${episodeId}/clips/${item.id}-moment-${Date.now()}` });
        await updateItem(item.id, i => {
            const kept = (i.moments?.found ?? []).filter(m => !m.chosenByHand).slice(0, MAX_MOMENTS);
            const found = [...kept, hand];
            return {
                ...i, thumbMoment: found.length - 1,
                moments: { inputs: i.moments?.inputs ?? momentInputs(withClipDefaults(i), finalAt), found, speakers: i.moments?.speakers ?? [], madeAt: Date.now() },
            };
        }, true);
        return { usd: 0, warnings: hand.cutoutPath ? [] : ['Nobody could be cut out of that frame; the thumbnail shows the title alone.'] };
    }
    const todo = items.filter(i => !i.youtube && i.thumbText.trim() && !sameMoments(i.moments?.inputs, momentInputs(i, finalAt)));
    if (!todo.length) throw new Error('Every clip with a thumbnail title already has its moments');
    const [lines, durationMs] = [await reviewedLines(episode), Math.round((episode.final!.durationSeconds ?? 0) * 1000)];
    const turns = finalTurns(lines, words, durationMs);
    const quotes = (episode.final!.quotes ?? []).map(q => q.startMs);
    let usd = 0;
    const warnings: string[] = [];
    for (const item of todo) {
        console.log(`🖼️  Moments for "${item.title || item.thumbText}"`);
        const stamp = Date.now();
        try {
            const r = await findMoments(item, {
                input, workDir, words, turns, quotes, upload, apiKey: required('ANTHROPIC_API_KEY'),
                destPrefix: `episodes/${episodeId}/clips/${item.id}-moment-${stamp}`,
            });
            usd += r.usd;
            if (r.note) warnings.push(`"${item.title || item.thumbText}": ${r.note}`);
            const old = item.moments?.found ?? [];
            await updateItem(item.id, i => ({
                ...i, thumbMoment: r.found.length ? 0 : null,
                moments: { inputs: momentInputs(item, finalAt), found: r.found, speakers: r.speakers, madeAt: stamp },
            }), true);
            // The moments they replace.
            await Promise.all(old.flatMap(m => [m.framePath, m.cutoutPath]).filter((p): p is string => !!p)
                .map(p => bucket.file(p).delete().catch(() => {})));
        } catch (error) {
            warnings.push(`"${item.title || item.thumbText}": the moments could not be found: ${(error as Error).message.slice(0, 300)}`);
        }
    }
    return { usd: Math.round(usd * 100) / 100, warnings };
}

function when(ms: number, timeZone = 'UTC') {
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
    try {
        return new Date(ms).toLocaleString('en-US', { ...options, timeZone });
    } catch {
        return new Date(ms).toLocaleString('en-US', { ...options, timeZone: 'UTC' });
    }
}

// Uploads the approved clips with a slot, in slot order, each Private until its time. Each video ID is saved as soon
// as its upload finishes, so a failure afterwards never leads to a second copy; its captions, thumbnail and playlist
// are added straight after, and a failure in any of those is a warning on that clip, not a failed upload.
async function schedule(episode: Episode, words: TimedWord[]) {
    const notes = episode.notes!.approved!;
    const finalAt = finalAtOf(episode);
    const link = episodeLink({ episodeUrl: episode.youtube?.url, playlistId: process.env.YOUTUBE_PLAYLIST_ID, siteUrl: settings.siteUrl });
    const clipsPlaylist = process.env.YOUTUBE_CLIPS_PLAYLIST_ID?.trim() || null;
    const youtube = createYoutube({
        clientId: required('YOUTUBE_CLIENT_ID'), clientSecret: required('YOUTUBE_CLIENT_SECRET'), refreshToken: required('YOUTUBE_REFRESH_TOKEN'),
    });
    const todo = episode.clips!.items
        .filter(i => !i.youtube && i.publishAt && i.render && i.thumbnail && i.approved?.renderedAt === i.render.renderedAt &&
            sameClipRender(i.render, clipRenderInputs(i, finalAt)))
        .sort((a, b) => a.publishAt! - b.publishAt!);
    if (!todo.length) throw new Error('No approved clip is waiting to be scheduled');
    const warnings: string[] = clipsPlaylist ? [] : ['The YOUTUBE_CLIPS_PLAYLIST_ID repo variable is not set, so the clips were added to no playlist.'];
    const scheduled: { title: string; url: string; publishAt: number }[] = [];
    for (const item of todo) {
        if (item.publishAt! < Date.now() + MIN_LEAD_MS) {
            const message = 'Its time slot has passed; schedule it again.';
            await updateItem(item.id, i => ({ ...i, error: message }));
            warnings.push(`"${item.title}": ${message}`);
            continue;
        }
        const meta = clipMetadata(item, {
            ...link, chapters: clipChapters(episode.final?.chapters ?? [], item.startMs, item.endMs),
            hashtags: notes.hashtags ?? [], tags: notes.tags ?? [], credits: episode.final?.credits ?? [],
        });
        const local = path.join(workDir, `${item.id}.mp4`);
        await withRetry('Storage download', () => bucket.file(item.render!.path).download({ destination: local }));
        const publishAt = new Date(item.publishAt!).toISOString();
        console.log(`🎬 Uploading "${meta.title}" for ${publishAt}`);
        let videoId: string;
        try {
            const video = await youtube.upload(local, {
                snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: YOUTUBE_CATEGORY, defaultLanguage: 'en', defaultAudioLanguage: 'en' },
                status: {
                    privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false,
                    containsSyntheticMedia: meta.containsSyntheticMedia, embeddable: true, license: 'youtube',
                },
            });
            if (!video.id) throw new Error('YouTube did not return a video ID');
            videoId = video.id;
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
            continue;
        } finally {
            fs.rmSync(local, { force: true });
        }
        const url = `https://youtu.be/${videoId}`;
        // Recorded straight away, so a failure later never leads to a second copy.
        await updateItem(item.id, i => ({
            ...i, error: null, youtube: { videoId, url, publishAt: item.publishAt!, uploadedAt: Date.now(), playlistId: null, warnings: [] },
        }));
        console.log(`  ✅ ${url}`);
        const after: string[] = [];
        try {
            await youtube.insertCaption(videoId, CAPTION_NAME, toSrt(buildCues(clipWords(words, item.startMs, item.endMs))));
            console.log('  ✅ Captions added');
        } catch (error) {
            after.push(`The captions were not added: ${(error as Error).message}`);
        }
        try {
            const [jpeg] = await withRetry('Storage download', () => bucket.file(item.thumbnail!.path).download());
            await youtube.setThumbnail(videoId, jpeg);
            console.log('  ✅ Thumbnail set');
        } catch (error) {
            const message = (error as Error).message;
            after.push(/403/.test(message)
                ? 'YouTube refused the thumbnail: custom thumbnails need a verified channel. Set it in YouTube Studio.'
                : `The thumbnail was not set: ${message}`);
        }
        let playlistId: string | null = null;
        if (clipsPlaylist) {
            try {
                await youtube.addToPlaylist(clipsPlaylist, videoId);
                playlistId = clipsPlaylist;
                console.log('  ✅ Added to the Clips playlist');
            } catch (error) {
                after.push(`It was not added to the Clips playlist (check the YOUTUBE_CLIPS_PLAYLIST_ID repo variable): ${(error as Error).message}`);
            }
        }
        for (const w of after) console.warn(`  ⚠️ ${w}`);
        await updateItem(item.id, i => (i.youtube ? { ...i, youtube: { ...i.youtube, playlistId, warnings: after } } : i));
        warnings.push(...after.map(w => `"${item.title}": ${w}`));
        scheduled.push({ title: meta.title, url, publishAt: item.publishAt! });
    }
    return { scheduled, warnings };
}

async function main() {
    settings = await loadSettings(db);
    notesPage = `${settings.studioUrl}/admin/podcast/${episodeId}/notes#clips`;
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    if (episode.notes?.status !== 'approved' || !episode.notes.approved) throw new Error('Approve the show notes first');
    if (episode.final?.status !== 'ready') throw new Error('Get the final cut first');
    if (mode !== 'pick' && !episode.clips?.items.length) throw new Error('Add some clips first');
    fs.mkdirSync(workDir, { recursive: true });
    await ref.update({
        'clips.status': 'working', 'clips.startedAt': FieldValue.serverTimestamp(), 'clips.error': null,
        updatedAt: FieldValue.serverTimestamp(),
    });
    const words = await loadWords(episode);
    const done = {
        'clips.status': 'ready', 'clips.finishedAt': FieldValue.serverTimestamp(), 'clips.error': null,
        updatedAt: FieldValue.serverTimestamp(),
    };

    if (mode === 'pick') {
        console.log(`🎯 Suggesting clips for ${episode.title}`);
        const { suggestions, unverified, warnings, usd } = await withRetry('Claude', () => pickTopics(episode, words), 3);
        await ref.update({
            ...done,
            'clips.suggestions': suggestions,
            'clips.unverified': unverified,
            'clips.warnings': warnings,
            'costs.items': FieldValue.arrayUnion({ item: 'clips_pick', usd, at: new Date() }),
            'costs.totalUsd': FieldValue.increment(usd),
        });
        return;
    }

    if (mode === 'render') {
        const { done: count, warnings } = await render(episode);
        await ref.update({ ...done, 'clips.warnings': warnings });
        await sendEmail({ alert }, `Clips ready to review: ${episode.title}`, [
            `${count} clip${count === 1 ? ' is' : 's are'} made for "${episode.title}". Watch, pick their thumbnails and approve them (Checkpoint F):`,
            notesPage,
            ...(warnings.length ? ['', 'Check:', ...warnings.map(w => `  - ${w}`)] : []),
        ].join('\n'));
        return;
    }

    if (mode === 'upload') {
        const { scheduled, warnings } = await schedule(episode, words);
        if (!scheduled.length) throw new Error(warnings.join(' ') || 'No clip was scheduled');
        await ref.update({ ...done, 'clips.warnings': warnings });
        await sendEmail({ alert }, `Clips scheduled: ${episode.title}`, [
            `${scheduled.length} clip${scheduled.length === 1 ? '' : 's'} from "${episode.title}" scheduled on YouTube (Private until each goes live):`,
            ...scheduled.map(s => `  ${when(s.publishAt, episode.clips?.timeZone)}  ${s.title}\n    ${s.url}`),
            '', 'The API cannot set an end screen: add "Full episode" as each clip\'s end screen in YouTube Studio.',
            ...(warnings.length ? ['', 'Check:', ...warnings.map(w => `  - ${w}`)] : []),
        ].join('\n'));
        return;
    }

    if (mode === 'moments') {
        const { usd, warnings } = await moments(episode, words);
        await ref.update({
            ...done, 'clips.warnings': warnings,
            ...(usd ? { 'costs.items': FieldValue.arrayUnion({ item: 'clips_moments', usd, at: new Date() }), 'costs.totalUsd': FieldValue.increment(usd) } : {}),
        });
        return;
    }

    console.log(`✍️  Titles and descriptions for the clips of ${episode.title}`);
    const { texts, usd, warnings } = await withRetry('Claude', () => writeTexts(episode, words), 3);
    // Fills only what is still empty, on the clips as they are now. The version bump stops an open page
    // from saving its older copy over the new texts.
    await db.runTransaction(async tx => {
        const clips = ((await tx.get(ref)).data() as Episode).clips!;
        tx.update(ref, {
            ...done,
            'clips.items': clips.items.map(i => {
                const t = texts.get(i.id);
                if (!t) return i;
                return {
                    ...i,
                    title: i.title.trim() ? i.title : t.title,
                    description: i.description.trim() ? i.description : t.description,
                    thumbText: i.thumbText.trim() ? i.thumbText : t.thumbText,
                    thumbFeeling: i.thumbFeeling?.length ? i.thumbFeeling : t.feeling,
                };
            }),
            'clips.version': (clips.version ?? 0) + 1,
            'clips.warnings': warnings,
            'costs.items': FieldValue.arrayUnion({ item: 'clips_titles', usd, at: new Date() }),
            'costs.totalUsd': FieldValue.increment(usd),
        });
    });
}

main().catch(async error => {
    const message = (error as Error).message;
    console.error(`❌ ${message}`);
    await ref.update({
        'clips.status': 'failed', 'clips.error': message, 'clips.finishedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
    const what = { pick: 'Suggesting clips', titles: 'Writing the clips\' titles', render: 'Making the clips', moments: 'Finding thumbnail moments', upload: 'Scheduling the clips' }[mode];
    await sendEmail({ alert }, failureSubject(`Clips failed: ${episodeId}`, message),
        `${what} did not finish.\n\n${describeError(message)}\n\nTry again from the show notes page: ${notesPage}${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
    process.exit(1);
});
