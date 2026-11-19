// Clips (docs/specs/025-clips.md): 5 to 15 minute stretches of the final cut, each about one topic,
// posted on YouTube as ordinary 16:9 videos beside the Shorts. Shared by the server and the Studio:
// the limits, what a clip is as the producer edits it, the chapters offered as clips, and clean
// ends on whole sentences, and what Claude writes for each clip.

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
// The feelings a clip's thumbnail can show (spec 025 step 4): Claude names one or two when it writes the
// titles, and the search for the thumbnail's moment looks for a face that shows them.
export const CLIP_FEELINGS = ['surprise', 'excitement', 'wonder', 'delight', 'conviction', 'concern', 'anger'] as const;
export type ClipFeeling = (typeof CLIP_FEELINGS)[number];
export const MAX_FEELINGS = 2;
// The thumbnail's background: the brand's violet, or the moment's own frame, blurred and washed violet.
export const THUMB_BACKGROUNDS = ['brand', 'clip'] as const;
export type ThumbBackground = (typeof THUMB_BACKGROUNDS)[number];
// How many moments the search keeps for the thumbnail.
export const MAX_MOMENTS = 4;
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
    thumbFeeling: z.array(z.enum(CLIP_FEELINGS)).max(MAX_FEELINGS),
    thumbSpeaker: z.string().max(100).nullable(),          // null: whoever speaks most of the clip
    thumbMoment: z.number().int().min(0).max(MAX_MOMENTS).nullable(),   // which found moment the thumbnail uses (the last may be one chosen by hand)
    thumbBackground: z.enum(THUMB_BACKGROUNDS),
    synthetic: z.boolean(),
});
export type ClipEdit = z.infer<typeof ClipEditSchema>;

// The new fields a clip saved before them reads as (stage 2 added thumbFeeling, stage 3 the rest).
export const CLIP_DEFAULTS: Pick<ClipEdit, 'thumbSpeaker' | 'thumbMoment' | 'thumbBackground'> = { thumbSpeaker: null, thumbMoment: null, thumbBackground: 'brand' };
export function withClipDefaults<T extends Partial<ClipEdit>>(i: T) {
    return {
        ...i, thumbFeeling: i.thumbFeeling ?? [], thumbSpeaker: i.thumbSpeaker ?? null, thumbMoment: i.thumbMoment ?? null,
        thumbBackground: i.thumbBackground ?? 'brand',
    };
}

// What a made clip was cut from. It is current while all of this still matches; a title, description or
// thumbnail change does not need it made again. Bumped when the cutting itself changes.
export const CLIP_RENDER_VERSION = 1;
export interface ClipRenderInputs { version: number; startMs: number; endMs: number; finalAt: number }
export const clipRenderInputs = (i: { startMs: number; endMs: number }, finalAt: number): ClipRenderInputs =>
    ({ version: CLIP_RENDER_VERSION, startMs: i.startMs, endMs: i.endMs, finalAt });
export const sameClipRender = (a: ClipRenderInputs | null | undefined, b: ClipRenderInputs) =>
    !!a && a.version === b.version && a.startMs === b.startMs && a.endMs === b.endMs && a.finalAt === b.finalAt;
// Picture and sound fade in and out over this long at each end.
export const CLIP_FADE_S = 0.5;

// What Claude returns for the texts of each clip (mode titles). No .min()/.max(): Claude's output format
// does not take them; the job trims and checks.
export const ClipTextsSchema = z.object({
    clips: z.array(z.object({
        clip: z.number().int().describe('The number of the clip, as given'),
        title: z.string().describe('YouTube title, under 70 characters: specific to what this clip is about, curiosity-led, no hashtags, no clickbait'),
        description: z.string().describe('Two or three plain sentences on what the viewer will hear in this clip. No links, hashtags or timestamps: those are added.'),
        thumbText: z.string().describe(
            'The thumbnail title: the compelling title in two to six words, read at a glance on a phone. Mark one or two key words ' +
            'for gold by wrapping them in asterisks, e.g. "Heaven *Felt* Like *Home*". No quotation marks, no emoji.'),
        feeling: z.array(z.enum(CLIP_FEELINGS)).describe('One or two feelings the speaker\'s face on the thumbnail should show, to fit the title'),
    })),
});

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
        title: '', description: '', thumbText: '', ...CLIP_DEFAULTS, thumbFeeling: [], synthetic: false,
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

// ─── On YouTube (stage 4) ───────────────────────────────────────────────────

const mmssOf = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

// The episode's chapters inside a clip, timed from the clip's start: the one it starts in becomes 0:00. YouTube shows
// chapters only when there are three or more, the first at 0:00, each at least 10 seconds long, so anything less is
// none at all (an empty list).
export function clipChapters(chapters: { title: string; startMs: number }[], startMs: number, endMs: number) {
    const sorted = [...chapters].sort((a, b) => a.startMs - b.startMs);
    const opening = [...sorted].reverse().find(c => c.startMs <= startMs);
    const inside = [
        ...(opening ? [{ title: opening.title, ms: 0 }] : []),
        ...sorted.filter(c => c.startMs > startMs && c.startMs < endMs).map(c => ({ title: c.title, ms: c.startMs - startMs })),
    ];
    if (!inside.length || inside[0].ms !== 0) return [];
    const kept: { title: string; ms: number }[] = [];
    for (const c of inside) {
        const prev = kept[kept.length - 1];
        if (prev && c.ms - prev.ms < 10_000) continue;
        kept.push(c);
    }
    if (kept.length && endMs - startMs - kept[kept.length - 1].ms < 10_000) kept.pop();
    return kept.length >= 3 ? kept.map(c => `${mmssOf(c.ms)} ${c.title.replace(/[<>]/g, '').trim()}`) : [];
}

const TEXT_CLEAN = (s: string) => s.replace(/[<>]/g, '').replace(/[ \t]+/g, ' ').trim();

// What goes to YouTube for one clip: its title; the link to the full conversation first (marketing plan step 2,
// 2026-11-18), then its description, its chapters, the credits for the show library's sounds in the final cut, and two of the episode's hashtags; the
// episode's tags; the AI imagery flag.
export function clipMetadata(item: { title: string; description: string; synthetic: boolean }, o: {
    url: string; linkText: string; chapters: string[]; hashtags: string[]; tags: string[]; credits?: string[];
}) {
    const hashtags = o.hashtags.map(h => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, '')).slice(0, 2);
    const parts = [
        o.url ? `${o.linkText}: ${o.url}` : '',
        TEXT_CLEAN(item.description),
        o.chapters.length ? `Chapters\n${o.chapters.join('\n')}` : '',
        o.credits?.length ? `Music and sound\n${o.credits.map(c => c.replace(/[<>]/g, '')).join('\n')}` : '',
        hashtags.join(' '),
    ].filter(Boolean);
    return {
        title: TEXT_CLEAN(item.title).replace(/\s+/g, ' ').slice(0, CLIP_TITLE_MAX),
        description: parts.join('\n\n').slice(0, 5000),
        tags: o.tags.slice(0, 15),
        containsSyntheticMedia: item.synthetic,
    };
}

// The words heard in a clip, timed from its start, for its caption track.
export const clipWords = (words: TimedWord[], startMs: number, endMs: number) =>
    words.filter(w => w.start >= startMs - 50 && w.start < endMs)
        .map(w => ({ ...w, start: Math.max(0, w.start - startMs), end: Math.max(0, Math.min(endMs, w.end) - startMs) }));

// Clips go out this many days apart by default (the Studio settings' clipsEveryDays), at 11 am by default.
export const CLIP_DEFAULT_HOUR = 11;
