import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    keepRanges, editedTime, editedDuration, suggestCuts,
    applyToChapters, applyToQuotes, editedWords, CutsSchema, MAX_CUTS,
    replaceSuggestions, sectionAt, cutSection, restoreSection, SplitsSchema, MAX_SPLITS, savedByReason, unspokenSpans,
    keptBounds, trimSection, sectionsOf, MIN_PART_MS,
    type Cut, type KeptRange,
} from './edit';
import type { SpokenWord } from './showNotes';
import { hasFillers } from './fillers';

describe('keepRanges', () => {
    test('empty cuts returns full duration', () => {
        const r = keepRanges(10_000, []);
        assert.equal(r.length, 1);
        assert.equal(r[0].startMs, 0);
        assert.equal(r[0].endMs, 10_000);
    });

    test('single cut in middle', () => {
        const r = keepRanges(10_000, [{ startMs: 3000, endMs: 5000, reason: 'manual' }]);
        assert.equal(r.length, 2);
        assert.equal(r[0].startMs, 0);
        assert.equal(r[0].endMs, 3040);  // the cut stops 40 ms inside, so the word before is whole
        assert.equal(r[1].startMs, 4960); // and the word after starts whole
        assert.equal(r[1].endMs, 10_000);
    });

    test('overlapping cuts merged', () => {
        const r = keepRanges(10_000, [
            { startMs: 2000, endMs: 4000, reason: 'filler' },
            { startMs: 3500, endMs: 6000, reason: 'pause' },
        ]);
        assert.equal(r.length, 2);
        assert.equal(r[0].endMs, 2040);
        assert.equal(r[1].startMs, 5960);
    });

    test('touching cuts merged (within pad)', () => {
        const r = keepRanges(10_000, [
            { startMs: 2000, endMs: 3000, reason: 'filler' },
            { startMs: 3010, endMs: 5000, reason: 'pause' },
        ]);
        // 3010 - 3000 = 10 ms apart, so merged: no sliver of sound between them
        assert.equal(r.length, 2);
        assert.equal(r[0].endMs, 2040);
        assert.equal(r[1].startMs, 4960);
    });

    test('tiny fragment dropped', () => {
        const r = keepRanges(10_000, [
            { startMs: 100, endMs: 200, reason: 'filler' },
            { startMs: 250, endMs: 400, reason: 'filler' },
        ]);
        // 50 ms apart, so both cuts merge into 100..400, kept as 140..360 cut.
        // The piece before (0..140) is under 150 ms, so it is dropped too.
        assert.equal(r.length, 1);
        assert.equal(r[0].startMs, 360);
    });

    test('cut at start', () => {
        const r = keepRanges(10_000, [{ startMs: 0, endMs: 2000, reason: 'pause' }]);
        assert.equal(r.length, 1);
        assert.equal(r[0].startMs, 1960);
    });

    test('cut at end', () => {
        const r = keepRanges(10_000, [{ startMs: 8000, endMs: 10_000, reason: 'pause' }]);
        assert.equal(r.length, 1);
        assert.equal(r[0].endMs, 8040);
    });

    test('a cut shorter than the padding cuts nothing', () => {
        const r = keepRanges(10_000, [{ startMs: 3000, endMs: 3060, reason: 'manual' }]);
        assert.deepEqual(r, [{ startMs: 0, endMs: 10_000 }]);
    });

    test('kept words are never clipped', () => {
        // Words 0..1000, cut 1000..2000, 2000..3000: both kept words survive in full.
        const r = keepRanges(3000, [{ startMs: 1000, endMs: 2000, reason: 'manual' }]);
        assert.ok(r[0].endMs >= 1000 && r[1].startMs <= 2000);
    });

    test('zero duration returns empty', () => {
        assert.deepEqual(keepRanges(0, []), []);
    });

    // Spec 019 item 1.5: a breath left between two close cuts is dropped, a short word is not.
    const um = (startMs: number, endMs: number): Cut => ({ startMs, endMs, reason: 'filler' });
    test('a kept piece under 400 ms with no whole word is dropped when words are given', () => {
        const words = [{ start: 500, end: 900 }, { start: 3000, end: 3400 }];
        // Cuts 1000-2000 and 2300-2900 leave 1960-2340 kept: 380 ms of breath.
        const cuts = [um(1000, 2000), um(2300, 2900)];
        assert.deepEqual(keepRanges(10_000, cuts), [{ startMs: 0, endMs: 1040 }, { startMs: 1960, endMs: 2340 }, { startMs: 2860, endMs: 10_000 }]);
        assert.deepEqual(keepRanges(10_000, cuts, 40, words), [{ startMs: 0, endMs: 1040 }, { startMs: 2860, endMs: 10_000 }]);
    });

    test('a short kept piece holding a whole word stays, and so does any piece of 400 ms or more', () => {
        const words = [{ start: 2050, end: 2250 }];          // "so", 200 ms, between the cuts
        const cuts = [um(1000, 2000), um(2300, 2900)];
        assert.deepEqual(keepRanges(10_000, cuts, 40, words)[1], { startMs: 1960, endMs: 2340 });
        // A word only partly inside does not count.
        assert.equal(keepRanges(10_000, cuts, 40, [{ start: 1800, end: 2100 }]).length, 2);
        // 1960-2440 is 480 ms: kept, words or not.
        assert.equal(keepRanges(10_000, [um(1000, 2000), um(2400, 2900)], 40, []).length, 3);
    });

    test('slivers at the very start and end, and words given out of order', () => {
        const words = [{ start: 9000, end: 9500 }, { start: 100, end: 250 }];
        // 0-340 holds the word at 100-250; 9660-10000 holds none.
        assert.deepEqual(keepRanges(10_000, [um(300, 9700)], 40, words), [{ startMs: 0, endMs: 340 }]);
        assert.deepEqual(keepRanges(10_000, [um(300, 9700)], 40, []), []);
    });
});

