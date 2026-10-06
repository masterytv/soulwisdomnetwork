// Why: correcting a misheard word (docs/specs/019-editor-light-v2.md item 2.3). A misheard name ends up
// in the captions and the quotes, so speaker review and the editor can retype words. AssemblyAI's
// transcript (raw.json) is never changed: a fix is a correction like the speaker ones
// (types/episode.ts `corrections.words`), keyed by the first word heard ("utterance:word"), and replaces
// `count` words heard with the typed text, so it can split a word or merge several. lib/transcript.ts
// buildLines applies them, so speaker review, the accepted transcript and everything made from it
// (notes, the editor, the render's captions) see the same words.
//
// The timing follows Rescript's `correctWords` (lib/store.ts in its MIT tree, a9b378e^; MIT licence,
// copyright the Rescript contributors; docs/licences/rescript.md): the typed text is split into
// words, which share the old words' span in proportion to their length, the last one ending where
// the old span ended. There is no re-alignment against the audio. Ours also keeps each word at
// least 20 ms long, as Rescript's word edges do.

export interface WordFix { count: number; text: string }

// By the first word heard, "utterance:word" (indices in raw.json's utterances with words).
export type WordFixes = Record<string, WordFix>;

// Set the `count` words heard from `ref` to `text`; null puts back what was heard.
export interface FixOp { ref: string; count: number; text: string | null }

interface Timed { text: string; start: number; end: number }

// A word as speaker review and the accepted transcript have it: `ref` is the first word heard it
// stands for; a corrected one also has what was heard and how many words heard it replaces. The
// words of one fix share a ref.
export interface FixedWord extends Timed { ref: string; heard?: string; count?: number; confidence?: number }

export const MIN_WORD_MS = 20;
export const MAX_FIX_WORDS = 20;        // words heard one fix replaces, and words typed
export const MAX_FIX_CHARS = 200;
export const MAX_FIXES = 5000;          // on one episode
export const MAX_OPS = 500;             // in one request (a find and replace)

export const fixKey = (utterance: number, word: number) => `${utterance}:${word}`;

// Spec 019 item 2.5: a word the transcriber gave less confidence than this is underlined in dotted
// amber, so the producer checks names and numbers first. A corrected word has no confidence: a
// person typed it.
export const UNSURE_BELOW = 0.6;
export const isUnsure = (w: { confidence?: number; heard?: string }) =>
    w.heard === undefined && typeof w.confidence === 'number' && w.confidence < UNSURE_BELOW;
export const unsureTitle = (w: { confidence?: number }) =>
    `The transcriber was unsure of this word (${Math.round((w.confidence ?? 0) * 100)}% sure)`;

export function parseRef(ref: string): { utterance: number; word: number } | null {
    const m = /^(\d{1,6}):(\d{1,6})$/.exec(ref);
    return m ? { utterance: Number(m[1]), word: Number(m[2]) } : null;
}

export const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean);

// The typed words over the span of the words heard (see the file header).
export function timeWords(span: { start: number; end: number }, typed: string[]): Timed[] {
    const n = typed.length;
    const length = Math.max(0, span.end - span.start);
    const floor = length >= MIN_WORD_MS * n ? MIN_WORD_MS : length / n;
    const spare = length - floor * n;
    const chars = typed.reduce((s, t) => s + t.length, 0) || n;
    let at = 0;
    return typed.map((text, i) => {
        const start = span.start + Math.round(at);
        at += floor + spare * (typed[i].length || 1) / chars;
        const end = i === n - 1 ? span.end : span.start + Math.round(at);
        return { text, start, end };
    });
}

// One utterance's words with its fixes applied. A fix that starts inside an earlier one's span, or
// has no words, is ignored.
export function applyFixes<W extends Timed>(words: W[], utterance: number, fixes: WordFixes | undefined): (W & FixedWord)[] {
    const out: (W & FixedWord)[] = [];
    for (let i = 0; i < words.length;) {
        const ref = fixKey(utterance, i);
        const fix = fixes?.[ref];
        const typed = fix ? wordsOf(fix.text) : [];
        if (!fix || !typed.length) {
            out.push({ ...words[i], ref });
            i++;
            continue;
        }
        const count = Math.min(Math.max(1, Math.floor(fix.count)), words.length - i);
        const heard = words.slice(i, i + count);
        const heardText = heard.map(w => w.text).join(' ');
        for (const w of timeWords({ start: heard[0].start, end: heard[count - 1].end }, typed)) {
            const word: W & FixedWord = { ...heard[0], ...w, ref, heard: heardText, count };
            delete word.confidence;
            out.push(word);
        }
        i += count;
    }
    return out;
}

