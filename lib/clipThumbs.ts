// The "Soul Wisdom Clips" thumbnail's moment (docs/specs/025-clips.md, step 4): the main speaker's most
// expressive face inside a clip, fitting its title. Shared by the job (which finds candidates, has Claude look
// at them and cuts the speaker out) and the server and Studio (which show what was found). Nothing here
// touches ffmpeg, Storage or Claude: the cues, the ranking and the geometry are plain functions.

import { z } from 'zod';
import type { TimedWord } from './retime';

export const MOMENT_CANDIDATES = 24;     // frames Claude looks at, at most
const CANDIDATE_GAP_MS = 10_000;         // candidates at least this far apart
const EDGE_MS = 5_000;                   // none in a clip's first or last five seconds (the fades)
export const MOMENT_GAP_MS = 20_000;     // the moments kept at least this far apart
export const CUE_DELAY_MS = 300;         // a face reacts a moment after the sound that marks it
const LOUD_LU = 4;                       // a loud moment: this far above the speaker's median in the clip
export const MIN_CUTOUT_HEIGHT = 600;    // a smaller cut-out would be soft at thumbnail size
// Small frames for Claude to look at; the kept ones are grabbed again at full size.
export const LOOK_WIDTH = 640;
export const LOOK_HEIGHT = 360;

// A stretch of one person speaking, on the final cut.
export interface Turn { speaker: string; startMs: number; endMs: number }

// The reviewed transcript's lines (original times) as turns on the final cut, through the final cut's time map.
export function turnsOnFinal(lines: { name: string; start: number; end: number }[], at: (originalMs: number) => number): Turn[] {
    return lines
        .filter(l => l.name?.trim() && l.end > l.start)
        .map(l => ({ speaker: l.name.trim(), startMs: at(l.start), endMs: at(l.end) }))
        .filter(t => t.endMs > t.startMs)
        .sort((a, b) => a.startMs - b.startMs);
}

// How long each person speaks inside a stretch, most first.
export function speakersIn(turns: Turn[], startMs: number, endMs: number): { speaker: string; ms: number }[] {
    const by = new Map<string, number>();
    for (const t of turns) {
        const ms = Math.min(t.endMs, endMs) - Math.max(t.startMs, startMs);
        if (ms > 0) by.set(t.speaker, (by.get(t.speaker) ?? 0) + ms);
    }
    return [...by].map(([speaker, ms]) => ({ speaker, ms })).sort((a, b) => b.ms - a.ms || a.speaker.localeCompare(b.speaker));
}

export const mainSpeaker = (turns: Turn[], startMs: number, endMs: number) => speakersIn(turns, startMs, endMs)[0]?.speaker ?? null;

// ffmpeg's ebur128 filter, with its frame log on, prints a line every 100 ms: "... t: 12.3  TARGET:-23 LUFS  M: -21.4 S: ...".
export function parseMomentary(log: string): { ms: number; lufs: number }[] {
    const out: { ms: number; lufs: number }[] = [];
    for (const m of log.matchAll(/\bt:\s*([\d.]+)\s+.*?\bM:\s*(-?[\d.]+|-inf)/g)) {
        const lufs = m[2] === '-inf' ? -Infinity : parseFloat(m[2]);
        if (Number.isFinite(lufs)) out.push({ ms: Math.round(parseFloat(m[1]) * 1000), lufs });
    }
    return out;
}

const inTurn = (turns: Turn[], ms: number) => turns.some(t => ms >= t.startMs && ms < t.endMs);
function median(xs: number[]) {
    if (!xs.length) return -Infinity;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// The loudest moments in the speaker's own turns, at least LOUD_LU over their median there, peaks first.
// `series` times are on the final cut.
export function loudMoments(series: { ms: number; lufs: number }[], turns: Turn[], startMs: number, endMs: number): number[] {
    const theirs = series.filter(p => p.ms >= startMs && p.ms < endMs && inTurn(turns, p.ms));
    const floor = median(theirs.map(p => p.lufs)) + LOUD_LU;
    return theirs
        .filter((p, i) => p.lufs >= floor && p.lufs >= (theirs[i - 1]?.lufs ?? -Infinity) && p.lufs >= (theirs[i + 1]?.lufs ?? -Infinity))
        .sort((a, b) => b.lufs - a.lufs || a.ms - b.ms)
        .map(p => p.ms);
}

const REACTIONS = /^(wow|whoa|woah|amazing|incredible|unbelievable|beautiful|exactly|absolutely|yes|oh|omg)$/i;
const LAUGHTER = /\b(laugh(s|ing|ter)?|haha+|hahaha)\b/i;
const STOP = new Set(['about', 'after', 'again', 'their', 'there', 'these', 'those', 'which', 'would', 'could', 'should', 'what', 'when', 'where', 'with', 'your', 'this', 'that', 'from', 'have', 'into', 'than', 'then', 'they', 'were', 'will']);
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, '');

export type Cue = 'loud' | 'laughter' | 'exclamation' | 'reaction' | 'quote' | 'title' | 'question' | 'spaced';

