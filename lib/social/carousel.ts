// The story carousel (docs/specs/026-social-publishing.md, stage 4): up to 8 slides retelling the Short's moment, each a
// picture with a 5 to 15-word line and one phrase in gold, then the end slide pointing to soulwisdomcollective.com (9 in
// all). The pictures are frames from the episode's final cut within the Short's startMs–endMs (the rendered Short has
// captions burned in) and the episode's own b-roll. Claude writes the lines and picks a picture for each; the code keeps
// a slide only when its picture is real and unused, its line has 5 to 15 words and no limited words, anything in
// quotation marks is the speaker's own words, and its gold phrase is copied exactly from the line. Fewer than 4 slides:
// no carousel. A host's Short (Tom, 2026-11-23: not our picture on everything) uses at most 2 frames, the rest b-roll.
// Pure: the job and the tests share it.

import { z } from 'zod';
import { hasLimitedWords, limitedWordsRule } from './limitedWords';
import { isVerbatim } from './quote';

export const MAX_STORY_SLIDES = 8;        // + the end slide: 9, within Instagram's 10
export const MIN_STORY_SLIDES = 4;
export const MIN_LINE_WORDS = 5;
export const MAX_LINE_WORDS = 15;
export const GOLD_MIN = 2;
export const GOLD_MAX = 8;
export const CAROUSEL_FRAMES = 12;        // frames of the Short Claude looks at
export const CAROUSEL_BROLL = 6;          // the episode's b-roll pictures offered, nearest the Short first
export const HOST_FRAMES_MAX = 2;         // frames on a host's carousel
// Rough cost of one carousel (18 small pictures and the Short's words), reserved against the daily limit.
export const CAROUSEL_ESTIMATE_USD = 0.12;

// What Claude returns. No .min()/.max(): limits are applied after, in code.
export const SlidesSchema = z.object({
    slides: z.array(z.object({
        picture: z.string().describe('The id of the picture for this slide, as given (F1, B2…)'),
        line: z.string().describe('The line over the picture, 5 to 15 words'),
        gold: z.string().describe('The key phrase, 2 to 8 words copied exactly from the line'),
        centre: z.number().describe('For a frame (F…): where the main person\'s face is across it, 0 (left) to 1 (right); 0.5 for b-roll'),
    })),
});
export type RawSlides = z.infer<typeof SlidesSchema>;

export function carouselSystem(): string {
    return [
        'You turn a moment from Soul Wisdom, a spiritual podcast, into a swipeable Instagram and Facebook carousel. Some people would rather flip through pictures and read than watch. Each slide is a picture with one line over it; read in order, the lines retell the moment so it works without the video.',
        `Rules:
- ${MIN_STORY_SLIDES} to ${MAX_STORY_SLIDES} slides, in order. The first is the hook: who is speaking and the idea that makes someone swipe. Your last lands the insight. A final slide pointing to the full conversation is added after yours: don't write one.
- Each line is ${MIN_LINE_WORDS} to ${MAX_LINE_WORDS} words: one plain, vivid sentence read in two seconds. Retell the speaker's ideas in the third person, in your own words ("Jo Ann was sure she had nothing left to give."), and now and then a short quote of their exact words in double quotation marks ("It was all love," she remembers). Anything inside quotation marks must be their words exactly as given.
- Use only what is said in this moment. Add no facts, names, numbers or claims. Report beliefs and experiences as the speaker's ("she believes", "he felt"), never as proven fact.
- For each slide choose a picture by its id: F are frames of this moment of the video, B are pictures from the episode's b-roll. Use each picture once at most. Prefer frames where the speaker's face is clear and expressive, and b-roll that fits the line.
- For each line give its gold phrase: ${GOLD_MIN} to ${GOLD_MAX} words copied exactly, character for character, from the line: its most vivid or surprising part.
- No hashtags or emoji.`,
        limitedWordsRule(),
    ].join('\n\n');
}

