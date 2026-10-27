// Why: Claude picks the highlight moments (docs/specs/021-motion-graphics.md, item M4), but everything
// that can be checked or decided by rule is checked and decided here, not by the model: every moment's
// words must be found word for word in the accepted transcript at its time (lib/showNotes.ts locate, as
// quotes and teasers are anchored), and the pacing — what is dropped, how far apart moments sit, which
// layouts repeat — is code with tests. The job (agent/src/podcast/highlights.ts) parses Claude's answer
// with MomentsSchema, verifies, paces, and merges the result into the edit; suggestions are marked
// `suggested: true` and replaced by the next run, while one a producer touched is never moved or removed.
// Browser-safe: no node imports.

import { z } from 'zod';
import { editedDuration, editedTime, keepRanges, type Cut } from './edit';
import { highlight, motionKeyIdea, type GraphicLayer, type HighlightLayer, type Layer } from './layers';
import { HIGHLIGHT_MAX_MS, HIGHLIGHT_MIN_MS, type HighlightLayout } from './reframe';
import { locate, type SpokenWord } from './showNotes';

// ─── what Claude answers (parsed, trimmed and capped before anything reads it) ─

// Not strict: a stray key in the model's JSON is stripped, never a reason to lose the run.
export const MomentSchema = z.object({
    kind: z.enum(['quote', 'word']),
    text: z.string().trim().min(1).max(500),
    emphasis: z.string().trim().max(80).default(''),
    speaker: z.string().trim().max(200).default(''),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    layout: z.string().trim().max(40).default(''),
    why: z.string().trim().max(300).default(''),
});
export const MomentsPayloadSchema = z.object({
    moments: z.array(MomentSchema).max(60).default([]),
    descriptors: z.array(z.object({
        speaker: z.string().trim().min(1).max(200),
        descriptor: z.string().trim().min(1).max(40),       // the spec's cap for a lower third's line
    })).max(12).default([]),
    keyIdeas: z.array(z.object({
        term: z.string().trim().min(1).max(80),
        definition: z.string().trim().min(1).max(200),      // one plain sentence, Claude's own words
        startMs: z.number().int().min(0),
    })).max(3).default([]),
});
export type Moment = z.infer<typeof MomentSchema>;
export type MomentsPayload = z.infer<typeof MomentsPayloadSchema>;

// The layouts each kind of moment may use (spec 021 Part B), first is the fallback; `iris` and `over`
// are the loudest, so they keep extra distance from each other.
export const QUOTE_LAYOUTS: HighlightLayout[] = ['splitQuote', 'below', 'iris', 'push'];
export const WORD_LAYOUTS: HighlightLayout[] = ['splitWord', 'over'];
export const LOUD_LAYOUTS: HighlightLayout[] = ['iris', 'over'];

// The density setting (Tom's D4): how often a highlight may appear, a ceiling, never a quota.
export const HIGHLIGHT_DENSITIES = ['off', 'light', 'normal', 'rich'] as const;
export type HighlightDensity = typeof HIGHLIGHT_DENSITIES[number];
export const DENSITY_MS: Record<Exclude<HighlightDensity, 'off'>, number> = {
    light: 180_000, normal: 90_000, rich: 60_000,
};
export const DENSITY_LABELS: Record<HighlightDensity, string> = {
    off: 'Off — no Suggest highlights',
    light: 'Light — at most about one every 3 minutes',
    normal: 'Normal — at most about one every 90 seconds (the default)',
    rich: 'Rich — at most about one a minute',
};
export const MIN_GAP_MS = 45_000;             // between any two highlights, on the edited clock
export const LOUD_GAP_MS = 2 * MIN_GAP_MS;    // between two loud ones
export const QUIET_START_MS = 30_000;         // the episode's first 30 s stay plain
// Snap: the move starts just before the first word and the out plays over what follows.
export const SNAP_LEAD_MS = 200;
export const SNAP_TAIL_MS = 600;
// How long each kind may run (spec 021 Part B), inside the layer's own limits.
const KIND_MS: Record<Moment['kind'], { min: number; max: number }> = {
    quote: { min: 3000, max: 12_000 },
    word: { min: HIGHLIGHT_MIN_MS, max: 4000 },
};

// ─── verification: the transcript is the authority ───────────────────────────

export interface VerifiedMoment {
    kind: Moment['kind'];
    text: string;                  // as the transcript says it
    emphasis: string;              // cleared when it is not inside the verified text
    speaker: string;               // the transcript's speaker
    startMs: number;               // the highlight's span: first word − 200 ms … last word + 600 ms,
    endMs: number;                 // clamped to the kind's length
    layout: string;                // Claude's wish, carried along; pacing may change it
}

