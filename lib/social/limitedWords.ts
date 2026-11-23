// Words the platforms limit (fewer recommendations, limited ads, an info panel), never in a social card or caption
// (docs/specs/026-social-publishing.md). Copied from Project Profound's Short Maker (masterytv/short-maker,
// src/lib/domain/limitedWords.ts, Tom 2026-11-11), not imported across repos. Pure: the job, the server and the tests share it.

export interface LimitedWord {
    /** What the words are about, for the checklist. */
    label: string;
    re: RegExp;
    /** Ways to say it without the word. */
    instead: string;
}

export const LIMITED_WORDS: LimitedWord[] = [
    {
        label: 'suicide',
        re: /\bsuicid\w*|\b(?:took|take|takes|taking|tried to take) (?:his|her|my|their|your|our) own li(?:fe|ves)\b|\bkill(?:ed|ing|s)? (?:myself|himself|herself|themselves|yourself)\b|\bend(?:ed|ing|s)? (?:it all|my life|his life|her life|their lives)\b|\bunalive\w*/i,
        instead: '"her darkest night", "he had lost all hope", "she had reached the end of what she could bear"',
    },
    {
        label: 'self-harm',
        re: /\bself[- ]?harm\w*|\bcut(?:ting)? (?:myself|himself|herself|themselves)\b|\bslit (?:my|his|her|their) wrists?\b/i,
        instead: '"she was in a lot of pain", "a very hard season"',
    },
    {
        label: 'abuse',
        re: /\babus(?:e|ed|es|er|ers|ing|ive)\b/i,
        instead: '"mistreated", "a hard childhood", "hurt by someone he trusted"',
    },
    {
        label: 'sexual violence',
        re: /\brap(?:e|ed|es|ing|ist|ists)\b|\bsexual(?:ly)? (?:assault|abuse|violence)\w*|\bmolest\w*|\bincest\b/i,
        instead: '"something terrible was done to her", "she was badly hurt"',
    },
    {
        label: 'overdose',
        re: /\boverdos\w*|\bOD'?d\b/i,
        instead: '"her body shut down", "a medical emergency"',
    },
    {
        label: 'drugs',
        re: /\b(?:heroin|cocaine|crack cocaine|meth|methamphetamine|fentanyl|opioids?|opiates?)\b/i,
        instead: '"his addiction", "a dark habit he couldn\'t break"',
    },
    {
        label: 'murder',
        re: /\bmurder\w*|\bhomicid\w*/i,
        instead: '"his life was taken", "a violent death"',
    },
    {
        label: 'weapons',
        re: /\bgunshot\w*|\bshot (?:him|her|me|himself|herself|myself|them)\b|\bstabbed\b|\bstab wounds?\b/i,
        instead: '"he was attacked", "she was badly hurt"',
    },
];

export interface LimitedHit {
    label: string;
    /** The words found, as written. */
    found: string;
    instead: string;
}

/** Every limited word in a text, once per kind. */
export function findLimitedWords(text: string): LimitedHit[] {
    const out: LimitedHit[] = [];
    for (const w of LIMITED_WORDS) {
        const m = w.re.exec(text);
        if (m) out.push({ label: w.label, found: m[0], instead: w.instead });
    }
    return out;
}

export const hasLimitedWords = (text: string) => LIMITED_WORDS.some(w => w.re.test(text));

/** Crisis-line footers from earlier drafts: they name what the video is never about, so they go too. */
const CRISIS_LINE = /\b988\b|findahelpline/i;

/**
  * A description with every sentence that has a limited word (or a crisis-line footer) taken out. Lines are
  * kept as they are otherwise, and a line left empty goes with its sentences.
  */
export function scrubDescription(text: string): string {
    const lines = text.split('\n').flatMap(line => {
        if (!hasLimitedWords(line) && !CRISIS_LINE.test(line)) return [line];
        const kept = line
            .split(/(?<=[.!?])\s+/)
            .filter(s => !hasLimitedWords(s) && !CRISIS_LINE.test(s))
            .join(' ')
            .trim();
        return kept ? [kept] : [];
    });
    // Collapse the blank lines a removed paragraph leaves behind.
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The rule given to Claude when it writes a card's words.
export function limitedWordsRule(): string {
    return [
        'Instagram, Facebook and YouTube limit the reach of posts that use certain words. Never use them, and never use slang stand-ins like "unalive". Speak around them so the meaning stays clear and kind:',
        ...LIMITED_WORDS.map(w => `- ${w.label}: say instead ${w.instead}.`),
        'Never add a crisis-line or helpline footer.',
    ].join('\n');
}
