// Spec 005 step 5: draft the show notes for one episode from its accepted transcript.
// Runs in GitHub Actions (.github/workflows/podcast_notes.yml), started by the Podcast
// Studio when a transcript is accepted or a producer asks for new notes.
// docs/specs/007-show-notes.md

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { anchorToTranscript, mmss, parseShowNotes, ShowNotesSchema, SITE_URL, type SpokenWord } from '../../../lib/showNotes';
import type { Episode } from '../../../types/episode';
import { HOSTS, loadAlert } from './config';
import { sendEmail } from './notify';

const MODEL = 'claude-opus-5';
// Claude Opus 5 per million tokens; for the episode's cost record.
const USD_PER_MTOK = { input: 5, output: 25 };
const SITE = 'https://soulwisdomcollective.com';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const episodeId = required('EPISODE_ID');
if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
const alert = loadAlert();
const runUrl = process.env.GITHUB_RUN_URL || '';
initializeApp({
    credential: cert(JSON.parse(required('PODCAST_SA_JSON'))),
    storageBucket: process.env.PODCAST_STORAGE_BUCKET || 'soulwisdomnetwork.firebasestorage.app',
});
const ref = getFirestore().collection('episodes').doc(episodeId);
let approved = false;   // never overwrite approved notes, even to record a failure

interface ReviewedLine { name: string; clip: boolean; start: number; text: string; words: { text: string; start: number; end: number }[] }

// Consecutive lines from one voice become one paragraph, each stamped with its start in
// milliseconds so Claude can return exact chapter, quote and b-roll times.
function transcriptForPrompt(lines: ReviewedLine[]) {
    const paragraphs: { start: number; who: string; text: string[] }[] = [];
    for (const l of lines) {
        const who = l.clip ? `${l.name} (clip played during the episode)` : l.name;
        const last = paragraphs[paragraphs.length - 1];
        if (last?.who === who) last.text.push(l.text);
        else paragraphs.push({ start: l.start, who, text: [l.text] });
    }
    return paragraphs.map(p => `[${p.start}ms ${mmss(p.start)}] ${p.who}: ${p.text.join(' ')}`).join('\n\n');
}

function speakerList(lines: ReviewedLine[]) {
    const seen = new Map<string, boolean>();
    for (const l of lines) if (!seen.has(l.name)) seen.set(l.name, l.clip);
    return [...seen].map(([name, clip]) => (clip ? `${name} (only in clips)` : name)).join(', ');
}

const SYSTEM = `You write show notes for the Soul Wisdom Collective podcast, hosted by ${HOSTS.join(' and ')}. \
The show explores near-death experiences, consciousness and the meaning of life with warmth and curiosity, \
for listeners who are spiritually open but not dogmatic.

Write in plain, warm, specific language. Avoid hype, clickbait and clichés ("delve", "journey", "unlock"). \
Never claim as fact what a speaker offered as belief or experience; attribute it ("Daniel describes…").

Timestamps: every paragraph of the transcript starts with its time in milliseconds, e.g. [65000ms 1:05]. \
Use those numbers for startMs. Chapters and b-roll must start at a paragraph's time; quotes at the paragraph they come from.

Quotes and teaser clips must be copied exactly from the transcript, from a host or guest, with the speaker name \
exactly as the transcript gives it. Lines marked "(clip played during the episode)" \
are recordings of other people: never quote them, though chapters and summaries may mention what they said.

The YouTube description is written to be found and clicked: front-load the hook and keywords in the first two lines, \
because only those show before "more". The site link (${SITE_URL}), chapters, subscribe line and hashtags are added \
automatically, so do not write them yourself.`;

async function main() {
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    const reviewedPath = episode.review?.reviewedPath;
    if (episode.status !== 'speakers_confirmed' || !reviewedPath) {
        throw new Error('The transcript has not been accepted yet');
    }
    if (episode.notes?.status === 'approved') {
        approved = true;
        throw new Error('Show notes are already approved; nothing to do');
    }

    await ref.update({
        'notes.status': 'generating', 'notes.startedAt': FieldValue.serverTimestamp(), 'notes.error': null,
        updatedAt: FieldValue.serverTimestamp(),
    });

    const [raw] = await getStorage().bucket().file(reviewedPath).download();
    const lines = (JSON.parse(raw.toString('utf8')) as { lines: ReviewedLine[] }).lines;
    const transcript = transcriptForPrompt(lines);
    console.log(`📝 ${episode.title}: ${lines.length} lines, ${transcript.length} characters`);

    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: betaZodOutputFormat(ShowNotesSchema) },
        system: SYSTEM,
        messages: [{
            role: 'user',
            content: `Episode: "${episode.title}"${episode.recordedAt ? `, recorded ${episode.recordedAt.slice(0, 10)}` : ''}.\n` +
                `Speakers: ${speakerList(lines)}.\n\n` +
                `<transcript>\n${transcript}\n</transcript>\n\nWrite the show notes.`,
        }],
    });

    if (response.stop_reason === 'refusal') throw new Error('Claude declined to write notes for this transcript');
    if (response.stop_reason === 'max_tokens') throw new Error('The notes were cut off (max_tokens); try again');
    if (!response.parsed_output) throw new Error('Claude returned notes in an unexpected shape');

    const notes = parseShowNotes(response.parsed_output);
    // Quotes and teaser clips get their exact times and speaker from the transcript words.
    const words: SpokenWord[] = lines.flatMap(l => l.words.map(w => ({ ...w, speaker: l.name, clip: l.clip })));
    const unverified = anchorToTranscript(notes, words);
    const { input_tokens, output_tokens } = response.usage;
    const usd = Math.round((input_tokens * USD_PER_MTOK.input + output_tokens * USD_PER_MTOK.output) / 1e4) / 100;
    console.log(`✅ ${response.model}: ${input_tokens} in, ${output_tokens} out, ~$${usd}; ${unverified.length} quote(s) not found verbatim`);

    await ref.update({
        'notes.status': 'ready',
        'notes.generated': notes,
        'notes.draft': notes,
        'notes.version': FieldValue.increment(1),
        'notes.model': response.model,
        'notes.unverifiedQuotes': unverified,
        'notes.generatedAt': FieldValue.serverTimestamp(),
        'notes.error': null,
        'costs.items': FieldValue.arrayUnion({ item: 'show_notes', usd, at: new Date() }),
        'costs.totalUsd': FieldValue.increment(usd),
        updatedAt: FieldValue.serverTimestamp(),
    });

    await sendEmail({ alert }, `Show notes ready: ${episode.title}`, [
        `Claude has drafted the show notes for "${episode.title}".`,
        '',
        `Review and approve them: ${SITE}/admin/podcast/${episodeId}/notes`,
        '',
        `Suggested title: ${notes.titles[0]}`,
        '',
        'In this episode:',
        ...notes.teaserClips.map(c => `  [${mmss(c.startMs)}] ${c.speaker}: "${c.text}"`),
        '',
        notes.summary,
    ].join('\n'));
}

main().catch(async error => {
    const message = (error as Error).message;
    console.error(`❌ ${message}`);
    if (!approved) {
        await ref.update({ 'notes.status': 'failed', 'notes.error': message, updatedAt: FieldValue.serverTimestamp() })
            .catch(() => {});
    }
    await sendEmail({ alert }, `Show notes failed: ${episodeId}`,
        `Show notes could not be drafted.\n\nError: ${message}\n\nTry again from the Podcast Studio.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
    process.exit(1);
});