// Every moment found word for word near its claimed time, snapped to its words; the texts that were
// not are returned for the record ("N not found word for word").
export function verifyMoments(moments: Moment[], words: SpokenWord[]): { verified: VerifiedMoment[]; unverified: string[] } {
    const verified: VerifiedMoment[] = [];
    const unverified: string[] = [];
    for (const m of moments) {
        const found = locate(m.text, words, m.startMs);
        if (!found) { unverified.push(m.text); continue; }
        const text = found.text ?? m.text;
        const span = KIND_MS[m.kind];
        const startMs = Math.max(0, found.startMs - SNAP_LEAD_MS);
        const endMs = Math.min(startMs + Math.min(span.max, HIGHLIGHT_MAX_MS),
            Math.max(startMs + Math.max(span.min, HIGHLIGHT_MIN_MS), found.endMs + SNAP_TAIL_MS));
        verified.push({
            kind: m.kind, text, speaker: found.speaker || m.speaker,
            emphasis: m.emphasis && text.toLowerCase().includes(m.emphasis.toLowerCase()) ? m.emphasis : '',
            startMs, endMs, layout: m.layout,
        });
    }
    return { verified, unverified };
}

// ─── pacing: rules, not taste ────────────────────────────────────────────────

export interface PaceOptions {
    cuts: Cut[];
    teasers: { startMs: number; endMs: number }[];
    durationMs: number;                                   // the recording's length
    density: Exclude<HighlightDensity, 'off'>;
    // The approved notes' key quotes: a moment on one of them wins when two sit too close.
    keyQuotes?: { startMs: number; endMs: number }[];
    // The Studio settings' allowed layouts (item M5); a kind whose layouts are all off falls back to
    // its own full set, so the allowlist can never silence a kind entirely.
    allowed?: readonly HighlightLayout[];
}

export interface PacedDrop { text: string; why: string }

// The moments that survive the rules, as suggested highlight layers in time order; the rest with why.
// Dropped: on cut words (the whole span must be kept), on a teaser, in the episode's first 30 s, or in
// crosstalk (two speakers inside the span). Kept at least 45 s apart on the edited clock and within the
// density ceiling (key-quote moments win ties); never the same layout twice in a row, and the loud
// layouts (iris, over) at least 90 s apart — a loud one too close plays as its kind's quiet layout.
export function paceMoments(moments: VerifiedMoment[], words: SpokenWord[], o: PaceOptions): { kept: HighlightLayer[]; dropped: PacedDrop[] } {
    const ranges = keepRanges(o.durationMs, o.cuts);
    const dropped: PacedDrop[] = [];
    const onKeyQuote = (m: VerifiedMoment) =>
        (o.keyQuotes ?? []).some(q => m.startMs < q.endMs && m.endMs > q.startMs);

    // Each moment judged on its own, with its place on the edited clock.
    type Candidate = VerifiedMoment & { at: number; quote: boolean };
    const candidates: Candidate[] = [];
    for (const m of moments) {
        const range = ranges.find(r => m.startMs >= r.startMs && m.startMs < r.endMs);
        if (!range || m.endMs > range.endMs) { dropped.push({ text: m.text, why: 'its words are cut' }); continue; }
        if (o.teasers.some(t => m.startMs < t.endMs && m.endMs > t.startMs)) { dropped.push({ text: m.text, why: 'it sits on a teaser' }); continue; }
        const at = editedTime(m.startMs, ranges);
        if (at === null) { dropped.push({ text: m.text, why: 'its words are cut' }); continue; }
        if (at < QUIET_START_MS) { dropped.push({ text: m.text, why: 'inside the episode\'s first 30 s' }); continue; }
        const speakers = new Set(words.filter(w => w.start < m.endMs && w.end > m.startMs).map(w => w.speaker).filter(Boolean));
        if (speakers.size > 1) { dropped.push({ text: m.text, why: 'two people speak there' }); continue; }
        candidates.push({ ...m, at, quote: onKeyQuote(m) });
    }
    candidates.sort((a, b) => a.at - b.at);

    // At least 45 s apart: when two crowd each other, the one on a key quote stays.
    const spaced: Candidate[] = [];
    for (const c of candidates) {
        const last = spaced[spaced.length - 1];
        if (last && c.at - last.at < MIN_GAP_MS) {
            if (c.quote && !last.quote) { dropped.push({ text: last.text, why: 'too close to the next moment' }); spaced[spaced.length - 1] = c; }
            else dropped.push({ text: c.text, why: 'too close to the one before' });
            continue;
        }
        spaced.push(c);
    }

    // The density ceiling: thin the most crowded spots first, keeping key-quote moments.
    const ceiling = Math.max(1, Math.round(editedDuration(ranges) / DENSITY_MS[o.density]));
    while (spaced.length > ceiling) {
        let drop = -1, closest = Infinity;
        for (const [i, c] of spaced.entries()) {
            if (c.quote && spaced.some(x => !x.quote)) continue;
            const gap = Math.min(
                i > 0 ? c.at - spaced[i - 1].at : Infinity,
                i < spaced.length - 1 ? spaced[i + 1].at - c.at : Infinity,
            );
            if (gap < closest) { closest = gap; drop = i; }
        }
        if (drop < 0) break;
        dropped.push({ text: spaced[drop].text, why: 'more than the density setting allows' });
        spaced.splice(drop, 1);
    }

    // Layouts: Claude's wish when it suits the kind and the settings allow it, never twice in a row,
    // the loud ones kept apart.
    const kept: HighlightLayer[] = [];
    let prevLayout: HighlightLayout | null = null;
    let lastLoudAt = -Infinity;
    const layoutsFor = (kind: VerifiedMoment['kind']) => {
        const all = kind === 'quote' ? QUOTE_LAYOUTS : WORD_LAYOUTS;
        const chosen = o.allowed ? all.filter(l => o.allowed!.includes(l)) : all;
        return chosen.length ? chosen : all;
    };
    for (const c of spaced) {
        const allowed = layoutsFor(c.kind);
        let layout = (allowed as string[]).includes(c.layout) ? c.layout as HighlightLayout : allowed[0];
        const quiet = allowed.filter(l => !LOUD_LAYOUTS.includes(l) && l !== prevLayout);
        if (LOUD_LAYOUTS.includes(layout) && c.at - lastLoudAt < LOUD_GAP_MS) layout = quiet[0] ?? allowed[0];
        if (layout === prevLayout) layout = allowed.find(l => l !== prevLayout && (!LOUD_LAYOUTS.includes(l) || c.at - lastLoudAt >= LOUD_GAP_MS)) ?? layout;
        if (LOUD_LAYOUTS.includes(layout)) lastLoudAt = c.at;
        prevLayout = layout;
        const h = highlight(c.startMs, layout, c.text, c.emphasis, c.speaker, c.endMs - c.startMs);
        kept.push({ ...h, suggested: true });
    }
    return { kept, dropped };
}

