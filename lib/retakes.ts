// Part I: retakes, widened into "Suggest a tighter edit" (docs/specs/019-editor-light-v2.md, item 1.3).
// Claude reads the accepted transcript and finds what a word list cannot: abandoned attempts said
// again, false starts, restarts, verbal tics such as "you know", housekeeping ("can you hear me?")
// and tangents. Each becomes a suggested cut (reason 'retake') the producer reviews in the editor
// like any other suggestion, with its kind and Claude's few words on why. Nothing that touches an
// approved key quote or teaser clip is suggested.
// The prompt's list of verbal tics and its "be conservative" rule start from CutScript's
// detect_filler_words (MIT, docs/licences/cutscript.md).

import { z } from 'zod';
import type { Cut } from './edit';

export interface RetakeLine { name: string; words: { text: string; start: number; end: number }[] }

export const TIGHTEN_KINDS = ['retake', 'false-start', 'restart', 'verbal-tic', 'housekeeping', 'tangent'] as const;
export type TightenKind = typeof TIGHTEN_KINDS[number];

export const KIND_LABELS: Record<TightenKind, string> = {
    'retake': 'Retake', 'false-start': 'False start', 'restart': 'Restart',
    'verbal-tic': 'Verbal tic', 'housekeeping': 'Housekeeping', 'tangent': 'Tangent',
};

export const RetakesSchema = z.object({
    retakes: z.array(z.object({
        line: z.number().int(),          // the transcript line the words are on
        kind: z.enum(TIGHTEN_KINDS),
        text: z.string(),                // the words to remove, copied exactly from that line
        why: z.string(),                 // a few words for the producer
    })),
});
export type RetakesAnswer = z.infer<typeof RetakesSchema>;

// A suggestion as the editor shows it: the cut, its kind and Claude's few words on why. Retakes
// found before item 1.3 have no kind.
export interface Retake { startMs: number; endMs: number; why: string; kind?: TightenKind }

// A stretch of the episode that must stay whole: an approved key quote or teaser clip.
export interface Span { startMs: number; endMs: number }

// Instructions for a tighter edit. `producer` is the Studio settings' extra instructions, already
// worded (lib/studioSettings.ts, producerInstructions).
export function retakesSystemPrompt(producer = ''): string {
    return [
        'You help edit a recorded conversation into a tighter one, as a careful human editor would. Find the words that can go ' +
        'without changing what anyone meant, and give each one a kind:',
        '- retake: a speaker stops partway and says the same thing again, or says they will say something again. Remove the ' +
        'abandoned attempt, so the better, final attempt is what remains.',
        '- false-start: a sentence begun and dropped for a different one ("I went — we drove there"). Remove the dropped beginning.',
        '- restart: a speaker asks to go again ("let me say that again", "can I start over?"). Remove the request and the attempt it replaces.',
        '- verbal-tic: "you know", "I mean", "like", "sort of", "kind of", "basically", "actually", "literally", "right?", or "so" or ' +
        '"well" opening a sentence, only where it adds nothing and the sentence reads cleanly without it.',
        '- housekeeping: talk about the recording itself ("can you hear me?", "is this on?", "we\'ll edit that out", "sorry, my dog").',
        '- tangent: a passage that leaves the conversation and comes back with nothing the episode needs. Only when it is clearly ' +
        'off the subject; never part of a story, an answer or an example.',
        'Copy the words to remove exactly from one transcript line. When they run over several lines, give one item per line. ' +
        'Say why in a few words. Leave alone repetition used for emphasis, single doubled words and filler words such as um and ' +
        'uh (they are handled elsewhere). Never suggest anything on the protected lines: they hold key quotes and teaser clips ' +
        'that are already chosen. Be conservative: when unsure, leave it out; a missed suggestion costs less than a cut sentence.',
    ].join('\n') + producer;
}

