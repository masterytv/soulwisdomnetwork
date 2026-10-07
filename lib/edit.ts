// Editor Light (spec 015): the edit model shared by the transcript editor and the render job.
// Cuts, kept ranges, time mapping, and suggestions for filler words, repeats, and pauses.

import { z } from 'zod';
import type { SpokenWord } from './showNotes';
import type { CaptionChoice, Overlay } from './onScreen';
import type { Join } from './transitions';
import type { Layer } from './layers';
import type { Sound } from './audio';
import type { VoiceCleanup } from './voice';
import type { Teaser } from './programme';
import { isFiller } from './fillers';

export interface Cut {
    startMs: number;
    endMs: number;
    // 'retake': found by Claude (Part I). 'gap': a hesitation, a short silence inside a sentence
    // where an "um" may have been (transcripts from before `disfluencies` was on lack those words); suggested only on request.
    reason: 'filler' | 'pause' | 'repeat' | 'manual' | 'retake' | 'gap';
}

export interface EpisodeEdit {
    cuts: Cut[];
    version: number;
    // Part I: text and image overlays, and this video's own captions choice (null or missing: the Studio's).
    overlays?: Overlay[];
    captions?: CaptionChoice | null;
    // Split points (ms in the original recording), set at the playhead or with the Blade in the
    // Studio editor. They divide the episode into sections that can be cut, brought back or
    // trimmed whole, and where a transition can go.
    splits?: number[];
    // Transitions (spec 020 item E4, lib/transitions.ts): at splits, and this episode's own at the
    // start, between its teasers, intro and outro, and at the end (missing: the Studio's).
    joins?: Join[];
    // Pictures, video and text over the episode (spec 020 item E5, lib/layers.ts), grown from `overlays`.
    // Once an edit has them, `overlays` is empty and the render draws the notes plan's b-roll only as
    // layers; before that, `layersOf` reads the overlays.
    layers?: Layer[];
    // Music and effects (spec 020 item E7, lib/audio.ts) on A2 and A3, from the show library or the episode's media.
    audio?: Sound[];
    // This episode's voice clean-up in the render (spec 019 item 3.2, lib/voice.ts); null or missing: the Studio's.
    voice?: VoiceCleanup | null;
    // Whether the render makes the voice from the episode's speaker tracks, when it has them (spec 019 item 3.3);
    // null or missing: yes.
    speakerTracks?: boolean | null;
    // Spec 020 item E9: the sections (the stretches between splits, numbered in the recording's order) in the order
    // they play; null or missing: the recording's order. And this episode's own intro and outro, from its media bin
    // (null or missing: the Studio settings').
    order?: number[] | null;
    intro?: { path: string; name: string } | null;
    outro?: { path: string; name: string } | null;
    // Item E10: the "In this episode" teasers, stretches of the recording played in this order before the intro,
    // as the Studio editor shows them (lib/programme.ts); an empty list for none. Null or missing (an edit saved
    // before E10): the edit package's clips, or the notes' cut plainly, as the render always made them.
    teasers?: Teaser[] | null;
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
    // Where the range starts in the edited episode, when that is not straight after the range
    // before it (a transition overlaps two ranges; set by playOrder in lib/sequence.ts). Missing,
    // the ranges play back to back.
    atMs?: number;
}

// A kept piece shorter than this is dropped — it would be a flash of audio between cuts.
const MIN_KEEP_MS = 150;
// A kept piece shorter than this with no whole word in it is dropped too (spec 019 item 1.5): two
// cuts close together leave a breath between them, which sounds choppy and adds a join.
export const SLIVER_MS = 400;