// Applies ops in turn to the fixes (utterances: each one's words heard). Each op first drops the fixes
// that overlap the words it covers, then sets its own unless the text is what was heard. `undo` puts
// back what the ops replaced, as ops of its own; `spans` are the words heard whose words changed.
export function applyOps(fixes: WordFixes, ops: FixOp[], utterances: { words: { text: string }[] }[]): {
    fixes: WordFixes; undo: FixOp[]; spans: { ref: string; count: number }[];
} {
    const next = { ...fixes };
    const undo: FixOp[][] = [];
    const spans: { ref: string; count: number }[] = [];
    for (const op of ops) {
        const at = parseRef(op.ref);
        const heard = at && utterances[at.utterance]?.words;
        if (!at || !heard || at.word >= heard.length) continue;
        const end = Math.min(heard.length, at.word + Math.max(1, op.count));
        const back: FixOp[] = [{ ref: op.ref, count: end - at.word, text: null }];
        let from = at.word, to = end;
        for (const [key, f] of Object.entries(next)) {
            const k = parseRef(key);
            if (!k || k.utterance !== at.utterance || k.word >= end || k.word + f.count <= at.word) continue;
            back.push({ ref: key, count: f.count, text: f.text });
            from = Math.min(from, k.word);
            to = Math.max(to, k.word + f.count);
            delete next[key];
        }
        spans.push({ ref: fixKey(at.utterance, from), count: to - from });
        const typed = op.text === null ? [] : wordsOf(op.text);
        if (typed.length && typed.join(' ') !== heard.slice(at.word, end).map(w => w.text).join(' ')) {
            next[op.ref] = { count: end - at.word, text: typed.join(' ') };
        }
        undo.push(back);
    }
    return { fixes: next, undo: undo.reverse().flat(), spans };
}

// The op that retypes words[i..j] (one or more fixes' words, or words heard) as `text`, widened to
// whole fixes: a fix's other words keep their text. Null when the words are from two utterances or
// have no refs (a transcript accepted before word fixes).
export function fixOp(words: { text: string; ref?: string; count?: number }[], i: number, j: number, text: string): FixOp | null {
    const ref = words[i]?.ref, last = words[j]?.ref;
    if (!ref || !last || j < i) return null;
    let a = i, b = j;
    while (a > 0 && words[a - 1].ref === ref) a--;
    while (b + 1 < words.length && words[b + 1].ref === last) b++;
    const from = parseRef(ref), to = parseRef(last);
    if (!from || !to || from.utterance !== to.utterance) return null;
    const typed = [...words.slice(a, i).map(w => w.text), ...wordsOf(text), ...words.slice(j + 1, b + 1).map(w => w.text)];
    return { ref, count: to.word + (words[b].count ?? 1) - from.word, text: typed.join(' ') };
}

// The op that puts back what was heard for the fix words[i] belongs to; null when it is not fixed.
export function putBackOp(words: { ref?: string; count?: number; heard?: string }[], i: number): FixOp | null {
    const w = words[i];
    return w?.ref && w.heard !== undefined ? { ref: w.ref, count: w.count ?? 1, text: null } : null;
}

// The index range of the fix words[i] belongs to (just i when it has no ref).
export function fixGroup(words: { ref?: string }[], i: number): [number, number] {
    const ref = words[i]?.ref;
    if (!ref) return [i, i];
    let a = i, b = i;
    while (a > 0 && words[a - 1].ref === ref) a--;
    while (b + 1 < words.length && words[b + 1].ref === ref) b++;
    return [a, b];
}

// A word as find and replace compares it: lower case, without the punctuation around it.
const bare = (t: string) => t.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');

// Where the typed words occur, ignoring case and the punctuation around each word, as [first, last]
// index pairs that do not overlap.
export function findWords(words: { text: string }[], find: string): [number, number][] {
    const want = wordsOf(find).map(bare).filter(Boolean);
    const out: [number, number][] = [];
    if (!want.length) return out;
    for (let i = 0; i + want.length <= words.length; i++) {
        if (want.every((w, k) => bare(words[i + k].text) === w)) {
            out.push([i, i + want.length - 1]);
            i += want.length - 1;
        }
    }
    return out;
}