describe('editedTime', () => {
    const ranges: KeptRange[] = [
        { startMs: 0, endMs: 2000 },
        { startMs: 3000, endMs: 5000 },
    ];

    test('time inside first range', () => {
        assert.equal(editedTime(1000, ranges), 1000);
    });

    test('time inside second range', () => {
        assert.equal(editedTime(4000, ranges), 2000 + (4000 - 3000));
        // = 3000
    });

    test('time in a cut returns null', () => {
        assert.equal(editedTime(2500, ranges), null);
    });

    test('time at cut boundary returns null', () => {
        assert.equal(editedTime(2000, ranges), 2000);  // at end of first range — kept
    });

    test('time at start of range', () => {
        assert.equal(editedTime(3000, ranges), 2000);
    });

    test('roundToNextKept in a cut', () => {
        assert.equal(editedTime(2500, ranges, true), 2000);  // start of next range
    });

    test('time past end returns null', () => {
        assert.equal(editedTime(6000, ranges), null);
    });

    test('empty ranges returns null', () => {
        assert.equal(editedTime(1000, []), null);
    });
});

describe('editedDuration', () => {
    test('multiple ranges', () => {
        const r: KeptRange[] = [
            { startMs: 0, endMs: 2000 },
            { startMs: 3000, endMs: 5000 },
        ];
        assert.equal(editedDuration(r), 4000);
    });

    test('empty', () => {
        assert.equal(editedDuration([]), 0);
    });
});