// Whether a whole word lies inside start..end. `words` is sorted by start.
function holdsWord(words: { start: number; end: number }[], start: number, end: number): boolean {
    let lo = 0, hi = words.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (words[mid].start < start) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < words.length && words[i].start < end; i++) if (words[i].end <= end) return true;
    return false;
}

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
// than MIN_KEEP_MS are dropped. Given the transcript's `words`, so are pieces shorter than
// SLIVER_MS holding no whole word; without them (an old caller) only the first rule applies.
export function keepRanges(durationMs: number, cuts: Cut[], padMs = 40, words?: { start: number; end: number }[]): KeptRange[] {
    if (durationMs <= 0) return [];
    const merged = mergeCuts(cuts, 2 * padMs);
    const sorted = words ? [...words].sort((a, b) => a.start - b.start) : null;
    const keeps = (from: number, to: number) => to - from >= MIN_KEEP_MS
        && (!sorted || to - from >= SLIVER_MS || holdsWord(sorted, from, to));
    const ranges: KeptRange[] = [];
    let cursor = 0;
    for (const cut of merged) {
        const start = cut.startMs <= 0 ? 0 : Math.min(durationMs, cut.startMs + padMs);
        const end = cut.endMs >= durationMs ? durationMs : Math.max(0, cut.endMs - padMs);
        if (end <= start) continue;                 // too short to cut once the words are protected
        if (keeps(cursor, start)) ranges.push({ startMs: cursor, endMs: start });
        cursor = Math.max(cursor, end);
    }
    if (keeps(cursor, durationMs)) ranges.push({ startMs: cursor, endMs: durationMs });
    return ranges;
}

// Where a moment of the original lands in the edited episode, or null if it was cut.
// If `roundToNextKept` is true and the moment is in a cut, returns the start of the
// next kept range instead of null. Ranges from playOrder (lib/sequence.ts) carry their own
// place in the edited episode, so transitions that overlap two ranges move everything after them.
export function editedTime(originalMs: number, ranges: KeptRange[], roundToNextKept = false): number | null {
    if (!inSourceOrder(ranges)) return editedTimeAnyOrder(originalMs, ranges, roundToNextKept);
    let offset = 0;
    for (const r of ranges) {
        const at = r.atMs ?? offset;
        if (originalMs < r.startMs) {
            // It's in the gap before this range — it was cut.
            return roundToNextKept ? at : null;
        }
        if (originalMs <= r.endMs) {
            // It's inside this kept range.
            return at + (originalMs - r.startMs);
        }
        offset = at + (r.endMs - r.startMs);
    }
    // Past the last kept range — either cut or past the end.
    return roundToNextKept ? offset : null;
}

// Whether the ranges play in the recording's order (always, until sections are moved: spec 020 item E9).
function inSourceOrder(ranges: KeptRange[]) {
    for (let i = 1; i < ranges.length; i++) if (ranges[i].startMs < ranges[i - 1].startMs) return false;
    return true;
}

// editedTime when sections were moved: the range a moment is in, wherever it plays; when it is cut, with
// `roundToNextKept`, where the next kept moment of the recording plays (or the end, past the last).
function editedTimeAnyOrder(originalMs: number, ranges: KeptRange[], roundToNextKept: boolean): number | null {
    let offset = 0, end = 0;
    let next: { startMs: number; at: number } | null = null;
    for (const r of ranges) {
        const at = r.atMs ?? offset;
        if (originalMs >= r.startMs && originalMs <= r.endMs) return at + (originalMs - r.startMs);
        if (r.startMs > originalMs && (!next || r.startMs < next.startMs)) next = { startMs: r.startMs, at };
        offset = at + (r.endMs - r.startMs);
        end = Math.max(end, offset);
    }
    return roundToNextKept ? next?.at ?? end : null;
}

// ─── Moving sections (spec 020 item E9) ──────────────────────────────────────

// Whether `order` is a play order for `count` sections: each once.
export function validOrder(order: unknown, count: number): order is number[] {
    return Array.isArray(order) && order.length === count && [...order].sort((a, b) => a - b).every((v, i) => v === i);
}

// Whether an order moves anything.
export const isReordered = (order: number[] | null | undefined) => !!order && order.some((v, i) => v !== i);

// The order after a split at `ms` (with `splits` as they were): the section it divides becomes two, side by side.
export function orderAfterSplit(order: number[] | null | undefined, splits: number[], ms: number): number[] | null {
    if (!isReordered(order)) return null;
    const s = splits.filter(x => x < ms).length;
    return order!.flatMap(v => (v === s ? [s, s + 1] : [v > s ? v + 1 : v]));
}

// The order after the split at `ms` is removed: the section after it joins the one before, which keeps its place.
export function orderAfterUnsplit(order: number[] | null | undefined, splits: number[], ms: number): number[] | null {
    if (!isReordered(order)) return null;
    const i = [...splits].sort((a, b) => a - b).indexOf(ms);
    if (i < 0) return order!;
    const next = order!.filter(v => v !== i + 1).map(v => (v > i + 1 ? v - 1 : v));
    return isReordered(next) ? next : null;
}