// The words that point to an expressive face, by kind, strongest first: laughter, exclamations and short
// reactions, then the title's own words, then the end of a question.
export function wordCues(words: TimedWord[], startMs: number, endMs: number, thumbText: string): { ms: number; cue: Cue }[] {
    const titleWords = new Set(thumbText.replace(/\*/g, '').split(/\s+/).map(plain).filter(t => t.length >= 4 && !STOP.has(t)));
    const out: { ms: number; cue: Cue }[] = [];
    for (const w of words) {
        if (w.start < startMs || w.start >= endMs) continue;
        const text = w.text.trim();
        if (LAUGHTER.test(text)) out.push({ ms: w.start, cue: 'laughter' });
        else if (/!["”’)]*$/.test(text)) out.push({ ms: w.start, cue: 'exclamation' });
        else if (REACTIONS.test(plain(text))) out.push({ ms: w.start, cue: 'reaction' });
        else if (titleWords.has(plain(text))) out.push({ ms: w.start, cue: 'title' });
        else if (/\?["”’)]*$/.test(text)) out.push({ ms: w.start, cue: 'question' });
    }
    const rank: Cue[] = ['laughter', 'exclamation', 'reaction', 'title', 'question'];
    return out.sort((a, b) => rank.indexOf(a.cue) - rank.indexOf(b.cue) || a.ms - b.ms);
}

// The frames to look at: the cues in order (loud moments, then the words' cues and the key quotes), each a
// moment after its cue, inside the speaker's own turns, never at the clip's ends, spaced apart; then evenly
// spaced moments in their turns to make up the number.
export function candidateMoments(o: {
    startMs: number; endMs: number; turns: Turn[]; loud: number[]; cues: { ms: number; cue: Cue }[]; quotes: number[]; max?: number;
}): { ms: number; cue: Cue }[] {
    const max = o.max ?? MOMENT_CANDIDATES;
    const from = o.startMs + EDGE_MS, to = o.endMs - EDGE_MS;
    const kept: { ms: number; cue: Cue }[] = [];
    const offer = (ms: number, cue: Cue) => {
        if (kept.length >= max || ms < from || ms > to || !inTurn(o.turns, ms)) return;
        if (kept.some(k => Math.abs(k.ms - ms) < CANDIDATE_GAP_MS)) return;
        kept.push({ ms: Math.round(ms), cue });
    };
    for (const ms of o.loud) offer(ms + CUE_DELAY_MS, 'loud');
    const words = o.cues.filter(c => c.cue !== 'title' && c.cue !== 'question');
    for (const c of words) offer(c.ms + CUE_DELAY_MS, c.cue);
    for (const ms of o.quotes) offer(ms + 2000, 'quote');      // a couple of seconds into a key quote
    for (const c of o.cues.filter(c => c.cue === 'title' || c.cue === 'question')) offer(c.ms + CUE_DELAY_MS, c.cue);
    // Make up the number with moments spread through their turns.
    const theirs = o.turns.filter(t => t.endMs > from && t.startMs < to);
    const spoken = theirs.reduce((n, t) => n + Math.min(t.endMs, to) - Math.max(t.startMs, from), 0);
    const step = spoken / (max + 1);
    for (let k = 1; k <= max && kept.length < max && spoken > 0; k++) {
        // The k-th point of the speaker's own time in the clip, found in the turn it falls in.
        let rest = k * step;
        for (const t of theirs) {
            const a = Math.max(t.startMs, from), b = Math.min(t.endMs, to);
            if (rest <= b - a) {
                offer(a + rest, 'spaced');
                break;
            }
            rest -= b - a;
        }
    }
    return kept.sort((a, b) => a.ms - b.ms);
}

// What Claude returns for each frame it looks at. Positions are shares of the frame's width and height.
// No .min()/.max(): Claude's output format does not take them; the job checks.
export const MomentLookSchema = z.object({
    frames: z.array(z.object({
        frame: z.number().int().describe('The number of the frame, as given'),
        usable: z.boolean().describe('False if the main speaker\'s eyes are closed, their mouth is blurred or caught mid-word, a hand covers the face, ' +
            'it is the wrong person, or a screen share or b-roll covers the picture'),
        expression: z.number().int().describe('1 to 10: how strong and readable the main speaker\'s expression is at thumbnail size'),
        fit: z.number().int().describe('1 to 10: how well that expression fits the clip\'s title and feeling'),
        emotion: z.string().describe('One word for the expression, e.g. surprise, delight, wonder, conviction'),
        left: z.number().describe('Left edge of the main speaker (head and shoulders, as much of them as shows), 0 to 1 of the frame\'s width'),
        top: z.number().describe('Top edge of the main speaker, 0 to 1 of the frame\'s height'),
        right: z.number().describe('Right edge of the main speaker, 0 to 1 of the frame\'s width'),
        bottom: z.number().describe('Bottom edge of the main speaker, 0 to 1 of the frame\'s height'),
        facing: z.enum(['left', 'right', 'camera']).describe('Which way the main speaker faces, as seen in the picture'),
    })),
});
export type MomentLook = z.infer<typeof MomentLookSchema>['frames'][number];

export function lookInstructions(o: { title: string; thumbText: string; feeling: string[]; speaker: string; count: number }) {
    const feeling = o.feeling.length ? o.feeling.join(' or ') : 'whatever fits the title';
    return `These ${o.count} numbered frames are from a clip titled "${o.title || o.thumbText.replace(/\*/g, '')}". Its thumbnail will read ` +
        `"${o.thumbText.replace(/\*/g, '')}" beside ${o.speaker}, cut out of one of these frames, and should show ${feeling}. ` +
        `For every frame, judge ${o.speaker}'s face: is it usable, how strong is the expression, how well does it fit, and where ` +
        `is ${o.speaker} in the frame. If the frame shows several people side by side, the main speaker is ${o.speaker}; when ` +
        'you cannot tell which one that is, mark the frame not usable.';
}

// A look as Claude gave it, made safe: scores 1 to 10, the box inside the frame, the emotion one short word.
export function cleanLook(l: MomentLook): MomentLook {
    const c = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
    const [left, right] = [c(l.left), c(l.right)].sort((a, b) => a - b);
    const [top, bottom] = [c(l.top), c(l.bottom)].sort((a, b) => a - b);
    return {
        ...l, left, right, top, bottom,
        usable: l.usable && right - left > 0.05 && bottom - top > 0.1,
        expression: Math.min(10, Math.max(1, Math.round(l.expression))),
        fit: Math.min(10, Math.max(1, Math.round(l.fit))),
        emotion: l.emotion.replace(/[^\p{L} -]/gu, '').trim().slice(0, 24).toLowerCase() || 'expression',
    };
}

// The usable frames best first: by fit, then expression, then the louder cue; kept MOMENT_GAP_MS apart.
// Returns them all in order, so a frame whose cut-out fails can be replaced by the next.
export function rankMoments<T extends { ms: number; look: MomentLook }>(frames: T[]): T[] {
    const order = frames.filter(f => f.look.usable)
        .sort((a, b) => b.look.fit - a.look.fit || b.look.expression - a.look.expression || a.ms - b.ms);
    const kept: T[] = [];
    for (const f of order) if (!kept.some(k => Math.abs(k.ms - f.ms) < MOMENT_GAP_MS)) kept.push(f);
    return kept;
}

// The crop around the speaker, in pixels of a `width` x `height` frame: their box with a margin of a fifth of its
// size each side (half above, for the hair), kept inside the frame, even-sized for ffmpeg.
export function cropBox(look: Pick<MomentLook, 'left' | 'top' | 'right' | 'bottom'>, width: number, height: number) {
    const w = (look.right - look.left) * width, h = (look.bottom - look.top) * height;
    const x0 = Math.max(0, look.left * width - w * 0.2), x1 = Math.min(width, look.right * width + w * 0.2);
    const y0 = Math.max(0, look.top * height - h * 0.3), y1 = Math.min(height, look.bottom * height + h * 0.2);
    const even = (n: number) => Math.max(0, Math.floor(n / 2) * 2);
    const x = even(x0), y = even(y0);
    return { x, y, w: Math.max(2, even(x1 - x)), h: Math.max(2, even(y1 - y)) };
}

// Where the speaker stands on the thumbnail, so they face the title: facing left, they stand on the right;
// facing right, on the left; facing the camera, on the right. Never mirrored.
export const standOn = (facing: MomentLook['facing']): 'left' | 'right' => (facing === 'right' ? 'left' : 'right');

// A moment found for the thumbnail, as stored on the clip.
export const ClipMomentSchema = z.object({
    atMs: z.number().int().min(0),
    framePath: z.string(),
    cutoutPath: z.string().nullable(),
    emotion: z.string().max(24),
    expression: z.number().int().min(1).max(10),
    fit: z.number().int().min(1).max(10),
    side: z.enum(['left', 'right']),
    cue: z.string(),
    chosenByHand: z.boolean().optional(),
});
export type ClipMoment = z.infer<typeof ClipMomentSchema>;

// What the moments were found for. They are current while all of this still matches.
export interface MomentInputs { startMs: number; endMs: number; thumbText: string; feeling: string[]; speaker: string | null; finalAt: number }
export const momentInputs = (i: { startMs: number; endMs: number; thumbText: string; thumbFeeling: string[]; thumbSpeaker: string | null }, finalAt: number): MomentInputs =>
    ({ startMs: i.startMs, endMs: i.endMs, thumbText: i.thumbText.trim(), feeling: [...i.thumbFeeling].sort(), speaker: i.thumbSpeaker, finalAt });
export const sameMoments = (a: MomentInputs | null | undefined, b: MomentInputs) =>
    !!a && a.startMs === b.startMs && a.endMs === b.endMs && a.thumbText === b.thumbText && a.finalAt === b.finalAt &&
    a.speaker === b.speaker && a.feeling.join() === b.feeling.join();