describe('suggestCuts', () => {
    const baseWords: SpokenWord[] = [
        { text: 'hello', start: 0, end: 500, speaker: 'Host', clip: false },
        { text: 'um', start: 500, end: 700, speaker: 'Host', clip: false },
        { text: 'world', start: 700, end: 1200, speaker: 'Host', clip: false },
    ];

    test('filler words detected', () => {
        const cuts = suggestCuts(baseWords);
        const fillers = cuts.filter(c => c.reason === 'filler');
        assert.equal(fillers.length, 1);
        assert.equal(fillers[0].startMs, 500);
        assert.equal(fillers[0].endMs, 700);
    });

    test('repeated words detected', () => {
        const words: SpokenWord[] = [
            { text: 'the', start: 0, end: 300, speaker: 'Host', clip: false },
            { text: 'the', start: 300, end: 600, speaker: 'Host', clip: false },
            { text: 'point', start: 600, end: 900, speaker: 'Host', clip: false },
        ];
        const cuts = suggestCuts(words);
        const repeats = cuts.filter(c => c.reason === 'repeat');
        assert.equal(repeats.length, 1);
        assert.equal(repeats[0].startMs, 0);
    });

    test('repeats: only a stammer within one sentence, by one speaker', () => {
        const w = (text: string, start: number, end: number, speaker = 'Host'): SpokenWord => ({ text, start, end, speaker, clip: false });
        const reps = (words: SpokenWord[]) => suggestCuts(words).filter(c => c.reason === 'repeat').length;
        assert.equal(reps([w('I', 0, 100), w('I', 350, 450), w('think', 450, 700)]), 1, 'within 300 ms');
        assert.equal(reps([w('very', 0, 300), w('very', 900, 1200), w('good', 1200, 1500)]), 0, 'said again after a pause');
        assert.equal(reps([w('Yes.', 0, 300), w('yes', 400, 700)]), 0, 'across a sentence');
        assert.equal(reps([w('right', 0, 300), w('right', 350, 650, 'Guest')]), 0, 'another speaker');
    });

    test('savedByReason counts overlapping cuts of a kind once', () => {
        assert.deepEqual(savedByReason([
            { startMs: 0, endMs: 1000, reason: 'filler' },
            { startMs: 500, endMs: 1500, reason: 'filler' },
            { startMs: 3000, endMs: 3200, reason: 'filler' },
            { startMs: 0, endMs: 2000, reason: 'pause' },
        ]), { filler: 1700, pause: 2000 });
        assert.deepEqual(savedByReason([]), {});
    });

    test('hasFillers: a transcript with its ums written out', () => {
        assert.equal(hasFillers([{ text: 'So,' }, { text: 'Um,' }, { text: 'yes' }]), true);
        assert.equal(hasFillers([{ text: 'So,' }, { text: 'yes' }]), false);
    });

    test('long pause shortened', () => {
        const words: SpokenWord[] = [
            { text: 'first', start: 0, end: 500, speaker: 'Host', clip: false },
            { text: 'second', start: 2000, end: 2500, speaker: 'Host', clip: false },
        ];
        const cuts = suggestCuts(words);
        const pauses = cuts.filter(c => c.reason === 'pause');
        assert.equal(pauses.length, 1);
        // Cut from 500 + 500 = 1000 to 2000
        assert.equal(pauses[0].startMs, 1000);
        assert.equal(pauses[0].endMs, 2000);
    });

    test('case insensitive filler', () => {
        const words: SpokenWord[] = [
            { text: 'Um', start: 0, end: 200, speaker: 'Host', clip: false },
            { text: 'UH', start: 200, end: 400, speaker: 'Host', clip: false },
        ];
        const cuts = suggestCuts(words);
        assert.equal(cuts.filter(c => c.reason === 'filler').length, 2);
    });

    test('punctuation-insensitive filler', () => {
        const words: SpokenWord[] = [
            { text: 'um...', start: 0, end: 200, speaker: 'Host', clip: false },
        ];
        const cuts = suggestCuts(words);
        assert.equal(cuts.filter(c => c.reason === 'filler').length, 1);
    });

    test('empty words returns empty cuts', () => {
        assert.deepEqual(suggestCuts([]), []);
    });

    test('no fillers or pauses returns empty', () => {
        const words: SpokenWord[] = [
            { text: 'hello', start: 0, end: 500, speaker: 'Host', clip: false },
            { text: 'world', start: 600, end: 1100, speaker: 'Host', clip: false },
        ];
        assert.deepEqual(suggestCuts(words), []);
    });

    test('hesitations only when asked for', () => {
        // A 600 ms gap between two words in the middle of a sentence.
        const words: SpokenWord[] = [
            { text: 'the', start: 0, end: 300, speaker: 'Host', clip: false },
            { text: 'meaning', start: 900, end: 1200, speaker: 'Host', clip: false },
        ];
        assert.deepEqual(suggestCuts(words), []);
        const gaps = suggestCuts(words, { gaps: true });
        // Cut starts at 300 + 150 = 450, ends at 900; a hesitation, not a filler word.
        assert.deepEqual(gaps, [{ startMs: 450, endMs: 900, reason: 'gap' }]);
    });

    test('no hesitation after a sentence or clause ends, or under half a second', () => {
        const pair = (first: string, gapMs: number): SpokenWord[] => [
            { text: first, start: 0, end: 300, speaker: 'Host', clip: false },
            { text: 'next', start: 300 + gapMs, end: 600 + gapMs, speaker: 'Host', clip: false },
        ];
        for (const end of ['done.', 'really?', 'well,', 'so;', 'this:', 'and \u2014', 'said."']) {
            assert.deepEqual(suggestCuts(pair(end, 700), { gaps: true }), [], end);
        }
        assert.deepEqual(suggestCuts(pair('the', 450), { gaps: true }), []);
        assert.equal(suggestCuts(pair('the', 500), { gaps: true }).length, 1);
    });

    test('no hesitation before a filler word, which is cut on its own', () => {
        const words: SpokenWord[] = [
            { text: 'the', start: 0, end: 300, speaker: 'Host', clip: false },
            { text: 'um', start: 1000, end: 1200, speaker: 'Host', clip: false },
        ];
        assert.deepEqual(suggestCuts(words, { gaps: true }).map(c => c.reason), ['filler']);
    });

    // Spec 019 item 1.1: pauses measured from the audio.
    const word = (text: string, start: number, end: number): SpokenWord => ({ text, start, end, speaker: 'Host', clip: false });
    const pauses = (cuts: Cut[]) => cuts.filter(c => c.reason === 'pause').map(c => [c.startMs, c.endMs]);

    test('a measured silence over 1.2 s is shortened to 0.5 s, even inside a word\'s time span', () => {
        // "so" runs 1000-4000 in the transcript, but the audio is silent from 1500 to 3500.
        const words = [word('well', 0, 1000), word('so', 1000, 4000), word('yes', 4000, 4500)];
        assert.deepEqual(pauses(suggestCuts(words)), []);
        assert.deepEqual(pauses(suggestCuts(words, { silences: [{ startMs: 1500, endMs: 3500 }] })), [[1750, 3250]]);
        // 1.2 s or shorter is how people talk.
        assert.deepEqual(pauses(suggestCuts(words, { silences: [{ startMs: 1500, endMs: 2700 }] })), []);
    });

    test('a word gap the audio says is not silent is no longer a pause; with nothing measured, gaps are used', () => {
        // A 2 s gap between words, filled with laughter: no silence there.
        const words = [word('right', 0, 500), word('exactly', 2500, 3000), word('and', 3000, 3200), word('then', 6000, 6400)];
        const silences = [{ startMs: 3200, endMs: 6000 }];
        assert.deepEqual(pauses(suggestCuts(words)), [[1000, 2500], [3700, 6000]]);
        assert.deepEqual(pauses(suggestCuts(words, { silences })), [[3450, 5750]]);
        // None found (a noisy recording) or not measured: the word gaps, as before.
        assert.deepEqual(pauses(suggestCuts(words, { silences: [] })), [[1000, 2500], [3700, 6000]]);
        assert.deepEqual(pauses(suggestCuts(words, { silences: null })), [[1000, 2500], [3700, 6000]]);
    });

    test('measured pauses are whole milliseconds, as the edit route requires', () => {
        const cuts = suggestCuts([word('a', 0, 100)], { silences: [{ startMs: 100.4, endMs: 2000.6 }] });
        assert.ok(CutsSchema.safeParse(cuts).success);
    });
});