// Moves the section at play position `from` to `to`.
export function moveSection(order: number[] | null | undefined, count: number, from: number, to: number): number[] | null {
    const base = validOrder(order, count) ? [...order] : Array.from({ length: count }, (_, i) => i);
    if (from < 0 || from >= count || to < 0 || to >= count) return isReordered(base) ? base : null;
    const [v] = base.splice(from, 1);
    base.splice(to, 0, v);
    return isReordered(base) ? base : null;
}

// Total duration of the edited episode from the kept ranges.
export function editedDuration(ranges: KeptRange[]): number {
    let offset = 0, end = 0;
    for (const r of ranges) {
        offset = (r.atMs ?? offset) + (r.endMs - r.startMs);
        end = Math.max(end, offset);
    }
    return end;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, '');

// Silences measured in the episode's audio at ingest (spec 019 item 1.1): stretches quieter than
// `noiseDb` for at least `minMs`, saved as episodes/{id}/analysis/silences.json.
export interface Silence { startMs: number; endMs: number }
export interface SilencesFile { noiseDb: number; minMs: number; silences: Silence[] }

export const SilencesFileSchema = z.object({
    noiseDb: z.number(),
    minMs: z.number(),
    silences: z.array(z.object({ startMs: z.number(), endMs: z.number() })).max(100_000),
});

export interface SuggestOptions {
    maxPauseMs?: number;
    keepPauseMs?: number;
    // The audio's measured silences. With them, pauses come from the audio instead of the gaps
    // between words: a silence inside a word's time span counts, and a gap the audio says is not
    // silent (laughter, a breath, music) does not. Without them (or with none found, as on a noisy
    // recording) the word gaps are used.
    silences?: Silence[] | null;
    // Also suggest hesitations (reason 'gap'). Off by default: they are guesses, and in long
    // conversations they far outnumber the real fillers.
    gaps?: boolean;
}

// What "Mark filler words and long pauses" suggests, and what "Mark hesitations" adds.
export const SUGGESTED_REASONS: Cut['reason'][] = ['filler', 'repeat', 'pause'];
export const HESITATION_REASONS: Cut['reason'][] = ['gap'];

