// Clips (docs/specs/025-clips.md), stage 2: Claude's suggested topics. Claude reads the whole final cut,
// with the chapters as hints, and suggests self-contained topics of 5 to 15 minutes. Code, not Claude,
// holds the rules: each suggestion must open where Claude says it does (its opening words are found in
// the final cut near that time, or it is dropped as unverified), start and end on whole thoughts, run 2 to
// 20 minutes, and overlap no better one by more than half.

import { z } from 'zod';
import { canMake, sentenceBounds, type ClipEdit } from './clips';
import type { TimedWord } from './retime';
import { overlapping } from './shortPicks';

export const CLIP_PICK_COUNT = 8;      // suggestions kept
export const CLIP_PICK_ASK = 10;       // asked for (Claude may return fewer)
export const CLIP_DIRECTION_MAX = 1000;
// How far from Claude's start time its opening words may be found.
const OPENING_REACH_MS = 30_000;
// How many of the opening's words must match, in order, to count as found.
const OPENING_WORDS = 6;

// What Claude returns. No .min()/.max(): Claude's output format does not take them.
export const ClipPicksSchema = z.object({
    picks: z.array(z.object({
        startMs: z.number().int().describe('The time in milliseconds of the transcript line where the topic starts'),
        endMs: z.number().int().describe('The time in milliseconds just after the topic\'s last word'),
        title: z.string().describe('A working title for the clip: what the topic is, in under 70 characters'),
        score: z.number().int().describe('1 to 10: how well it would hold a viewer who has never seen the episode, for its whole length'),
        opening: z.string().describe('The first eight to twelve words of the clip, exactly as spoken'),
        reason: z.string().describe('One plain sentence on why this topic works as a clip of its own'),
        standsAlone: z.boolean().describe('True when it makes sense without anything said earlier in the episode'),
    })),
});

export const ClipSuggestionSchema = z.object({
    id: z.string().regex(/^[\w-]{4,40}$/),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    title: z.string().max(100),
    score: z.number().int().min(1).max(10),
    opening: z.string().max(300),
    reason: z.string().max(300),
    standsAlone: z.boolean(),
});
export type ClipSuggestion = z.infer<typeof ClipSuggestionSchema>;

// The instructions sent to Claude, with the chapters as hints and the producer's direction when given.
export function clipPickInstructions(count: number, chapters: { title: string; startMs: number }[], direction: string): string {
    let text = `Pick up to ${count} topics from this episode that would each make a strong YouTube video of its own, ` +
        'ideally 5 to 15 minutes long and never under 2 or over 20. Each is one topic: a question explored, a story told ' +
        'from beginning to end, or an idea unfolded, that a viewer who has never seen the episode can follow and finish ' +
        'satisfied. Start each where the topic is raised, not mid-thought, and end it on a line that closes it.\n\n' +
        'For each give startMs, the time of the transcript line where it starts; endMs, the time just after its last word; ' +
        'a working title; a score from 1 to 10; the opening, its first eight to twelve words exactly as spoken; the reason, ' +
        'one plain sentence; and standsAlone, whether it makes sense without what came before. Topics may cross chapter ' +
        'lines; prefer the strongest topics over covering the whole episode. No two topics may overlap by more than half.';
    if (chapters.length) {
        text += `\n\nThe episode's chapters, as hints:\n${chapters.map(c => `[${c.startMs}ms] ${c.title}`).join('\n')}`;
    }
    const d = direction.trim();
    if (d) text += `\n\nDirection from the producer: ${d}`;
    return text;
}

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\s]+/g, ' ').split(/\s+/).filter(Boolean);

// The index of the word where the opening starts, found within 30 seconds of `startMs` on its first six
// words in order; -1 when it is not there.
export function findOpening(words: TimedWord[], startMs: number, opening: string): number {
    const want = tokens(opening).slice(0, OPENING_WORDS);
    if (!want.length) return -1;
    const heard = words.map(w => tokens(w.text).join(''));
    let best = -1;
    for (let i = 0; i < words.length; i++) {
        if (Math.abs(words[i].start - startMs) > OPENING_REACH_MS) continue;
        let k = 0, j = i;
        // A heard word with no letters or digits (a stray mark) is passed over.
        while (k < want.length && j < words.length) {
            if (!heard[j]) { j++; continue; }
            if (heard[j] !== want[k]) break;
            k++; j++;
        }
        if (k === want.length && (best < 0 || Math.abs(words[i].start - startMs) < Math.abs(words[best].start - startMs))) best = i;
    }
    return best;
}

export interface PlacedPick { startMs: number; endMs: number; title: string; score: number; opening: string; reason: string; standsAlone: boolean }

// Places one of Claude's picks on the final cut: from the word its opening was found at, to a whole
// thought near its end. 'unverified' when the opening is not there; null when it would be too short or long.
export function placePick(words: TimedWord[], p: z.infer<typeof ClipPicksSchema>['picks'][number]): PlacedPick | 'unverified' | null {
    const at = findOpening(words, p.startMs, p.opening);
    if (at < 0) return 'unverified';
    const bounds = sentenceBounds(words, words[at].start, p.endMs);
    if (!bounds || !canMake(bounds.endMs - bounds.startMs)) return null;
    // The end comes from sentenceBounds; the start stays at the opening as found, which is where Claude meant,
    // with the same air before it (sentenceBounds may have moved it to a nearer thought).
    const startMs = Math.round(Math.max(at > 0 ? words[at - 1].end : 0, words[at].start - 120));
    if (!canMake(bounds.endMs - startMs)) return null;
    return {
        startMs, endMs: bounds.endMs,
        title: p.title.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100),
        score: Math.min(10, Math.max(1, Math.round(p.score))),
        opening: p.opening.replace(/\s+/g, ' ').trim().slice(0, 300),
        reason: p.reason.replace(/\s+/g, ' ').trim().slice(0, 300),
        standsAlone: p.standsAlone,
    };
}

// Best first, keeping each that overlaps none already kept by more than half, up to `max`.
export function rankClipPicks(picks: PlacedPick[], max = CLIP_PICK_COUNT): PlacedPick[] {
    const sorted = [...picks].sort((a, b) => b.score - a.score || Number(b.standsAlone) - Number(a.standsAlone) || a.startMs - b.startMs);
    const kept: PlacedPick[] = [];
    for (const p of sorted) {
        if (kept.length >= max) break;
        if (!kept.some(k => overlapping(k, p))) kept.push(p);
    }
    return kept;
}

// Whether a suggestion is already one of the clips.
export const isTakenClip = (s: { startMs: number; endMs: number }, items: { startMs: number; endMs: number }[]) => items.some(i => overlapping(i, s));

// A suggestion as a new clip, its texts left for the producer or Claude to write.
export function suggestionToClip(s: ClipSuggestion, id: string): ClipEdit {
    return {
        id, source: { kind: 'pick', id: s.id }, startMs: s.startMs, endMs: s.endMs,
        title: '', description: '', thumbText: '', thumbFeeling: [], synthetic: false,
    };
}