describe('unspokenSpans and missed speech (spec 019 item 1.2)', () => {
    const w = (text: string, start: number, end: number, speaker = 'Host'): SpokenWord => ({ text, start, end, speaker, clip: false });

    test('a stretch no word covers and the audio says is not silent, at least 300 ms', () => {
        const words = [w('I', 0, 200), w('think', 1000, 1400), w('so', 1500, 1700), w('yes', 3000, 3300)];
        // 200-1000: silent 200-400, then sound 400-1000 (an "um" the transcript left out).
        // 1400-1500: too short. 1700-3000: silent 1700-2900, 100 ms of sound left: too short.
        const silences = [{ startMs: 200, endMs: 400 }, { startMs: 1700, endMs: 2900 }];
        assert.deepEqual(unspokenSpans(words, silences), [{ startMs: 400, endMs: 1000, before: 1 }]);
        // Sound on both sides of a silence inside one gap gives two stretches.
        assert.deepEqual(unspokenSpans([w('a', 0, 100), w('b', 2000, 2100)], [{ startMs: 600, endMs: 1200 }]),
            [{ startMs: 100, endMs: 600, before: 1 }, { startMs: 1200, endMs: 2000, before: 1 }]);
        // No silence at all in the gap: all of it.
        assert.deepEqual(unspokenSpans([w('a', 0, 100), w('b', 500, 600)], []), [{ startMs: 100, endMs: 500, before: 1 }]);
    });

    test('overlapping speakers: a word still running covers the gap', () => {
        const words = [w('long', 0, 3000, 'Ana'), w('mm', 1000, 1200, 'Ben'), w('then', 3100, 3300, 'Ana')];
        assert.deepEqual(unspokenSpans(words, []), []);
    });

    test('suggested as fillers only inside one speaker\'s clause, short, and not beside a filler', () => {
        const silences = [{ startMs: 9000, endMs: 9100 }];   // measured, but not in these gaps
        const fillers = (words: SpokenWord[]) => suggestCuts(words, { silences }).filter(c => c.reason === 'filler').map(c => [c.startMs, c.endMs]);
        assert.deepEqual(fillers([w('I', 0, 200), w('think', 700, 1000)]), [[200, 700]]);
        assert.deepEqual(fillers([w('done.', 0, 200), w('Next', 700, 1000)]), [], 'a breath after a full stop');
        assert.deepEqual(fillers([w('well,', 0, 200), w('yes', 700, 1000)]), [], 'a breath after a comma');
        assert.deepEqual(fillers([w('I', 0, 200, 'Ana'), w('think', 700, 1000, 'Ben')]), [], 'a change of speaker');
        assert.deepEqual(fillers([w('I', 0, 200), w('think', 2000, 2300)]), [], 'over 1.5 s: laughter or music more likely');
        assert.deepEqual(fillers([w('um', 0, 200), w('think', 700, 1000)]), [[0, 200]], 'beside a filler: only the filler');
        // Without silences there is nothing to compare with.
        assert.deepEqual(suggestCuts([w('I', 0, 200), w('think', 700, 1000)]), []);
    });

    test('with silences the hesitation guess is replaced', () => {
        const words = [w('the', 0, 300), w('point', 1000, 1300)];
        assert.deepEqual(suggestCuts(words, { gaps: true }).map(c => c.reason), ['gap']);
        assert.deepEqual(suggestCuts(words, { gaps: true, silences: [{ startMs: 300, endMs: 1000 }] }), []);
    });
});

