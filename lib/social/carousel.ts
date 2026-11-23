// The carousel (docs/specs/026-social-publishing.md, stage 4): up to 8 slides about the Short's moment, each a picture
// with a 5 to 15-word line and one phrase in gold, then the end slide pointing to soulwisdomcollective.com (9 in all).
// Two kinds (Tom, 2026-11-23: "SWC doesn't always have a story to tell. Sometimes it's just two guys talking about a
// philosophy"), chosen by Claude for each Short and checked in code:
//   idea   the usual one: the idea the Short is about, unpacked. A hook (often a question), the idea as the speakers
//          explain it in plain words with short exact quotes, credited, then a question for the reader to sit with,
//          drawn on the plain brand background. A host's Short is always an idea.
//   story  a guest telling something that happened to them: the moment retold in order, as before.
// The pictures are frames from the episode's final cut within the Short's startMs–endMs (the rendered Short has
// captions burned in) and the episode's own b-roll. The code keeps a slide only when its picture is real and unused,
// its line has 5 to 15 words and no limited words, anything in quotation marks is the speaker's own words, and its gold
// phrase is copied exactly from the line; an idea carousel must end on its question for the reader. Fewer than 4 slides:
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

export const CAROUSEL_MODES = ['idea', 'story'] as const;
export type CarouselMode = (typeof CAROUSEL_MODES)[number];
// The question slide's picture: none, the plain brand background.
export const NO_PICTURE = 'NONE';

// What Claude returns. No .min()/.max(): limits are applied after, in code.
export const SlidesSchema = z.object({
    mode: z.enum(CAROUSEL_MODES).describe('"story" only when a guest tells something that happened to them; otherwise "idea"'),
    slides: z.array(z.object({
        picture: z.string().describe('The id of the picture for this slide, as given (F1, B2…); "NONE" for the closing question of an idea carousel'),
        line: z.string().describe('The line over the picture, 5 to 15 words'),
        gold: z.string().describe('The key phrase, 2 to 8 words copied exactly from the line'),
        centre: z.number().describe('For a frame (F…): where the main person\'s face is across it, 0 (left) to 1 (right); 0.5 otherwise'),
    })),
});
export type RawSlides = z.infer<typeof SlidesSchema>;

export function carouselSystem(): string {
    return [
        'You turn a moment from Soul Wisdom, a spiritual podcast, into a swipeable Instagram and Facebook carousel. Some people would rather flip through pictures and read than watch. Each slide is a picture with one line over it; read in order, the lines work without the video. A final slide pointing to the full conversation is added after yours: don\'t write one.',
        `First choose the kind:
- "idea" (the usual one): the speakers discuss an idea, a philosophy or a practice. Unpack that one idea:
  1. The hook: the idea in a line that makes someone swipe, often as a question ("What if silence is a teacher?").
  2. Two to five slides with the idea as the speakers explain it, in plain words, credited ("Tom says the quiet is where we hear ourselves."), now and then a short quote of their exact words in double quotation marks.
  3. The last slide: one question for the reader to sit with about their own life ("Where are you still fighting the silence?"), ending with a question mark, with picture "NONE". It asks; it never claims anything.
- "story": only when a guest tells something that happened to them. Retell the moment in order: the hook (who and the moment that makes someone swipe), what happened, and the turn or what they came back with.`,
        `Rules for both:
- ${MIN_STORY_SLIDES} to ${MAX_STORY_SLIDES} slides. Each line is ${MIN_LINE_WORDS} to ${MAX_LINE_WORDS} words: one plain sentence read in two seconds, in the third person, naming the speaker.
- Anything inside double quotation marks must be the speaker's words exactly as given.
- Use only what is said in this moment. Add no facts, names, numbers or claims. Report beliefs and experiences as the speaker's ("she believes", "he felt"), never as proven fact.
- For each slide choose a picture by its id: F are frames of this moment of the video, B are pictures from the episode's b-roll. Use each picture once at most. Prefer frames where the speaker's face is clear and expressive, and b-roll that fits the line.
- For each line give its gold phrase: ${GOLD_MIN} to ${GOLD_MAX} words copied exactly, character for character, from the line: its most vivid or surprising part.
- No hashtags or emoji.`,
        limitedWordsRule(),
    ].join('\n\n');
}