// ─── merging into the edit ───────────────────────────────────────────────────

// Fresh suggestions replace the ones still marked `suggested: true`; a highlight the producer touched
// (the editor clears the mark on any change) is never moved or removed, and a fresh suggestion that
// would overlap it is left out.
export function mergeSuggested(layers: Layer[], fresh: HighlightLayer[]): Layer[] {
    const kept = layers.filter(l => l.kind !== 'highlight' || !l.suggested);
    const theirs = kept.filter((l): l is HighlightLayer => l.kind === 'highlight');
    const fits = (h: HighlightLayer) => !theirs.some(t =>
        h.anchor.srcMs < t.anchor.srcMs + t.durationMs && h.anchor.srcMs + h.durationMs > t.anchor.srcMs);
    return [...kept, ...fresh.filter(fits)];
}

// Descriptors go only where there is nothing yet: a guest lower third whose descriptor line is empty
// and whose name matches. The producer's words are never overwritten.
export function fillDescriptors(layers: Layer[], descriptors: { speaker: string; descriptor: string }[]): Layer[] {
    if (!descriptors.length) return layers;
    const byName = new Map(descriptors.map(d => [d.speaker.trim().toLowerCase(), d.descriptor]));
    return layers.map(l => {
        if (l.kind !== 'graphic' || l.template !== 'lowerThird' || l.fields.variant !== 'guest' || l.fields.descriptor) return l;
        const d = byName.get(l.fields.name.trim().toLowerCase());
        return d ? { ...l, fields: { ...l.fields, descriptor: d } } : l;
    });
}

// Key ideas become keyIdea graphics at their moment (the editor marks their definitions as Claude's
// words to check), at most three, never doubling a term already placed.
export function keyIdeaAdditions(layers: Layer[], ideas: MomentsPayload['keyIdeas']): GraphicLayer[] {
    const placed = new Set(layers.flatMap(l => (l.kind === 'graphic' && l.template === 'keyIdea' ? [l.fields.term.trim().toLowerCase()] : [])));
    return ideas.filter(i => !placed.has(i.term.trim().toLowerCase())).slice(0, 3)
        .map(i => motionKeyIdea(i.startMs, i.term, i.definition));
}

