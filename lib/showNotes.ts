// Show notes for one episode (spec 005 step 5, Checkpoint B; docs/specs/007-show-notes.md).
// One schema for three jobs: what Claude must return, what the server accepts when a
// producer saves edits, and what the Checkpoint B page edits.

import { z } from 'zod';

const ms = z.number().int().describe('Milliseconds from the start of the episode');

export const SITE_URL = 'https://soulwisdomcollective.com';

// Always under the description on YouTube, whatever Claude or a producer writes above it.
export const DESCRIPTION_FOOTER = '🔔 Subscribe and turn on notifications so you never miss a conversation.';

const clip = z.object({
    text: z.string().describe('The exact words of the clip, copied from the transcript; it may stop mid-sentence'),
    speaker: z.string().describe('The speaker name exactly as it appears in the transcript'),
    startMs: ms,
    endMs: ms,
});

// What Claude returns. Every field is required: structured outputs are strict.
export const ShowNotesSchema = z.object({
    titles: z.array(z.string()).describe('Five YouTube title options, best first, under 70 characters, curiosity-led and specific, no clickbait or all caps.'),
    chosenTitle: z.number().int().describe('Index into titles of the one to use; 0 unless a person picks another'),
    description: z.string().describe(
        'YouTube description, 150-300 words, plain text. The first two lines (about 150 characters) show above "more": ' +
        'open with a hook that names the episode\'s big question and main keywords, then say who is in it. Short paragraphs, ' +
        'natural keywords (near-death experience, NDE, meaning of life...), and end with one question inviting comments. ' +
        'Do not add chapters, links, hashtags or a subscribe line: those are appended automatically.'),
    hashtags: z.array(z.string()).describe('Exactly three hashtags for the end of the description, e.g. "#NearDeathExperience"'),
    summary: z.string().describe('Two or three short paragraphs for the website episode page.'),
    chapters: z.array(z.object({
        startMs: ms,
        title: z.string().describe('Two to six words'),
    })).describe('YouTube chapters in order. The first starts at 0. Five to twelve, each at least a minute long.'),
    quotes: z.array(clip.omit({ endMs: true }).extend({
        text: z.string().describe('Copied word for word from the transcript'),
    })).describe('Five to eight quotable lines from the hosts or guests, never from a clip'),
    teaserClips: z.array(clip).describe(
        'The "In this episode" cold open: three or four short clips from the episode played in order under an ' +
        '"In this episode" title, 20-40 seconds in total. Pick striking lines that make people want to watch; ' +
        'at least one should end on an unanswered question or cut off just before the answer (for example ' +
        '"I think the meaning of life is..."). Never give away the conclusion. Hosts and guests only, never a clip.'),
    tags: z.array(z.string()).describe('10-15 YouTube tags, lower case'),
    themes: z.array(z.string()).describe('Three to five broad themes, e.g. "purpose", "life review"'),
    topics: z.array(z.string()).describe('Specific people, books, studies, places and ideas discussed'),
    broll: z.array(z.object({
        startMs: ms,
        durationSeconds: z.number().int().describe('3 to 15'),
        idea: z.string().describe('What the image shows, concretely enough to generate it'),
        why: z.string().describe('What is being said at that moment that the image supports'),
    })).describe('Six still-image b-roll ideas (spec 005 section 3, option A). Nothing that depicts God, angels or the afterlife literally.'),
});

// What is stored and edited. Notes drafted before teaser clips and hashtags existed still load.
export const StoredShowNotesSchema = ShowNotesSchema.extend({
    hashtags: z.array(z.string()).default([]),
    teaserClips: z.array(clip).default([]),
});

export type ShowNotes = z.infer<typeof StoredShowNotesSchema>;
export type TeaserClip = ShowNotes['teaserClips'][number];