export function carouselPrompt(o: { title: string; speaker: string; spoken: string; frames: number; broll: number; host: boolean }): string {
    const limit = o.host
        ? `\n\n${o.speaker} is one of the show's hosts: use at most ${HOST_FRAMES_MAX} frames (F) and b-roll (B) for the other slides.`
        : '';
    return `The Short is titled "${o.title}". The speaker is ${o.speaker}. Their words in it:\n\n${o.spoken}\n\n` +
        `Above are ${o.frames} frames (F1–F${o.frames})${o.broll ? ` and ${o.broll} b-roll pictures (B1–B${o.broll})` : ''}. Write the slides.${limit}`;
}

export interface Slide { picture: string; line: string; gold: string; centre: number }

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
// Text in straight or curly double quotation marks.
const quoted = (s: string) => [...s.matchAll(/["“]([^"”]+)["”]/g)].map(m => m[1]);

// Why a slide is dropped, or null to keep it.
export function slideProblem(s: { picture: string; line: string; gold: string }, o: { pictures: Set<string>; used: Set<string>; spoken: string }): string | null {
    if (!o.pictures.has(s.picture)) return `no picture ${s.picture}`;
    if (o.used.has(s.picture)) return `picture ${s.picture} used twice`;
    const n = countWords(s.line);
    if (n < MIN_LINE_WORDS || n > MAX_LINE_WORDS) return `${n} words`;
    if (hasLimitedWords(s.line)) return 'a limited word';
    if (quoted(s.line).some(q => !isVerbatim(q, o.spoken))) return 'a quote that is not the speaker\'s words';
    const g = countWords(s.gold);
    if (!s.gold || !s.line.includes(s.gold) || g < GOLD_MIN || g > GOLD_MAX) return 'its gold phrase is not copied exactly from the line';
    return null;
}

export type SlidesCheck = { ok: true; slides: Slide[]; dropped: string[] } | { ok: false; why: string; dropped: string[] };

// Claude's slides, checked: each kept only when it passes; a host's carousel keeps its first HOST_FRAMES_MAX frames.
export function checkSlides(raw: RawSlides, o: { frameIds: string[]; brollIds: string[]; spoken: string; host: boolean }): SlidesCheck {
    const pictures = new Set([...o.frameIds, ...o.brollIds]);
    const used = new Set<string>();
    const slides: Slide[] = [];
    const dropped: string[] = [];
    let frames = 0;
    for (const [i, r] of raw.slides.entries()) {
        const s = { picture: r.picture.trim().toUpperCase(), line: clean(r.line), gold: clean(r.gold) };
        let why = slideProblem(s, { pictures, used, spoken: o.spoken });
        const isFrame = o.frameIds.includes(s.picture);
        if (!why && o.host && isFrame && frames >= HOST_FRAMES_MAX) why = `more than ${HOST_FRAMES_MAX} frames of a host`;
        if (!why && slides.length >= MAX_STORY_SLIDES) why = `more than ${MAX_STORY_SLIDES} slides`;
        if (why) {
            dropped.push(`Slide ${i + 1}: ${why}`);
            continue;
        }
        used.add(s.picture);
        if (isFrame) frames++;
        const centre = Number.isFinite(r.centre) ? Math.min(1, Math.max(0, r.centre)) : 0.5;
        slides.push({ ...s, centre });
    }
    if (slides.length < MIN_STORY_SLIDES) return { ok: false, why: `only ${slides.length} slides passed the checks (at least ${MIN_STORY_SLIDES})`, dropped };
    return { ok: true, slides, dropped };
}

// Where the frames are taken: spread over the Short, away from its ends.
export function carouselFrameTimes(startMs: number, endMs: number, count = CAROUSEL_FRAMES): number[] {
    const span = Math.max(0, endMs - startMs);
    return Array.from({ length: count }, (_, i) => Math.round(startMs + span * (i + 1) / (count + 1)));
}
