// The image post's quote (docs/specs/026-social-publishing.md): the speaker's own words from the Short, one phrase of
// them in gold, over a frame of the speaker. Claude reads the Short's words and looks at a few small frames; the code
// keeps its answer only when the quote is copied word for word from the Short, fits the card, has no limited words,
// and its gold phrase is copied exactly from the quote (Tom, 2026-11-23). Pure: the job and the tests share it.

import { z } from 'zod';
import { hasLimitedWords, limitedWordsRule } from './limitedWords';

export const QUOTE_MIN_CHARS = 30;
export const QUOTE_MAX_CHARS = 220;
export const GOLD_MIN_WORDS = 2;
export const GOLD_MAX_WORDS = 6;
// Small frames Claude looks at, spread over the Short.
export const QUOTE_FRAMES = 6;
// Rough cost of one quote (a few small frames and the Short's words), reserved against the daily limit.
export const QUOTE_ESTIMATE_USD = 0.06;

// What Claude returns. No .min()/.max(): limits are applied after, in code.
export const QuotePickSchema = z.object({
    quote: z.string().describe('The quote: one to three consecutive sentences the speaker says in this Short, copied word for word from the words given. No words added, none left out in the middle'),
    gold: z.string().describe('The key phrase of the quote, two to six words copied exactly from it, to be shown in gold'),
    frame: z.number().int().describe('The number of the frame that shows the speaker best: face clear, eyes open, not mid-blink or mid-word, no screen share'),
    centre: z.number().describe('Where the speaker\'s face is across that frame, 0 (left edge) to 1 (right edge)'),
});
export type QuotePick = z.infer<typeof QuotePickSchema>;

export function quoteSystem(): string {
    return [
        'You choose the quote for an Instagram and Facebook image post from a moment of a spiritual podcast, Soul Wisdom.',
        'The quote is the speaker\'s own words: the line from this moment that would stop someone scrolling and stay with them. It must stand on its own, make sense without the rest of the conversation, and sound like something worth saving or sharing.',
        `Copy it word for word from the words given: one to three consecutive sentences, ${QUOTE_MIN_CHARS} to ${QUOTE_MAX_CHARS} characters. You may fix capitals and punctuation, and leave out "um", "uh" and a repeated word, nothing else. Never paraphrase.`,
        'Then pick its key phrase for gold: two to six words copied exactly from your quote, the heart of it (for example, in "I felt what everyone around me felt, and it was all love", the phrase "it was all love").',
        limitedWordsRule(),
    ].join('\n\n');
}

export function quotePrompt(o: { title: string; speaker: string; spoken: string; frames: number }): string {
    return `The Short is titled "${o.title}". The speaker is ${o.speaker}. Their words in it:\n\n${o.spoken}\n\n` +
        `The ${o.frames} numbered frames above are from this moment. Choose the quote, its gold phrase, and the frame that shows ${o.speaker} best, ` +
        `with where their face is across it. If several people show side by side, ${o.speaker} is the one to choose.`;
}

const FILLERS = new Set(['um', 'uh', 'erm', 'er', 'ah', 'hmm', 'mm']);

// Words for matching: lower case, letters, digits and apostrophes, fillers out.
export const wordsOf = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\s]+/g, ' ').split(/\s+/)
    .filter(w => w && !FILLERS.has(w));

// Whether the quote's words appear in the spoken words in order and together. A repeated word ("I I felt") in the
// speech may be dropped from the quote; nothing else.
export function isVerbatim(quote: string, spoken: string): boolean {
    const want = wordsOf(quote);
    const have = wordsOf(spoken);
    if (!want.length) return false;
    for (let start = 0; start < have.length; start++) {
        let i = start, j = 0;
        while (i < have.length && j < want.length) {
            if (have[i] === want[j]) { i++; j++; continue; }
            if (i > start && have[i] === have[i - 1]) { i++; continue; }      // a stammer
            break;
        }
        if (j === want.length) return true;
    }
    return false;
}

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'but', 'or', 'to', 'in', 'on', 'at', 'for', 'with', 'so', 'that', 'is', 'was']);

// A gold phrase when Claude's isn't usable: the quote's last clause, if short enough, else its last few words.
export function fallbackGold(quote: string): string {
    const clauses = quote.split(/[,;:.!?—–]+/).map(c => c.trim()).filter(c => countWords(c) >= GOLD_MIN_WORDS);
    const last = clauses[clauses.length - 1] ?? quote.trim();
    const words = last.split(/\s+/);
    if (words.length <= GOLD_MAX_WORDS) return last;
    // Its last few words, never starting on a small word ("of hurry at all" → "hurry at all").
    const tail = words.slice(-4);
    while (tail.length > GOLD_MIN_WORDS && SMALL_WORDS.has(tail[0].toLowerCase())) tail.shift();
    return tail.join(' ');
}

const cleanQuote = (s: string) => s.replace(/\s+/g, ' ').replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, '').trim();

export type QuoteCheck = { ok: true; quote: string; gold: string; frame: number; centre: number; goldFallback: boolean } | { ok: false; why: string };

// Claude's answer, checked. The quote must be the speaker's own words; the gold phrase is copied exactly from it,
// or the quote's last clause takes its place.
export function checkQuote(pick: QuotePick, spoken: string, frames: number): QuoteCheck {
    const quote = cleanQuote(pick.quote);
    if (quote.length < QUOTE_MIN_CHARS) return { ok: false, why: `The quote is shorter than ${QUOTE_MIN_CHARS} characters` };
    if (quote.length > QUOTE_MAX_CHARS) return { ok: false, why: `The quote is longer than ${QUOTE_MAX_CHARS} characters` };
    if (!isVerbatim(quote, spoken)) return { ok: false, why: 'The quote is not word for word what the speaker says in the Short' };
    if (hasLimitedWords(quote)) return { ok: false, why: 'The quote has a word the platforms limit' };
    const gold = pick.gold.trim();
    const goldOk = !!gold && quote.includes(gold) && countWords(gold) >= GOLD_MIN_WORDS && countWords(gold) <= GOLD_MAX_WORDS;
    const frame = pick.frame >= 1 && pick.frame <= frames ? pick.frame : 1;
    const centre = Number.isFinite(pick.centre) ? Math.min(1, Math.max(0, pick.centre)) : 0.5;
    return { ok: true, quote, gold: goldOk ? gold : fallbackGold(quote), frame, centre, goldFallback: !goldOk };
}

// Where the small frames are taken: spread over the Short, away from its very ends.
export function frameTimes(startMs: number, endMs: number, count = QUOTE_FRAMES): number[] {
    const span = Math.max(0, endMs - startMs);
    return Array.from({ length: count }, (_, i) => Math.round(startMs + span * (i + 1) / (count + 1)));
}
