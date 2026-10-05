// Editor Light (spec 015): the edit model shared by the transcript editor and the render job.
// Cuts, kept ranges, time mapping, and suggestions for filler words, repeats, and pauses.

import { z } from 'zod';
import type { SpokenWord } from './showNotes';
import type { CaptionChoice, Overlay } from './onScreen';

export interface Cut {
    startMs: number;
    endMs: number;
    // 'retake': found by Claude (Part I). 'gap': a hesitation, a short silence inside a sentence
    // where an "um" may have been (AssemblyAI leaves those words out); suggested only on request.
    reason: 'filler' | 'pause' | 'repeat' | 'manual' | 'retake' | 'gap';
}

export interface EpisodeEdit {
    cuts: Cut[];
    version: number;
    // Part I: text and image overlays, and this video's own captions choice (null or missing: the Studio's).
    overlays?: Overlay[];
    captions?: CaptionChoice | null;
    // Split points (ms in the original recording), set at the playhead in the full-page editor.
    // They only divide the episode into sections that can be cut or brought back whole; the
    // render does not use them.
    splits?: number[];
}

// What the Studio may save as an edit (app/api/studio/episodes/[id]/edit). A two-hour episode
// with every filler and pause cut has a few thousand cuts; the cap keeps the episode document
// well under Firestore's 1 MiB limit.
export const MAX_CUTS = 10_000;
const ms = z.number().min(0).max(24 * 3600_000).transform(Math.round);
export const CutsSchema = z.array(z.object({
    startMs: ms,
    endMs: ms,
    reason: z.enum(['filler', 'pause', 'repeat', 'manual', 'retake', 'gap']),
}).strict().refine(c => c.endMs > c.startMs, 'A cut must end after it starts')).max(MAX_CUTS);

// Split points: whole milliseconds, each once, in order.
export const MAX_SPLITS = 500;
export const SplitsSchema = z.array(ms).max(MAX_SPLITS).transform(s => [...new Set(s)].sort((a, b) => a - b));

export interface KeptRange {
    startMs: number;
    endMs: number;
}

// A kept piece shorter than this is dropped — it would be a flash of audio between cuts.
const MIN_KEEP_MS = 150;

// Sort cuts by start; merge overlapping or touching (within joinMs) into single spans.
function mergeCuts(cuts: Cut[], joinMs: number): Cut[] {
    if (!cuts.length) return [];
    const sorted = [...cuts].sort((a, b) => a.startMs - b.startMs);
    const merged: Cut[] = [{ ...sorted[0] }];
    for (let i = 1; i < sorted.length; i++) {
        const prev = merged[merged.length - 1];
        // If the next cut starts before the previous ends (plus joinMs), merge them.
        if (sorted[i].startMs <= prev.endMs + joinMs) {
            prev.endMs = Math.max(prev.endMs, sorted[i].endMs);
        } else {
            merged.push({ ...sorted[i] });
        }
    }
    return merged;
}

// Returns the ranges to keep after applying cuts to a duration. Each cut stops padMs short
// of the words on either side, so a kept word is never clipped (transcript word times are
// only approximate, and the start of a word carries its consonant); at the very start or end
// of the episode there is no word to protect. Cuts are merged first, and kept pieces shorter
// than MIN_KEEP_MS are dropped.
export function keepRanges(durationMs: number, cuts: Cut[], padMs = 40): KeptRange[] {
    if (durationMs <= 0) return [];
    const merged = mergeCuts(cuts, 2 * padMs);
    const ranges: KeptRange[] = [];
    let cursor = 0;
    for (const cut of merged) {
        const start = cut.startMs <= 0 ? 0 : Math.min(durationMs, cut.startMs + padMs);
        const end = cut.endMs >= durationMs ? durationMs : Math.max(0, cut.endMs - padMs);
        if (end <= start) continue;                 // too short to cut once the words are protected
        if (start - cursor >= MIN_KEEP_MS) ranges.push({ startMs: cursor, endMs: start });
        cursor = Math.max(cursor, end);
    }
    if (durationMs - cursor >= MIN_KEEP_MS) ranges.push({ startMs: cursor, endMs: durationMs });
    return ranges;
}

