// Clips (docs/specs/025-clips.md): 5 to 15 minute stretches of the final cut, each about one topic,
// posted on YouTube as ordinary 16:9 videos beside the Shorts. Shared by the server and the Studio:
// the limits, what a clip is as the producer edits it, the chapters offered as clips, and clean
// ends on whole sentences. Stage 1 of the spec: offering, adding and editing; no job yet.

import { z } from 'zod';
import type { TimedWord } from './retime';
import { wordBounds } from './shorts';

export const CLIP_MIN_MS = 2 * 60_000;           // shorter is not made
export const CLIP_TARGET_MIN_MS = 5 * 60_000;    // the page aims for 5 to 15 minutes
export const CLIP_TARGET_MAX_MS = 15 * 60_000;
export const CLIP_MAX_MS = 20 * 60_000;          // longer is not made
export const MAX_CLIPS = 20;
export const CLIP_TITLE_MAX = 100;
export const CLIP_DESCRIPTION_MAX = 1000;
export const THUMB_TEXT_MAX = 60;                // with asterisks
// How far around each end the Studio shows words, so the end can be moved. Never the whole clip:
// a 15-minute stretch is about 2,500 words.
export const END_WINDOW_MS = 30_000;
// How far a chapter's ends may move to land on a whole sentence.
const SNAP_REACH_MS = 20_000;
// A pause this long ends a thought as surely as a full stop does.
const THOUGHT_PAUSE_MS = 1500;

export const ClipSourceSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('chapter'), index: z.number().int().min(0), count: z.number().int().min(1).max(3) }),
    z.object({ kind: z.literal('pick'), id: z.string().regex(/^[\w-]{4,40}$/) }),
    z.object({ kind: z.literal('own') }),
]);
export type ClipSource = z.infer<typeof ClipSourceSchema>;

// One clip as the producer edits it.
export const ClipEditSchema = z.object({
    id: z.string().regex(/^[\w-]{4,40}$/),
    source: ClipSourceSchema,
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    title: z.string().max(CLIP_TITLE_MAX),
    description: z.string().max(CLIP_DESCRIPTION_MAX),
    thumbText: z.string().max(THUMB_TEXT_MAX),
    synthetic: z.boolean(),
});
export type ClipEdit = z.infer<typeof ClipEditSchema>;

export type ClipLength = 'too short' | 'short' | 'good' | 'long' | 'too long';

// How a clip's length reads against the aim of 5 to 15 minutes and the limits of 2 to 20.
export function clipLength(ms: number): ClipLength {
    if (ms < CLIP_MIN_MS) return 'too short';
    if (ms < CLIP_TARGET_MIN_MS) return 'short';
    if (ms <= CLIP_TARGET_MAX_MS) return 'good';
    if (ms <= CLIP_MAX_MS) return 'long';
    return 'too long';
}
export const canMake = (ms: number) => ms >= CLIP_MIN_MS && ms <= CLIP_MAX_MS;

// A chapter on the final cut, as the final cut job re-timed it.
export interface FinalChapter { title: string; originalMs: number; startMs: number }

// The chapters as stretches of the final cut: each runs to the next chapter's start, the last to the end.
export function chapterSpans(chapters: FinalChapter[], durationMs: number) {
    const sorted = [...chapters].sort((a, b) => a.startMs - b.startMs);
    return sorted.map((c, i) => ({ index: i, title: c.title, startMs: c.startMs, endMs: Math.max(c.startMs, sorted[i + 1]?.startMs ?? durationMs) }));
}

const endsSentence = (w: TimedWord) => /[.?!]["”’)]*$/.test(w.text.trim());
// Whether a thought starts at word i: the first word, or after a sentence's end or a long pause.
const startsThought = (words: TimedWord[], i: number) =>
    i === 0 || endsSentence(words[i - 1]) || words[i].start - words[i - 1].end >= THOUGHT_PAUSE_MS;
// Whether a thought ends at word i: the last word, or a sentence's end, or before a long pause.
const endsThought = (words: TimedWord[], i: number) =>
    i === words.length - 1 || endsSentence(words[i]) || words[i + 1].start - words[i].end >= THOUGHT_PAUSE_MS;

// The nearest word to `ms` that passes `ok`, looking up to SNAP_REACH_MS either way; `from` when none does.
function nearest(words: TimedWord[], from: number, ms: number, ok: (i: number) => boolean) {
    let best = -1;
    for (let i = 0; i < words.length; i++) {
        if (Math.abs(words[i].start - ms) > SNAP_REACH_MS || !ok(i)) continue;
        if (best < 0 || Math.abs(words[i].start - ms) < Math.abs(words[best].start - ms)) best = i;
    }
    return best < 0 ? from : best;
}

// Clean ends for a stretch: it starts where a thought starts and ends where one ends, within 20 seconds of
// the times asked for, with a little air around them (wordBounds). Null when no word falls inside.
export function sentenceBounds(words: TimedWord[], startMs: number, endMs: number) {
    const spoken = words.filter(w => w.text.trim());
    const first = spoken.findIndex(w => w.start >= startMs - 50);
    let last = -1;
    for (let i = spoken.length - 1; i >= 0; i--) if (spoken[i].start < endMs) { last = i; break; }
    if (first < 0 || last < first) return null;
    const a = nearest(spoken, first, spoken[first].start, i => startsThought(spoken, i));
    const b = nearest(spoken, last, spoken[last].start, i => endsThought(spoken, i));
    return b >= a ? wordBounds(spoken, a, b) : wordBounds(spoken, first, last);
}

// Clean ends on whole words only, for a clip the producer marked by hand.
export function wordSnap(words: TimedWord[], startMs: number, endMs: number) {
    const spoken = words.filter(w => w.text.trim());
    const first = spoken.findIndex(w => w.end > startMs);
    let last = -1;
    for (let i = spoken.length - 1; i >= 0; i--) if (spoken[i].start < endMs) { last = i; break; }
    if (first < 0 || last < first) return null;
    return wordBounds(spoken, first, last);
}

// A new clip from `count` chapters starting at `index` (Add, or Join with next), before its ends are snapped.
export function chapterClip(spans: ReturnType<typeof chapterSpans>, index: number, count: number, id: string): ClipEdit | null {
    const from = spans[index], to = spans[index + count - 1];
    if (!from || !to) return null;
    return {
        id, source: { kind: 'chapter', index, count }, startMs: from.startMs, endMs: to.endMs,
        title: '', description: '', thumbText: '', synthetic: false,
    };
}

// Whether a clip already covers these chapters, so the page shows them as added.
export const hasChapterClip = (items: ClipEdit[], index: number, count: number) =>
    items.some(i => i.source.kind === 'chapter' && i.source.index === index && i.source.count === count);

// Whether an AI b-roll still may show inside a clip, for YouTube's altered-or-synthetic flag. B-roll times
// are in the original recording; each end is mapped back through the chapter it falls in, which ran at the
// same pace as the original apart from the edit's cuts inside it. With no chapters there is no way to tell,
// so the answer is yes.
export function clipShowsBroll(broll: { startMs: number; durationSeconds: number }[], chapters: FinalChapter[], startMs: number, endMs: number) {
    if (!broll.length) return false;
    const sorted = [...chapters].sort((a, b) => a.startMs - b.startMs);
    if (!sorted.length) return true;
    const original = (ms: number) => {
        let c = sorted[0];
        for (const x of sorted) if (x.startMs <= ms) c = x;
        return c.originalMs + (ms - c.startMs);
    };
    const from = original(startMs), to = original(endMs);
    return broll.some(b => b.startMs < to && b.startMs + b.durationSeconds * 1000 > from);
}