export function carouselPrompt(o: { title: string; speaker: string; spoken: string; frames: number; broll: number; host: boolean }): string {
    const limit = o.host
        ? `\n\n${o.speaker} is one of the show's hosts: this is an "idea" carousel. Use at most ${HOST_FRAMES_MAX} frames (F) and b-roll (B) for the other slides.`
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

export type SlidesCheck =
    | { ok: true; mode: CarouselMode; slides: Slide[]; dropped: string[] }
    | { ok: false; why: string; dropped: string[] };

export const isQuestion = (line: string) => /\?["”’)]*$/.test(line.trim());

// Claude's slides, checked: each kept only when it passes; a host's carousel is an idea and keeps its first
// HOST_FRAMES_MAX frames; an idea carousel ends on its question for the reader, on the plain background (NO_PICTURE).
export function checkSlides(raw: RawSlides, o: { frameIds: string[]; brollIds: string[]; spoken: string; host: boolean }): SlidesCheck {
    const mode: CarouselMode = o.host || raw.mode !== 'story' ? 'idea' : 'story';
    const pictures = new Set([...o.frameIds, ...o.brollIds]);
    const used = new Set<string>();
    const slides: Slide[] = [];
    const dropped: string[] = [];
    let frames = 0;
    // An idea carousel's closing question: the last slide that asks, drawn without a picture, kept for the end.
    const lastAt = raw.slides.length - 1;
    let question: Slide | null = null;
    for (const [i, r] of raw.slides.entries()) {
        const s = { picture: r.picture.trim().toUpperCase(), line: clean(r.line), gold: clean(r.gold) };
        if (mode === 'idea' && i === lastAt && isQuestion(s.line)) {
            const why = slideProblem({ ...s, picture: NO_PICTURE }, { pictures: new Set([NO_PICTURE]), used: new Set(), spoken: o.spoken });
            if (why) dropped.push(`Slide ${i + 1}: ${why}`);
            else question = { ...s, picture: NO_PICTURE, centre: 0.5 };
            continue;
        }
        let why = s.picture === NO_PICTURE ? 'no picture' : slideProblem(s, { pictures, used, spoken: o.spoken });
        const isFrame = o.frameIds.includes(s.picture);
        if (!why && o.host && isFrame && frames >= HOST_FRAMES_MAX) why = `more than ${HOST_FRAMES_MAX} frames of a host`;
        if (!why && slides.length >= MAX_STORY_SLIDES - (mode === 'idea' ? 1 : 0)) why = `more than ${MAX_STORY_SLIDES} slides`;
        if (why) {
            dropped.push(`Slide ${i + 1}: ${why}`);
            continue;
        }
        used.add(s.picture);
        if (isFrame) frames++;
        const centre = Number.isFinite(r.centre) ? Math.min(1, Math.max(0, r.centre)) : 0.5;
        slides.push({ ...s, centre });
    }
    if (mode === 'idea') {
        if (!question) return { ok: false, why: 'the idea carousel has no closing question for the reader', dropped };
        slides.push(question);
    }
    if (slides.length < MIN_STORY_SLIDES) return { ok: false, why: `only ${slides.length} slides passed the checks (at least ${MIN_STORY_SLIDES})`, dropped };
    return { ok: true, mode, slides, dropped };
}

// Where the frames are taken: spread over the Short, away from its ends.
export function carouselFrameTimes(startMs: number, endMs: number, count = CAROUSEL_FRAMES): number[] {
    const span = Math.max(0, endMs - startMs);
    return Array.from({ length: count }, (_, i) => Math.round(startMs + span * (i + 1) / (count + 1)));
}