describe('replaceSuggestions', () => {
    test('marking again replaces the earlier suggestions of those kinds only', () => {
        const cuts: Cut[] = [
            { startMs: 0, endMs: 100, reason: 'filler' },
            { startMs: 200, endMs: 300, reason: 'manual' },
            { startMs: 400, endMs: 500, reason: 'retake' },
            { startMs: 600, endMs: 700, reason: 'gap' },
        ];
        const fresh: Cut[] = [{ startMs: 0, endMs: 100, reason: 'filler' }, { startMs: 800, endMs: 900, reason: 'gap' }];
        assert.deepEqual(replaceSuggestions(cuts, fresh, ['filler', 'repeat', 'pause']), [
            { startMs: 200, endMs: 300, reason: 'manual' },
            { startMs: 400, endMs: 500, reason: 'retake' },
            { startMs: 600, endMs: 700, reason: 'gap' },
            { startMs: 0, endMs: 100, reason: 'filler' },
        ]);
    });
});

describe('sections', () => {
    test('sectionAt finds the splits around a moment', () => {
        assert.deepEqual(sectionAt([], 500, 10_000), { startMs: 0, endMs: 10_000 });
        assert.deepEqual(sectionAt([2000, 6000], 500, 10_000), { startMs: 0, endMs: 2000 });
        assert.deepEqual(sectionAt([2000, 6000], 2000, 10_000), { startMs: 2000, endMs: 6000 });
        assert.deepEqual(sectionAt([6000, 2000], 7000, 10_000), { startMs: 6000, endMs: 10_000 });
    });

    test('cutSection cuts it whole; restoreSection keeps cuts outside it', () => {
        const section = { startMs: 2000, endMs: 6000 };
        assert.deepEqual(cutSection([], section), [{ startMs: 2000, endMs: 6000, reason: 'manual' }]);
        const cuts: Cut[] = [
            { startMs: 1000, endMs: 3000, reason: 'pause' },   // runs into the section
            { startMs: 4000, endMs: 4500, reason: 'filler' },  // inside it
            { startMs: 5500, endMs: 7000, reason: 'manual' },  // runs out of it
            { startMs: 8000, endMs: 9000, reason: 'manual' },  // outside it
        ];
        assert.deepEqual(restoreSection(cuts, section), [
            { startMs: 1000, endMs: 2000, reason: 'pause' },
            { startMs: 6000, endMs: 7000, reason: 'manual' },
            { startMs: 8000, endMs: 9000, reason: 'manual' },
        ]);
    });

    test('SplitsSchema keeps each split once, in order, in whole milliseconds', () => {
        assert.deepEqual(SplitsSchema.parse([5000.4, 1000, 5000]), [1000, 5000]);
        assert.ok(!SplitsSchema.safeParse([-1]).success);
        assert.ok(!SplitsSchema.safeParse(Array.from({ length: MAX_SPLITS + 1 }, (_, i) => i)).success);
    });
});

