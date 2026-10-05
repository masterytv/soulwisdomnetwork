// "Suggest a tighter edit" (docs/specs/019-editor-light-v2.md, item 1.3): the prompt, protected key
// quotes and teaser clips, kinds, and the notes the editor shows.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    addRetakes, kindCounts, protectedLines, protectedSpans, retakeNotes, retakesSystemPrompt, retakesUserMessage, RetakesSchema, timeRetakes,
    type RetakeLine,
} from './retakes';
import { producerInstructions, withDefaults } from './studioSettings';

const w = (text: string, start: number) => ({ text, start, end: start + 300 });
const lines: RetakeLine[] = [
    { name: 'Ana', words: [w('Can', 0), w('you', 300), w('hear', 600), w('me?', 900)] },
    { name: 'Ben', words: [w('Yes.', 1500)] },
    { name: 'Ana', words: [w('I', 2000), w('went—', 2300), w('we', 2600), w('drove', 2900), w('there,', 3200), w('you', 3500), w('know,', 3800), w('at', 4100), w('night.', 4400)] },
    { name: 'Ben', words: [w('Death', 5000), w('is', 5300), w('a', 5600), w('door,', 5900), w('you', 6200), w('know.', 6500)] },
];

test('tighter edit: the prompt names every kind, protects quotes, and ends with the producer\'s instructions', () => {
    const plain = retakesSystemPrompt();
    for (const kind of ['retake', 'false-start', 'restart', 'verbal-tic', 'housekeeping', 'tangent']) assert.ok(plain.includes(`- ${kind}:`), kind);
    assert.match(plain, /protected lines/);
    assert.match(plain, /Be conservative/);
    const settings = withDefaults({ extraInstructions: 'Keep every "you know" from Ben.' });
    assert.ok(retakesSystemPrompt(producerInstructions(settings)).endsWith('Keep every "you know" from Ben.'));
    assert.equal(retakesSystemPrompt(producerInstructions(withDefaults({}))), plain);
});

test('tighter edit: quotes and teaser clips mark their lines protected, and suggestions touching them are dropped', () => {
    const spans = protectedSpans({ quotes: [{ startMs: 5000, endMs: 6800 }], teaserClips: [{ startMs: 4400, endMs: -1 }] });
    assert.deepEqual(spans, [{ startMs: 5000, endMs: 6800 }, { startMs: 4400, endMs: 4400 }]);
    assert.deepEqual(protectedSpans(undefined), []);
    assert.deepEqual(protectedLines(lines, spans), [2, 3]);
    assert.deepEqual(protectedLines(lines, []), []);
    assert.ok(retakesUserMessage(lines, [2, 3]).includes('</transcript>\n\n<protected_lines>2, 3</protected_lines>\n\nList'));
    assert.ok(!retakesUserMessage(lines).includes('protected'));

    const answer = RetakesSchema.parse({ retakes: [
        { line: 0, kind: 'housekeeping', text: 'Can you hear me?', why: ' checking the line ' },
        { line: 2, kind: 'false-start', text: 'I went', why: 'changed tack' },
        { line: 2, kind: 'verbal-tic', text: 'you know', why: 'adds nothing' },   // on the teaser's last word's line, but clear of it
        { line: 3, kind: 'verbal-tic', text: 'you know', why: 'adds nothing' },   // inside the quote
    ] });
    const { retakes, notFound, protectedCount } = timeRetakes(lines, answer, spans);
    assert.equal(notFound, 0);
    assert.equal(protectedCount, 1);
    assert.deepEqual(retakes, [
        { startMs: 0, endMs: 1200, kind: 'housekeeping', why: 'checking the line' },
        { startMs: 2000, endMs: 2600, kind: 'false-start', why: 'changed tack' },
        { startMs: 3500, endMs: 4100, kind: 'verbal-tic', why: 'adds nothing' },
    ]);
    // Every kind is still a 'retake' cut, so saved edits and CutsSchema are unchanged.
    assert.deepEqual(new Set(addRetakes([], retakes).map(c => c.reason)), new Set(['retake']));
    assert.throws(() => RetakesSchema.parse({ retakes: [{ line: 0, kind: 'tighten', text: 'x', why: 'x' }] }));
});

test('tighter edit: counts by kind and notes for the review row, old retakes without a kind included', () => {
    const found = [
        { startMs: 0, endMs: 1200, kind: 'housekeeping' as const, why: 'checking the line' },
        { startMs: 2000, endMs: 2600, kind: 'false-start' as const, why: 'changed tack' },
        { startMs: 3000, endMs: 3100, kind: 'false-start' as const, why: 'again' },
        { startMs: 7000, endMs: 7400, why: 'said twice' },
    ];
    assert.equal(kindCounts(found), '1 housekeeping, 2 false starts, 1 retake');
    assert.equal(kindCounts([]), '');
    assert.deepEqual(retakeNotes(found.slice(1, 2).concat(found[3])), { '2000-2600': 'False start: changed tack', '7000-7400': 'Retake: said twice' });
});