// Suggests cuts for filler words, repeated words, and long pauses.
const REPEAT_GAP_MS = 300;
const endsSentence = (s: string) => /[.?!]["\u201d\u2019)]*$/.test(s.trim());
const endsClause = (s: string) => /[.?!,;:\u2014\u2013-]["\u201d\u2019)]*$/.test(s.trim());

// Speech the transcript missed (spec 019 item 1.2): a stretch between words, at least
// UNSPOKEN_MIN_MS long, that no word covers and the audio says is not silent. Often an "um" or a
// false start AssemblyAI left out, sometimes a breath or a laugh. `before` is the index of the
// word it comes before. Only stretches between words count: before the first word and after the
// last there is nothing to compare with.
export const UNSPOKEN_MIN_MS = 300;
// Longer than this it is more likely laughter, music or crosstalk than a hesitation: shown, not suggested.
export const UNSPOKEN_SUGGEST_MAX_MS = 1500;
export interface UnspokenSpan { startMs: number; endMs: number; before: number }

export function unspokenSpans(words: { start: number; end: number }[], silences: Silence[], minMs = UNSPOKEN_MIN_MS): UnspokenSpan[] {
    const quiet = [...silences].sort((a, b) => a.startMs - b.startMs);
    const out: UnspokenSpan[] = [];
    let reach = words.length ? words[0].end : 0;      // the latest any word so far ends (speakers can overlap)
    let k = 0;
    for (let i = 1; i < words.length; i++) {
        const from = reach, to = words[i].start;
        reach = Math.max(reach, words[i].end);
        if (to - from < minMs) continue;
        while (k < quiet.length && quiet[k].endMs <= from) k++;
        let cursor = from;
        for (let j = k; j < quiet.length && quiet[j].startMs < to; j++) {
            if (quiet[j].startMs - cursor >= minMs) out.push({ startMs: Math.round(cursor), endMs: Math.round(quiet[j].startMs), before: i });
            cursor = Math.max(cursor, quiet[j].endMs);
        }
        if (to - cursor >= minMs) out.push({ startMs: Math.round(cursor), endMs: Math.round(to), before: i });
    }
    return out;
}

export function suggestCuts(words: SpokenWord[], options?: SuggestOptions): Cut[] {
    const maxPauseMs = options?.maxPauseMs ?? 1200;
    const keepPauseMs = options?.keepPauseMs ?? 500;
    const cuts: Cut[] = [];

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const norm = normalize(w.text);

        // Filler words
        if (isFiller(norm)) {
            cuts.push({ startMs: w.start, endMs: w.end, reason: 'filler' });
            continue;
        }

        // Immediate repeats: the same word twice in a row, keeping the last. Only a stammer: the
        // same speaker, inside one sentence, and the second straight after the first (within
        // REPEAT_GAP_MS). A word said again after a pause, or across a sentence, is for emphasis.
        const prev = words[i - 1];
        if (i > 0 && norm.length > 0 && normalize(prev.text) === norm && prev.speaker === w.speaker
            && !endsSentence(prev.text) && w.start - prev.end <= REPEAT_GAP_MS) {
            cuts.push({ startMs: prev.start, endMs: prev.end, reason: 'repeat' });
        }
    }

    // Speech the transcript missed, offered as fillers: short, inside one speaker's clause (a breath
    // after a comma or a full stop is how people talk), and not next to a filler already cut.
    if (options?.silences?.length) {
        for (const s of unspokenSpans(words, options.silences)) {
            const prev = words[s.before - 1], next = words[s.before];
            if (s.endMs - s.startMs > UNSPOKEN_SUGGEST_MAX_MS || prev.speaker !== next.speaker || endsClause(prev.text)
                || isFiller(normalize(prev.text)) || isFiller(normalize(next.text))) continue;
            cuts.push({ startMs: s.startMs, endMs: s.endMs, reason: 'filler' });
        }
    }

    // Pauses measured in the audio: a silence longer than maxPauseMs is shortened to keepPauseMs,
    // half of it kept after the sound stops and half before it starts again.
    const silences = options?.silences;
    if (silences?.length) {
        for (const s of silences) {
            if (s.endMs - s.startMs <= maxPauseMs) continue;
            const half = Math.round(keepPauseMs / 2);
            cuts.push({ startMs: Math.round(s.startMs) + half, endMs: Math.round(s.endMs) - half, reason: 'pause' });
        }
    }

    // Pauses from the transcript: a gap between consecutive words longer than maxPauseMs, shortened to keepPauseMs.
    for (let i = 1; i < words.length && !silences?.length; i++) {
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

    // Hesitations, only when asked: episodes transcribed before ingest turned on `disfluencies`
    // have no "um" or "uh", and AssemblyAI still misses some, so one often shows up as a silence
    // between two words of a sentence. A gap of 500–1200 ms after a word
    // that ends no sentence or clause (no . ? ! , ; : or dash) becomes a 'gap' cut leaving 150 ms
    // of air. Shorter gaps, and the breath after a comma, are how people talk. With measured
    // silences the missed speech above is found instead, so this guess is not used.
    if (options?.gaps && !options.silences?.length) {
        const GAP_MIN = 500;
        const GAP_MAX = maxPauseMs;
        const GAP_KEEP_MS = 150;
        for (let i = 1; i < words.length; i++) {
            const prev = words[i - 1];
            const gap = words[i].start - prev.end;
            if (gap >= GAP_MIN && gap <= GAP_MAX && !endsClause(prev.text) && !isFiller(normalize(words[i].text))) {
                cuts.push({ startMs: prev.end + GAP_KEEP_MS, endMs: words[i].start, reason: 'gap' });
            }
        }
    }

    return cuts;
}

// How much each kind of cut saves on its own: the length of its cuts, with overlaps counted
// once. Kinds can overlap one another, so these add up to more than the total saved.
export function savedByReason(cuts: Cut[]): Partial<Record<Cut['reason'], number>> {
    const byReason = new Map<Cut['reason'], Cut[]>();
    for (const c of cuts) byReason.set(c.reason, [...(byReason.get(c.reason) ?? []), c]);
    const out: Partial<Record<Cut['reason'], number>> = {};
    for (const [reason, list] of byReason) {
        let total = 0, end = -Infinity;
        for (const c of [...list].sort((a, b) => a.startMs - b.startMs)) {
            const from = Math.max(c.startMs, end);
            if (c.endMs > from) total += c.endMs - from;
            end = Math.max(end, c.endMs);
        }
        out[reason] = total;
    }
    return out;
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

// Where a section's kept part starts and ends once the cuts are taken out (spec 020 item E3): the
// first and last moments inside it that no cut covers; null when it is cut whole.
export function keptBounds(cuts: Cut[], section: Section): Section | null {
    const inside = cuts.filter(c => c.endMs > section.startMs && c.startMs < section.endMs);
    let head = section.startMs;
    for (const c of [...inside].sort((a, b) => a.startMs - b.startMs)) if (c.startMs <= head) head = Math.max(head, c.endMs);
    if (head >= section.endMs) return null;
    let tail = section.endMs;
    for (const c of [...inside].sort((a, b) => b.endMs - a.endMs)) if (c.endMs >= tail) tail = Math.min(tail, c.startMs);
    return { startMs: head, endMs: Math.max(head, tail) };
}

// A trimmed section keeps at least this much.
export const MIN_PART_MS = 100;

// Trims a section's start or end to `toMs` (spec 020 item E3), with the producer's own cuts: moving
// the edge in cuts from where the kept part began (or ended) to the new edge; moving it out brings
// that stretch back. The edge stays inside the section, and MIN_PART_MS short of the other edge.
export function trimSection(cuts: Cut[], section: Section, edge: 'start' | 'end', toMs: number): Cut[] {
    const kept = keptBounds(cuts, section);
    const v = Math.round(Math.min(section.endMs, Math.max(section.startMs, toMs)));
    if (edge === 'start') {
        const head = kept ? kept.startMs : section.endMs;
        const t = kept ? Math.min(v, kept.endMs - MIN_PART_MS) : v;
        if (t > head) return [...cuts, { startMs: head, endMs: t, reason: 'manual' }];
        if (t < head) return restoreSection(cuts, { startMs: t, endMs: head });
        return cuts;
    }
    const tail = kept ? kept.endMs : section.startMs;
    const t = kept ? Math.max(v, kept.startMs + MIN_PART_MS) : v;
    if (t < tail) return [...cuts, { startMs: t, endMs: tail, reason: 'manual' }];
    if (t > tail) return restoreSection(cuts, { startMs: tail, endMs: t });
    return cuts;
}

// The sections the splits make, in order.
export function sectionsOf(splits: number[], totalMs: number): Section[] {
    const edges = [0, ...[...splits].sort((a, b) => a - b).filter(s => s > 0 && s < totalMs), totalMs];
    const out: Section[] = [];
    for (let i = 0; i + 1 < edges.length; i++) if (edges[i + 1] > edges[i]) out.push({ startMs: edges[i], endMs: edges[i + 1] });
    return out;
}

// Moves chapter start times onto the edited timeline. A chapter whose start was cut
// moves to the start of the next kept range.
export function applyToChapters(
    chapters: { startMs: number; title: string }[],
    ranges: KeptRange[],
): { startMs: number; title: string }[] {
    // Index for index with `chapters` (callers pair them up); with moved sections (spec 020 item E9) they may then
    // need sorting by their new times.
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
// A word inside one range takes that range's place: one starting exactly where a part after a
// transition starts belongs to that part, not to the end of the one before (spec 020 item E8).
export function editedWords<W extends { start: number; end: number }>(words: W[], ranges: KeptRange[], offsetMs = 0): W[] {
    const out: { word: W; stretch: number }[] = [];
    for (const w of words) {
        let start: number | null = null, offset = 0, stretch = -1;
        for (const [i, r] of ranges.entries()) {
            const at = r.atMs ?? offset;
            if (w.start >= r.startMs && w.end <= r.endMs) { start = at + (w.start - r.startMs); stretch = i; break; }
            offset = at + (r.endMs - r.startMs);
        }
        if (start === null) {
            // Across two ranges that play back to back.
            const s = editedTime(w.start, ranges), e = editedTime(w.end, ranges);
            if (s === null || e === null || e - s !== w.end - w.start) continue;
            start = s;
            stretch = ranges.findIndex(r => w.start >= r.startMs && w.start <= r.endMs);
        }
        out.push({ word: { ...w, start: start + offsetMs, end: start + (w.end - w.start) + offsetMs }, stretch });
    }
    // In the order they are heard: by the stretch they play in, then by time. In the recording's order that is the
    // order they came in (within a transition's overlap the earlier part's words stay first); with moved sections
    // (spec 020 item E9) a later section's words can come first.
    return out.sort((a, b) => a.stretch - b.stretch || a.word.start - b.word.start).map(x => x.word);
}
