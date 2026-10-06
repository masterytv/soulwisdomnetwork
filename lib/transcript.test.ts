// Speaker review's lines, with word corrections (spec 019 item 2.3).
// Run: npx tsx --test lib/transcript.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCues, toSrt } from './captions';
import { buildLines, emptyCorrections, heardIndex, parseCorrections, type ReviewUtterance } from './transcript';

const u = (label: string, text: string, from: number): ReviewUtterance => ({
    label, words: text.split(' ').map((t, i) => ({ text: t, start: from + i * 300, end: from + i * 300 + 250 })),
});
const utterances = [u('A', 'we met jo anne kenzie in boulder', 0), u('B', 'yeah that was great', 3000)];

test('lines show the corrected words, timed inside the old ones', () => {
    const c = { ...emptyCorrections(), words: { '0:2': { count: 3, text: 'JoAnn McKenzie' } } };
    const [a, b] = buildLines(utterances, [], c);
    assert.equal(a.text, 'we met JoAnn McKenzie in boulder');
    assert.equal(b.text, 'yeah that was great');
    assert.deepEqual(a.words.map(heardIndex), [0, 1, 2, 2, 5, 6]);
    assert.equal(a.words[2].start, 600);
    assert.equal(a.words[3].end, 1450);
    assert.equal(a.words[2].heard, 'jo anne kenzie');
});

test('a split falls on words heard; one inside a correction falls after it', () => {
    const fixes = { '0:2': { count: 3, text: 'JoAnn McKenzie' } };
    const lines = buildLines(utterances, [], { ...emptyCorrections(), words: fixes, splits: { 0: [5] } });
    assert.deepEqual(lines.map(l => [l.id, l.text]), [['0:0', 'we met JoAnn McKenzie'], ['0:5', 'in boulder'], ['1:0', 'yeah that was great']]);
    const inside = buildLines(utterances, [], { ...emptyCorrections(), words: fixes, splits: { 0: [3] } });
    assert.deepEqual(inside.map(l => [l.id, l.text]), [['0:0', 'we met JoAnn McKenzie'], ['0:3', 'in boulder'], ['1:0', 'yeah that was great']]);
});

test('saved corrections are checked, word fixes included', () => {
    const counts = utterances.map(x => x.words.length);
    const c = parseCorrections({ words: { '0:2': { count: 3, text: 'JoAnn  McKenzie' } } }, counts);
    assert.deepEqual(c.words, { '0:2': { count: 3, text: 'JoAnn McKenzie' } });
    assert.deepEqual(parseCorrections({}, counts).words, {});
    assert.throws(() => parseCorrections({ words: { '1:3': { count: 2, text: 'x' } } }, counts), /past the end/);
    assert.throws(() => parseCorrections({ splits: { 2: [1] } }, counts), /split line/);
});

test('the accepted transcript\'s words carry the correction into the captions', () => {
    const lines = buildLines(utterances, [], { ...emptyCorrections(), words: { '0:2': { count: 3, text: 'JoAnn McKenzie' } } });
    const srt = toSrt(buildCues(lines.flatMap(l => l.words)));
    assert.match(srt, /JoAnn McKenzie/);
    assert.doesNotMatch(srt, /anne/);
});