// The replacement for a match, keeping the punctuation before its first word and after its last
// ("Kenzie," replaced with "McKenzie" gives "McKenzie,").
export function replacement(matched: { text: string }[], replace: string): string {
    const lead = /^[^\p{L}\p{N}']*/u.exec(matched[0]?.text ?? '')?.[0] ?? '';
    const trail = /[^\p{L}\p{N}']*$/u.exec(matched[matched.length - 1]?.text ?? '')?.[0] ?? '';
    const typed = wordsOf(replace).join(' ');
    return typed ? `${lead}${typed}${trail}` : '';
}

// The ops for a find and replace over the words: one per match, skipping matches from two
// utterances, and any that would overlap an earlier one once widened to whole fixes.
export function replaceAllOps(words: { text: string; ref?: string; count?: number }[], find: string, replace: string): FixOp[] {
    const ops: FixOp[] = [];
    const covered: { utterance: number; from: number; to: number }[] = [];
    for (const [i, j] of findWords(words, find)) {
        const text = replacement(words.slice(i, j + 1), replace);
        if (!text) continue;
        const op = fixOp(words, i, j, text);
        const at = op && parseRef(op.ref);
        if (!op || !at) continue;
        const span = { utterance: at.utterance, from: at.word, to: at.word + op.count };
        if (covered.some(c => c.utterance === span.utterance && c.from < span.to && span.from < c.to)) continue;
        covered.push(span);
        ops.push(op);
    }
    return ops;
}

// Checks fixes sent by the browser against the transcript (wordCounts: each utterance's words heard).
export function parseWordFixes(input: unknown, wordCounts: number[]): WordFixes {
    const bad = (why: string): never => { throw new Error(`Invalid word corrections: ${why}`); };
    if (input === undefined || input === null) return {};
    if (typeof input !== 'object' || Array.isArray(input)) bad('not an object');
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length > MAX_FIXES) bad(`more than ${MAX_FIXES}`);
    const out: WordFixes = {};
    for (const [key, value] of entries) {
        const at = parseRef(key) ?? bad('word');
        const f = (value && typeof value === 'object' ? value : bad('fix')) as Record<string, unknown>;
        const heard = wordCounts[at.utterance] ?? bad('line');
        const count = Number.isInteger(f.count) && (f.count as number) >= 1 && (f.count as number) <= MAX_FIX_WORDS ? f.count as number : bad('count');
        if (at.word + count > heard) bad('past the end of the line');
        out[key] = { count, text: fixText(f.text) ?? bad('text') };
    }
    return out;
}

// Typed text as it is stored: words separated by single spaces; null when empty or too long.
export function fixText(input: unknown): string | null {
    if (typeof input !== 'string' || input.length > MAX_FIX_CHARS) return null;
    const typed = wordsOf(input);
    return typed.length && typed.length <= MAX_FIX_WORDS ? typed.join(' ') : null;
}

// Checks ops sent by the editor.
export function parseFixOps(input: unknown, wordCounts: number[]): FixOp[] {
    const bad = (why: string): never => { throw new Error(`Invalid word corrections: ${why}`); };
    if (!Array.isArray(input) || !input.length || input.length > MAX_OPS) bad(`send 1 to ${MAX_OPS} changes`);
    return (input as unknown[]).map(v => {
        const o = (v && typeof v === 'object' ? v : bad('change')) as Record<string, unknown>;
        const at = typeof o.ref === 'string' ? parseRef(o.ref) ?? bad('word') : bad('word');
        const heard = wordCounts[at.utterance] ?? bad('line');
        const count = Number.isInteger(o.count) && (o.count as number) >= 1 && (o.count as number) <= MAX_FIX_WORDS ? o.count as number : bad('count');
        if (at.word + count > heard) bad('past the end of the line');
        const text = o.text === null ? null : fixText(o.text) ?? bad(`text (1 to ${MAX_FIX_WORDS} words, up to ${MAX_FIX_CHARS} characters)`);
        return { ref: o.ref as string, count, text };
    });
}

// Puts fixed words returned by the server in place of the ones they replace: every word whose ref
// is in a changed span (same utterance, word in [from, to)) goes, and the new words go where the
// first of them was.
export function spliceWords<W extends { ref?: string; start: number }>(words: W[], spans: { ref: string; count: number; words: W[] }[]): W[] {
    let out = words;
    for (const s of spans) {
        const at = parseRef(s.ref);
        if (!at) continue;
        const inSpan = (w: W) => {
            const r = w.ref ? parseRef(w.ref) : null;
            return !!r && r.utterance === at.utterance && r.word >= at.word && r.word < at.word + s.count;
        };
        let first = out.findIndex(inSpan);
        const rest = out.filter(w => !inSpan(w));
        if (first < 0) first = rest.findIndex(w => w.start >= (s.words[0]?.start ?? Infinity));
        if (first < 0) first = rest.length;
        out = [...rest.slice(0, first), ...s.words, ...rest.slice(first)];
    }
    return out;
}