// How many of the edit's highlights are still suggestions — the editor's count and Clear button.
export const suggestedCount = (layers: Layer[]) =>
    layers.filter(l => l.kind === 'highlight' && l.suggested).length;

// A suggestion stays a suggestion only until the producer touches it: any change to a suggested
// highlight (a drag, a trim, new words in Properties) drops the mark, so the next run never moves or
// replaces it. The editor runs every layers update through this.
export function touchSuggested(before: Layer[], after: Layer[]): Layer[] {
    const prev = new Map(before.map(l => [l.id, l]));
    const bare = (l: HighlightLayer) => { const c = { ...l }; delete c.suggested; return c; };
    return after.map(l => {
        if (l.kind !== 'highlight' || !l.suggested) return l;
        const was = prev.get(l.id);
        if (!was || was.kind !== 'highlight') return l;
        return JSON.stringify(bare(l)) === JSON.stringify(bare(was)) ? l : bare(l);
    });
}

// Everything a run adds to the edit's layers, in one place (the job writes this in a transaction):
// the paced highlights merged in, descriptors onto empty guest lower thirds, key ideas as graphics.
export function applySuggestions(layers: Layer[], r: {
    highlights: HighlightLayer[]; descriptors: MomentsPayload['descriptors']; keyIdeas: MomentsPayload['keyIdeas'];
}): { layers: Layer[]; suggested: number; descriptorsFilled: number; keyIdeasAdded: number } {
    const merged = mergeSuggested(layers, r.highlights);
    const filled = fillDescriptors(merged, r.descriptors);
    const descriptorsFilled = filled.filter((l, i) => l !== merged[i]).length;
    const ideas = keyIdeaAdditions(filled, r.keyIdeas);
    return { layers: [...filled, ...ideas], suggested: suggestedCount(filled), descriptorsFilled, keyIdeasAdded: ideas.length };
}

// ─── what the job says to Claude (the prompts live here so they are testable and read beside the
//     rules that check the answer) ──────────────────────────────────────────────────────────────

export function highlightsSystemPrompt(producer = ''): string {
    return [
        'You read a podcast transcript and pick the moments worth stressing on screen: for a few seconds the ' +
        'speaker\'s picture is reframed and the words they are saying appear beside or over them. Pick two kinds:',
        '- quote: one or two sentences worth reading as they are heard — an insight, a turn of phrase, a line that lands. ' +
        'Said by one person, three to twelve seconds.',
        '- word: one stressed word or a very short phrase (at most four words) that carries a sentence — give the full ' +
        'sentence as `text` and the stressed word in `emphasis` (it must appear inside `text`).',
        'Rules: `text` must be the transcript\'s words exactly, word for word, from one speaker. `startMs` and `endMs` are ' +
        'the moment\'s place, taken from the line numbers shown (each line starts with its time in milliseconds). ' +
        'Spread the moments across the whole conversation; nothing from its first half-minute. Fewer is better than ' +
        'forced: pick only what genuinely deserves the screen. When a passage you would pick matches one of the listed ' +
        'key quotes, prefer it word for word.',
        'For each moment, suggest a `layout`: for quotes, splitQuote (picture slides left, quote builds beside it), ' +
        'below (picture lifts, the line sits under it like a caption), iris (a gold oval closes on the speaker and the ' +
        'quote fills the sky), push (the picture is pushed aside by a panel saying WORTH REPEATING); for words, ' +
        'splitWord (the stressed word huge beside the picture) or over (the words pop over the dimmed picture). ' +
        'The edit may change your layout to keep variety.',
        'Also give: `descriptors` — for each guest (never a host), one line of at most forty characters for their lower ' +
        'third, drawn only from what is actually said about them (for example "Author · Researcher"); and `keyIdeas` — ' +
        'at most three terms the conversation names and explains, each with a one-sentence plain definition in your own ' +
        'words (they will be checked by a person before publishing).',
        producer ? `The producer says: ${producer}` : '',
    ].filter(Boolean).join('\n');
}

export function highlightsUserMessage(lines: { name: string; words: { text: string; start: number }[] }[], keyQuotes: string[], maxMoments: number): string {
    const transcript = `<transcript>\n${lines.map(l => `${l.words[0]?.start ?? 0}\t${l.name}: ${l.words.map(w => w.text).join(' ')}`).join('\n')}\n</transcript>`;
    const quotes = keyQuotes.length ? `\n\n<key_quotes>\n${keyQuotes.join('\n')}\n</key_quotes>` : '';
    return `${transcript}${quotes}\n\nPick at most ${maxMoments} moments, with the descriptors and key ideas.`;
}