// The transcript as numbered lines, one per speaker turn, and the lines that must stay whole.
export function retakesUserMessage(lines: RetakeLine[], protectedLines: number[] = []): string {
    const transcript = `<transcript>\n${lines.map((l, i) => `${i}\t${l.name}: ${l.words.map(w => w.text).join(' ')}`).join('\n')}\n</transcript>`;
    const guard = protectedLines.length ? `\n\n<protected_lines>${protectedLines.join(', ')}</protected_lines>` : '';
    return `${transcript}${guard}\n\nList what can be cut for a tighter edit.`;
}

// The approved key quotes and teaser clips, as the stretches a suggestion must not touch.
export function protectedSpans(notes: { quotes?: Span[]; teaserClips?: Span[] } | undefined): Span[] {
    return [...notes?.quotes ?? [], ...notes?.teaserClips ?? []]
        .map(c => ({ startMs: c.startMs, endMs: Math.max(c.startMs, c.endMs) }));
}

const overlaps = (a: Span, b: Span) => a.startMs <= b.endMs && b.startMs <= a.endMs;

// The lines with any word inside a protected stretch.
export function protectedLines(lines: RetakeLine[], spans: Span[]): number[] {
    if (!spans.length) return [];
    return lines.flatMap((l, i) => l.words.some(w => spans.some(s => overlaps({ startMs: w.start, endMs: w.end }, s))) ? [i] : []);
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');

// Finds `text` as consecutive words of the line (ignoring case and punctuation): their first and last index, or null.
export function findWords(words: { text: string }[], text: string): [number, number] | null {
    const want = text.split(/\s+/).map(norm).filter(Boolean);
    if (!want.length) return null;
    const have = words.map(w => norm(w.text));
    for (let i = 0; i + want.length <= have.length; i++) {
        let k = 0;
        while (k < want.length && have[i + k] === want[k]) k++;
        if (k === want.length) return [i, i + want.length - 1];
    }
    return null;
}

// Claude's answer as timed suggestions: each found on its line, from its first word's start to its
// last word's end. Ones not found word for word are counted and left out, and so are ones touching
// a protected stretch.
export function timeRetakes(lines: RetakeLine[], answer: RetakesAnswer, spans: Span[] = []):
    { retakes: Retake[]; notFound: number; protectedCount: number } {
    const retakes: Retake[] = [];
    let notFound = 0, protectedCount = 0;
    for (const r of answer.retakes) {
        const line = lines[r.line];
        const span = line ? findWords(line.words, r.text) : null;
        if (!line || !span) { notFound++; continue; }
        const found = { startMs: line.words[span[0]].start, endMs: line.words[span[1]].end };
        if (spans.some(s => overlaps(found, s))) { protectedCount++; continue; }
        retakes.push({ ...found, kind: r.kind, why: r.why.trim().slice(0, 200) });
    }
    retakes.sort((a, b) => a.startMs - b.startMs);
    return { retakes, notFound, protectedCount };
}

// "3 retakes, 1 false start": what was found, by kind.
export function kindCounts(retakes: Retake[]): string {
    const counts = new Map<string, number>();
    for (const r of retakes) {
        const label = KIND_LABELS[r.kind ?? 'retake'].toLowerCase();
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, n]) => `${n} ${n === 1 || label === 'housekeeping' ? label : `${label}s`}`).join(', ');
}

// The note the editor shows beside a suggestion, by `${startMs}-${endMs}`: "False start: changed tack".
export function retakeNotes(retakes: Retake[]): Record<string, string> {
    return Object.fromEntries(retakes.map(r => [`${r.startMs}-${r.endMs}`, `${KIND_LABELS[r.kind ?? 'retake']}: ${r.why}`]));
}

// Adds the suggestions to the edit's cuts, skipping any already there. The cut reason stays 'retake'.
export function addRetakes(cuts: Cut[], retakes: Retake[]): Cut[] {
    const have = new Set(cuts.map(c => `${c.startMs}-${c.endMs}`));
    const added = retakes.filter(r => !have.has(`${r.startMs}-${r.endMs}`)).map(r => ({ startMs: r.startMs, endMs: r.endMs, reason: 'retake' as const }));
    return [...cuts, ...added];
}