export function parseShowNotes(input: unknown): ShowNotes {
    const notes = StoredShowNotesSchema.parse(input);
    const long = (s: string, max: number, what: string) => {
        if (s.length > max) throw new Error(`${what} is too long`);
    };
    long(notes.description, 5000, 'Description');
    long(notes.summary, 5000, 'Summary');
    for (const [list, max, what] of [
        [notes.titles, 10, 'titles'], [notes.chapters, 40, 'chapters'], [notes.quotes, 30, 'quotes'],
        [notes.tags, 40, 'tags'], [notes.themes, 20, 'themes'], [notes.topics, 60, 'topics'], [notes.broll, 30, 'b-roll ideas'], [notes.teaserClips, 10, 'teaser clips'], [notes.hashtags, 15, 'hashtags'],
    ] as const) {
        if (list.length > max) throw new Error(`Too many ${what}`);
    }
    const clean = (list: string[]) => list.map(t => t.trim()).filter(Boolean);
    notes.tags = clean(notes.tags);
    notes.themes = clean(notes.themes);
    notes.topics = clean(notes.topics);
    if (notes.chosenTitle < 0 || notes.chosenTitle >= notes.titles.length) notes.chosenTitle = 0;
    // Bounds live here rather than in the schema: structured outputs support few keywords.
    for (const t of [...notes.chapters, ...notes.quotes, ...notes.broll, ...notes.teaserClips]) t.startMs = Math.max(0, t.startMs);
    for (const c of notes.teaserClips) c.endMs = Math.max(c.startMs, c.endMs);
    notes.hashtags = clean(notes.hashtags).map(h => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, ''));
    for (const b of notes.broll) b.durationSeconds = Math.min(15, Math.max(3, b.durationSeconds));
    return notes;
}

// One spoken word of the accepted transcript, with who said it.
export interface SpokenWord { text: string; start: number; end: number; speaker: string; clip: boolean }

const token = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, '');
const tokens = (s: string) => s.replace(/(\.\.\.|…)\s*$/, '').split(/\s+/).map(token).filter(Boolean);

// Finds `text` word for word among the words hosts and guests spoke (clips excluded) and
// returns its exact times and speaker, or null if it was not said.
export function locate(text: string, words: SpokenWord[], nearMs = 0) {
    const want = tokens(text);
    if (!want.length) return null;
    const spoken = words.filter(w => !w.clip);
    const have = spoken.map(w => token(w.text));
    let best: { startMs: number; endMs: number; speaker: string } | null = null;
    for (let i = 0; i + want.length <= have.length; i++) {
        if (want.every((t, k) => have[i + k] === t)) {
            const found = { startMs: spoken[i].start, endMs: spoken[i + want.length - 1].end, speaker: spoken[i].speaker };
            if (!best || Math.abs(found.startMs - nearMs) < Math.abs(best.startMs - nearMs)) best = found;
        }
    }
    return best;
}

// Puts quotes and teaser clips on the exact words and speaker from the transcript. Returns
// the texts that could not be found word for word, for the page to flag.
export function anchorToTranscript(notes: ShowNotes, words: SpokenWord[]) {
    const unverified: string[] = [];
    for (const item of [...notes.quotes, ...notes.teaserClips]) {
        const found = locate(item.text, words, item.startMs);
        if (!found) { unverified.push(item.text); continue; }
        item.startMs = found.startMs;
        item.speaker = found.speaker;
        if ('endMs' in item) item.endMs = found.endMs;
    }
    return unverified;
}

export function mmss(ms: number) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// "0:00 Intro" lines as YouTube expects them in the description.
export function chapterList(notes: ShowNotes) {
    return notes.chapters.map(c => `${mmss(c.startMs)} ${c.title}`).join('\n');
}

// The whole description as pasted into YouTube. The site link sits straight after the text,
// as high as it can go, and is always there whatever the text says.
export function youtubeDescription(notes: ShowNotes) {
    return [
        notes.description.trim(),
        `🌐 Full episodes, transcripts and the Soul Wisdom community: ${SITE_URL}`,
        notes.chapters.length ? `Chapters\n${chapterList(notes)}` : '',
        DESCRIPTION_FOOTER,
        notes.hashtags.join(' '),
    ].filter(Boolean).join('\n\n');
}