describe('applyToChapters', () => {
    test('chapter in kept range', () => {
        const ranges: KeptRange[] = [{ startMs: 0, endMs: 5000 }];
        const chapters = [{ startMs: 1000, title: 'Intro' }];
        const result = applyToChapters(chapters, ranges);
        assert.equal(result[0].startMs, 1000);
    });

    test('chapter in cut moves to next kept', () => {
        const ranges: KeptRange[] = [
            { startMs: 0, endMs: 2000 },
            { startMs: 4000, endMs: 8000 },
        ];
        const chapters = [{ startMs: 3000, title: 'Middle' }];
        const result = applyToChapters(chapters, ranges);
        assert.equal(result[0].startMs, 2000);  // start of second range in edited time
    });
});

describe('applyToQuotes', () => {
    test('quote times mapped', () => {
        const ranges: KeptRange[] = [
            { startMs: 0, endMs: 2000 },
            { startMs: 3000, endMs: 6000 },
        ];
        const quotes = [{ startMs: 3500, endMs: 4500, text: 'test', speaker: 'Host' }];
        const result = applyToQuotes(quotes, ranges);
        assert.equal(result[0].startMs, 2000 + (3500 - 3000));  // 2500
        assert.equal(result[0].endMs, 2000 + (4500 - 3000));    // 3500
    });
});

describe('empty edit', () => {
    test('no cuts means full duration kept', () => {
        const r = keepRanges(10_000, []);
        assert.equal(editedDuration(r), 10_000);
    });

    test('editedTime returns original for no cuts', () => {
        const r = keepRanges(10_000, []);
        assert.equal(editedTime(5000, r), 5000);
    });
});

describe('editedWords', () => {
    const ranges: KeptRange[] = [{ startMs: 0, endMs: 2000 }, { startMs: 3000, endMs: 6000 }];
    const words = [
        { text: 'kept', start: 500, end: 900 },
        { text: 'cut', start: 2200, end: 2700 },
        { text: 'after', start: 3500, end: 3900 },
    ];

    test('drops cut words and moves the rest onto the edit', () => {
        assert.deepEqual(editedWords(words, ranges), [
            { text: 'kept', start: 500, end: 900 },
            { text: 'after', start: 2500, end: 2900 },
        ]);
    });

    test('applies the offset for what plays before the episode', () => {
        assert.equal(editedWords(words, ranges, 4000)[1].start, 6500);
    });

    test('drops a word that straddles a cut', () => {
        assert.deepEqual(editedWords([{ text: 'split', start: 1800, end: 3200 }], ranges), []);
    });
});

describe('CutsSchema', () => {
    test('accepts the cuts the editor makes', () => {
        assert.ok(CutsSchema.safeParse([{ startMs: 0, endMs: 500, reason: 'filler' }, { startMs: 900, endMs: 1200, reason: 'manual' }]).success);
        // Claude's retakes (Part I) are saved like any other cut.
        assert.ok(CutsSchema.safeParse([{ startMs: 0, endMs: 500, reason: 'retake' }]).success);
    });
    test('rounds to whole milliseconds', () => {
        assert.deepEqual(CutsSchema.parse([{ startMs: 10.4, endMs: 400.6, reason: 'pause' }]), [{ startMs: 10, endMs: 401, reason: 'pause' }]);
    });
    test('refuses backwards, negative, unknown or extra fields, and too many cuts', () => {
        assert.ok(!CutsSchema.safeParse([{ startMs: 500, endMs: 400, reason: 'manual' }]).success);
        assert.ok(!CutsSchema.safeParse([{ startMs: -5, endMs: 400, reason: 'manual' }]).success);
        assert.ok(!CutsSchema.safeParse([{ startMs: 0, endMs: 400, reason: 'other' }]).success);
        assert.ok(!CutsSchema.safeParse([{ startMs: 0, endMs: 400, reason: 'manual', note: 'x' }]).success);
        assert.ok(!CutsSchema.safeParse('cuts').success);
        const many = Array.from({ length: MAX_CUTS + 1 }, (_, i) => ({ startMs: i * 10, endMs: i * 10 + 5, reason: 'pause' as const }));
        assert.ok(!CutsSchema.safeParse(many).success);
    });
});

