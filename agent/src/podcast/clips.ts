// Clips of 5 to 15 minutes beside the Shorts (docs/specs/025-clips.md), from the final cut. Two jobs so far,
// picked by CLIPS_MODE:
//   pick     Claude reads the final cut, with the chapters as hints, and suggests self-contained topics,
//            best first, each with a working title, a score, its opening words and a reason; code checks
//            each opening is where Claude says and places it on whole thoughts (lib/clipPicks.ts)
//   titles   Claude writes the YouTube title, description, thumbnail title and the thumbnail's feeling for
//            each clip missing any of them, filling only what is empty
// Making the clips, their thumbnails and scheduling are later stages of the spec. Runs in GitHub Actions
// (.github/workflows/podcast_clips.yml).

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import {
    CLIP_PICK_ASK, CLIP_PICK_COUNT, clipPickInstructions, ClipPicksSchema, placePick, rankClipPicks, type PlacedPick,
} from '../../../lib/clipPicks';
import { CLIP_DESCRIPTION_MAX, CLIP_FEELINGS, CLIP_TITLE_MAX, ClipTextsSchema, MAX_FEELINGS, THUMB_TEXT_MAX, type ClipFeeling } from '../../../lib/clips';
import type { TimedWord } from '../../../lib/retime';
import { pickingTranscript } from '../../../lib/shortPicks';
import { wordsBetween } from '../../../lib/shorts';
import { clipsSystemPrompt, type StudioSettings } from '../../../lib/studioSettings';
import type { ClipItem, Episode } from '../../../types/episode';
import { cachedText, claudeUsd, priceOf } from './claudeCost';
import { loadAlert } from './config';
import { withRetry } from './errors';
import { NOTES_EFFORT, NOTES_MODEL } from './notesDraft';
import { describeError, failureSubject, sendEmail } from './notify';
import { loadSettings, storageBucket } from './settings';

type Mode = 'pick' | 'titles';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const episodeId = required('EPISODE_ID');
if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
const mode = required('CLIPS_MODE') as Mode;
if (!['pick', 'titles'].includes(mode)) throw new Error(`Not a clips job: ${mode}`);
const alert = loadAlert();
const runUrl = process.env.GITHUB_RUN_URL || '';
initializeApp({ credential: cert(JSON.parse(required('PODCAST_SA_JSON'))), storageBucket: storageBucket() });
const db = getFirestore();
const ref = db.collection('episodes').doc(episodeId);
const bucket = getStorage().bucket();
let settings: StudioSettings;
let notesPage = `https://soulwisdomcollective.com/admin/podcast/${episodeId}/notes#clips`;

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
    const todo = (episode.clips?.items ?? []).filter(needsTexts);
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

async function main() {
    settings = await loadSettings(db);
    notesPage = `${settings.studioUrl}/admin/podcast/${episodeId}/notes#clips`;
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    if (episode.notes?.status !== 'approved' || !episode.notes.approved) throw new Error('Approve the show notes first');
    if (episode.final?.status !== 'ready') throw new Error('Get the final cut first');
    if (mode === 'titles' && !episode.clips?.items.length) throw new Error('Add some clips first');
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
    const what = mode === 'pick' ? 'Suggesting clips' : 'Writing the clips\' titles';
    await sendEmail({ alert }, failureSubject(`Clips failed: ${episodeId}`, message),
        `${what} did not finish.\n\n${describeError(message)}\n\nTry again from the show notes page: ${notesPage}${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
    process.exit(1);
});