// Where a moment of the original lands in the edited episode, or null if it was cut.
// If `roundToNextKept` is true and the moment is in a cut, returns the start of the
// next kept range instead of null.
export function editedTime(originalMs: number, ranges: KeptRange[], roundToNextKept = false): number | null {
    let offset = 0;
    for (const r of ranges) {
        if (originalMs < r.startMs) {
            // It's in the gap before this range — it was cut.
            return roundToNextKept ? offset : null;
        }
        if (originalMs <= r.endMs) {
            // It's inside this kept range.
            return offset + (originalMs - r.startMs);
        }
        offset += r.endMs - r.startMs;
    }
    // Past the last kept range — either cut or past the end.
    return roundToNextKept ? offset : null;
}

// Total duration of the edited episode from the kept ranges.
export function editedDuration(ranges: KeptRange[]): number {
    return ranges.reduce((sum, r) => sum + (r.endMs - r.startMs), 0);
}

const FILLER_WORDS = new Set(['um', 'uh', 'erm', 'uhm', 'hmm']);
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, '');

export interface SuggestOptions {
    maxPauseMs?: number;
    keepPauseMs?: number;
    // Also suggest hesitations (reason 'gap'). Off by default: they are guesses, and in long
    // conversations they far outnumber the real fillers.
    gaps?: boolean;
}

// What "Mark filler words and long pauses" suggests, and what "Mark hesitations" adds.
export const SUGGESTED_REASONS: Cut['reason'][] = ['filler', 'repeat', 'pause'];
export const HESITATION_REASONS: Cut['reason'][] = ['gap'];

// Suggests cuts for filler words, repeated words, and long pauses.
export function suggestCuts(words: SpokenWord[], options?: SuggestOptions): Cut[] {
    const maxPauseMs = options?.maxPauseMs ?? 1200;
    const keepPauseMs = options?.keepPauseMs ?? 500;
    const cuts: Cut[] = [];

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const norm = normalize(w.text);

        // Filler words
        if (FILLER_WORDS.has(norm)) {
            cuts.push({ startMs: w.start, endMs: w.end, reason: 'filler' });
            continue;
        }

        // Immediate repeats: same word twice in a row, keep the last one
        if (i > 0 && normalize(words[i - 1].text) === norm && norm.length > 0) {
            cuts.push({ startMs: words[i - 1].start, endMs: words[i - 1].end, reason: 'repeat' });
        }
    }

    // Pauses: a gap between consecutive words longer than maxPauseMs, shortened to keepPauseMs.
    for (let i = 1; i < words.length; i++) {
        const gap = words[i].start - words[i - 1].end;
        if (gap > maxPauseMs) {
            // Cut from the end of the pause to keepPauseMs before the next word.
            const cutStart = words[i - 1].end + keepPauseMs;
            const cutEnd = words[i].start;
            if (cutEnd > cutStart) {
                cuts.push({ startMs: cutStart, endMs: cutEnd, reason: 'pause' });
            }
        }
    }

    // Hesitations, only when asked: AssemblyAI leaves out "um" and "uh" by default, so one often
    // shows up as a silence between two words of a sentence. A gap of 500–1200 ms after a word
    // that ends no sentence or clause (no . ? ! , ; : or dash) becomes a 'gap' cut leaving 150 ms
    // of air. Shorter gaps, and the breath after a comma, are how people talk.
    if (options?.gaps) {
        const GAP_MIN = 500;
        const GAP_MAX = maxPauseMs;
        const GAP_KEEP_MS = 150;
        const endsClause = (s: string) => /[.?!,;:\u2014\u2013-]["\u201d\u2019)]*$/.test(s.trim());
        for (let i = 1; i < words.length; i++) {
            const prev = words[i - 1];
            const gap = words[i].start - prev.end;
            if (gap >= GAP_MIN && gap <= GAP_MAX && !endsClause(prev.text) && !FILLER_WORDS.has(normalize(words[i].text))) {
                cuts.push({ startMs: prev.end + GAP_KEEP_MS, endMs: words[i].start, reason: 'gap' });
            }
        }
    }

    return cuts;
}