// Spec 020 item E3: trimming a section's edges, as the producer's own cuts.
describe('trimming a section', () => {
    const section = { startMs: 10_000, endMs: 20_000 };
    const pause: Cut = { startMs: 9_000, endMs: 11_000, reason: 'pause' };     // runs into the section's start
    const filler: Cut = { startMs: 19_500, endMs: 20_000, reason: 'filler' };  // at its end

    test('the kept part: from the first moment no cut covers to the last', () => {
        assert.deepEqual(keptBounds([], section), section);
        assert.deepEqual(keptBounds([pause, filler], section), { startMs: 11_000, endMs: 19_500 });
        // Touching cuts chain.
        assert.deepEqual(keptBounds([pause, { startMs: 11_000, endMs: 12_000, reason: 'manual' }], section), { startMs: 12_000, endMs: 20_000 });
        assert.equal(keptBounds([{ startMs: 5_000, endMs: 25_000, reason: 'manual' }], section), null);
    });

    test('moving the start in cuts from where the kept part began; moving it out brings that back', () => {
        const trimmed = trimSection([pause, filler], section, 'start', 13_000);
        assert.deepEqual(trimmed.at(-1), { startMs: 11_000, endMs: 13_000, reason: 'manual' });
        assert.deepEqual(keptBounds(trimmed, section), { startMs: 13_000, endMs: 19_500 });
        // Back out past where it was: the pause's part inside the section comes back too.
        const back = trimSection(trimmed, section, 'start', 10_500);
        assert.deepEqual(keptBounds(back, section), { startMs: 10_500, endMs: 19_500 });
        assert.deepEqual(back.filter(c => c.reason === 'pause'), [{ startMs: 9_000, endMs: 10_500, reason: 'pause' }]);
        // Never before the section, never past its other end.
        assert.deepEqual(keptBounds(trimSection([], section, 'start', 2_000), section), section);
        assert.deepEqual(keptBounds(trimSection([], section, 'start', 99_000), section), { startMs: 20_000 - MIN_PART_MS, endMs: 20_000 });
        assert.equal(trimSection([pause], section, 'start', 11_000).length, 1);     // no change, no cut
    });

    test('the end works the same way from the other side', () => {
        const trimmed = trimSection([filler], section, 'end', 18_000);
        assert.deepEqual(trimmed.at(-1), { startMs: 18_000, endMs: 19_500, reason: 'manual' });
        assert.deepEqual(keptBounds(trimmed, section), { startMs: 10_000, endMs: 18_000 });
        assert.deepEqual(keptBounds(trimSection(trimmed, section, 'end', 20_000), section), section);
        assert.deepEqual(keptBounds(trimSection([], section, 'end', 0), section), { startMs: 10_000, endMs: 10_000 + MIN_PART_MS });
    });

    test('a section cut whole comes back from the edge that is dragged', () => {
        const all: Cut[] = [{ startMs: 10_000, endMs: 20_000, reason: 'manual' }];
        assert.deepEqual(keptBounds(trimSection(all, section, 'start', 16_000), section), { startMs: 16_000, endMs: 20_000 });
        assert.deepEqual(keptBounds(trimSection(all, section, 'end', 12_000), section), { startMs: 10_000, endMs: 12_000 });
    });

    test('the splits make the sections, in order', () => {
        assert.deepEqual(sectionsOf([], 5000), [{ startMs: 0, endMs: 5000 }]);
        assert.deepEqual(sectionsOf([3000, 1000, 9000], 5000), [{ startMs: 0, endMs: 1000 }, { startMs: 1000, endMs: 3000 }, { startMs: 3000, endMs: 5000 }]);
        assert.deepEqual(sectionsOf([0, 5000], 5000), [{ startMs: 0, endMs: 5000 }]);
    });
});
