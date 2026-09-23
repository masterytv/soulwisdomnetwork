// Show notes for one episode (spec 005 step 5, Checkpoint B; docs/specs/007-show-notes.md).
// One schema for three jobs: what Claude must return, what the server accepts when a
// producer saves edits, and what the Checkpoint B page edits.

import { z } from 'zod';

const ms = z.number().int().describe('Milliseconds from the start of the episode');

export const ShowNotesSchema = z.object({
    titles: z.array(z.string()).describe('Five episode title options, best first. Under 70 characters each.'),
    chosenTitle: z.number().int().describe('Index into titles of the one to use; 0 unless a person picks another'),
    description: z.string().describe('YouTube description, 120-250 words, plain text. No chapter list, hashtags or links: those are added separately.'),
    summary: z.string().describe('Two or three short paragraphs for the website episode page.'),
    chapters: z.array(z.object({
        startMs: ms,
        title: z.string().describe('Two to six words'),
    })).describe('YouTube chapters in order. The first starts at 0. Five to twelve, each at least a minute long.'),
    quotes: z.array(z.object({
        text: z.string().describe('Copied word for word from the transcript'),
        speaker: z.string(),
        startMs: ms,
    })).describe('Five to eight quotable lines from the hosts or guests, never from a clip'),
    tags: z.array(z.string()).describe('10-15 YouTube tags, lower case'),
    themes: z.array(z.string()).describe('Three to five broad themes, e.g. "purpose", "life review"'),
    topics: z.array(z.string()).describe('Specific people, books, studies, places and ideas discussed'),
    teaser: z.string().describe('The "In this episode" script read over the intro music: 40-60 words, second person, no spoilers of the ending'),
    broll: z.array(z.object({
        startMs: ms,
        durationSeconds: z.number().int().describe('3 to 15'),
        idea: z.string().describe('What the image shows, concretely enough to generate it'),
        why: z.string().describe('What is being said at that moment that the image supports'),
    })).describe('Six still-image b-roll ideas (spec 005 section 3, option A). Nothing that depicts God, angels or the afterlife literally.'),
});

export type ShowNotes = z.infer<typeof ShowNotesSchema>;

// Server-side check of notes sent back by the Checkpoint B page, with size limits the
// schema alone does not express.
export function parseShowNotes(input: unknown): ShowNotes {
    const notes = ShowNotesSchema.parse(input);
    const long = (s: string, max: number, what: string) => {
        if (s.length > max) throw new Error(`${what} is too long`);
    };
    long(notes.description, 5000, 'Description');
    long(notes.summary, 5000, 'Summary');
    long(notes.teaser, 1500, 'Teaser');
    for (const [list, max, what] of [
        [notes.titles, 10, 'titles'], [notes.chapters, 40, 'chapters'], [notes.quotes, 30, 'quotes'],
        [notes.tags, 40, 'tags'], [notes.themes, 20, 'themes'], [notes.topics, 60, 'topics'], [notes.broll, 30, 'b-roll ideas'],
    ] as const) {
        if (list.length > max) throw new Error(`Too many ${what}`);
    }
    const clean = (list: string[]) => list.map(t => t.trim()).filter(Boolean);
    notes.tags = clean(notes.tags);
    notes.themes = clean(notes.themes);
    notes.topics = clean(notes.topics);
    if (notes.chosenTitle < 0 || notes.chosenTitle >= notes.titles.length) notes.chosenTitle = 0;
    // Bounds live here rather than in the schema: structured outputs support few keywords.
    for (const t of [...notes.chapters, ...notes.quotes, ...notes.broll]) t.startMs = Math.max(0, t.startMs);
    for (const b of notes.broll) b.durationSeconds = Math.min(15, Math.max(3, b.durationSeconds));
    return notes;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Quotes must be what was said. Returns the quotes whose words are not in the transcript.
export function unverifiedQuotes(notes: ShowNotes, transcriptText: string) {
    const haystack = normalise(transcriptText);
    return notes.quotes.filter(q => !haystack.includes(normalise(q.text)));
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