// Replaces the earlier suggestions of these kinds with fresh ones, so marking twice adds nothing
// twice. The producer's own cuts, and suggestions of other kinds, stay.
export function replaceSuggestions(cuts: Cut[], fresh: Cut[], reasons: Cut['reason'][]): Cut[] {
    return [...cuts.filter(c => !reasons.includes(c.reason)), ...fresh.filter(c => reasons.includes(c.reason))];
}

export interface Section { startMs: number; endMs: number }

// The section of the episode around `atMs`: from the split before it (or the start) to the
// split after it (or the end).
export function sectionAt(splits: number[], atMs: number, totalMs: number): Section {
    let startMs = 0, endMs = totalMs;
    for (const s of splits) {
        if (s <= atMs && s > startMs) startMs = s;
        if (s > atMs && s < endMs) endMs = s;
    }
    return { startMs, endMs: Math.max(startMs, endMs) };
}

// Cuts a whole section (one cut, the producer's own).
export function cutSection(cuts: Cut[], section: Section): Cut[] {
    if (section.endMs <= section.startMs) return cuts;
    return [...cuts, { startMs: section.startMs, endMs: section.endMs, reason: 'manual' }];
}

// Brings a whole section back: every cut loses the part inside it; a cut that runs past the
// section keeps the parts outside.
export function restoreSection(cuts: Cut[], section: Section): Cut[] {
    const out: Cut[] = [];
    for (const c of cuts) {
        if (c.endMs <= section.startMs || c.startMs >= section.endMs) { out.push(c); continue; }
        if (c.startMs < section.startMs) out.push({ ...c, endMs: section.startMs });
        if (c.endMs > section.endMs) out.push({ ...c, startMs: section.endMs });
    }
    return out;
}

// Moves chapter start times onto the edited timeline. A chapter whose start was cut
// moves to the start of the next kept range.
export function applyToChapters(
    chapters: { startMs: number; title: string }[],
    ranges: KeptRange[],
): { startMs: number; title: string }[] {
    return chapters.map(ch => {
        const t = editedTime(ch.startMs, ranges, true);
        return { ...ch, startMs: t ?? 0 };
    });
}

// Moves quote times onto the edited timeline.
export function applyToQuotes(
    quotes: { startMs: number; endMs: number; text: string; speaker: string }[],
    ranges: KeptRange[],
): { startMs: number; endMs: number; text: string; speaker: string }[] {
    return quotes.map(q => {
        const start = editedTime(q.startMs, ranges, true);
        const end = editedTime(q.endMs, ranges, true);
        return { ...q, startMs: start ?? 0, endMs: end ?? (start ?? 0) };
    });
}

// The transcript as it will be heard in the edited episode: words that are fully kept, moved
// onto the edited timeline and shifted by `offsetMs` (whatever plays before the episode, such
// as teasers and the intro). Cut words are dropped. This replaces re-transcribing the final cut.
export function editedWords<W extends { start: number; end: number }>(words: W[], ranges: KeptRange[], offsetMs = 0): W[] {
    const out: W[] = [];
    for (const w of words) {
        const start = editedTime(w.start, ranges);
        const end = editedTime(w.end, ranges);
        if (start === null || end === null || end - start !== w.end - w.start) continue;
        out.push({ ...w, start: start + offsetMs, end: end + offsetMs });
    }
    return out;
}
