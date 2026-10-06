// Spec 019 item 2.3: correcting a misheard word.
// Run: npx tsx --test lib/wordFixes.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyFixes, applyOps, findWords, fixGroup, fixOp, parseFixOps, parseWordFixes, putBackOp, replaceAllOps, replacement,
    spliceWords, timeWords, type FixedWord,
} from './wordFixes';

const w = (text: string, start: number, end: number) => ({ text, start, end });
// "we met jo anne kenzie, in boulder" heard as one utterance (index 3).
const heard = [w('We', 0, 200), w('met', 200, 400), w('Jo', 400, 500), w('Anne', 500, 700), w('Kenzie,', 700, 1000), w('in', 1100, 1200), w('Boulder.', 1200, 1800)];
const utterances = [{ words: [] }, { words: [] }, { words: [] }, { words: heard }];

test('typed words share the old span by length, the last ending where it ended, each at least 20 ms', () => {
    assert.deepEqual(timeWords({ start: 400, end: 1000 }, ['JoAnn', 'McKenzie']), [
        { text: 'JoAnn', start: 400, end: 635 }, { text: 'McKenzie', start: 635, end: 1000 },
    ]);
    // A long word next to a short one: the short one still gets 20 ms.
    const t = timeWords({ start: 0, end: 100 }, ['a', 'extraordinarily']);
    assert.ok(t[0].end - t[0].start >= 20);
    assert.equal(t[1].end, 100);
    // Too little time for 20 ms each: shared evenly, still in order and inside the span.
    const tiny = timeWords({ start: 10, end: 40 }, ['x', 'y', 'z']);
    assert.deepEqual(tiny.map(x => [x.start, x.end]), [[10, 20], [20, 30], [30, 40]]);
});

test('fixes split or merge words; the words keep a ref to the first word heard', () => {
    const out = applyFixes(heard, 3, { '3:2': { count: 3, text: 'JoAnn McKenzie,' }, '3:1': { count: 1, text: 'met up' } });
    assert.deepEqual(out.map(x => x.text), ['We', 'met', 'up', 'JoAnn', 'McKenzie,', 'in', 'Boulder.']);
    assert.deepEqual(out.map(x => x.ref), ['3:0', '3:1', '3:1', '3:2', '3:2', '3:5', '3:6']);
    assert.equal(out[3].heard, 'Jo Anne Kenzie,');
    assert.equal(out[3].count, 3);
    assert.equal(out[0].heard, undefined);
    assert.equal(out[3].start, 400);
    assert.equal(out[4].end, 1000);
    // A fix starting inside another one's span is ignored; one with no words too.
    const overlap = applyFixes(heard, 3, { '3:2': { count: 2, text: 'JoAnn' }, '3:3': { count: 1, text: 'X' }, '3:6': { count: 1, text: '  ' } });
    assert.deepEqual(overlap.map(x => x.text), ['We', 'met', 'JoAnn', 'Kenzie,', 'in', 'Boulder.']);
    // A count past the end of the utterance stops at its end.
    assert.deepEqual(applyFixes(heard, 3, { '3:6': { count: 5, text: 'Boulder, Colorado.' } }).slice(-2).map(x => x.text), ['Boulder,', 'Colorado.']);
});

test('ops set and put back fixes, replace overlapping ones, and undo restores them', () => {
    const one = applyOps({}, [{ ref: '3:2', count: 3, text: 'JoAnn McKenzie,' }], utterances);
    assert.deepEqual(one.fixes, { '3:2': { count: 3, text: 'JoAnn McKenzie,' } });
    assert.deepEqual(one.spans, [{ ref: '3:2', count: 3 }]);
    // Retyping one word of it replaces the whole fix it overlaps; the span covers both.
    const two = applyOps(one.fixes, [{ ref: '3:3', count: 1, text: 'Ann' }], utterances);
    assert.deepEqual(two.fixes, { '3:3': { count: 1, text: 'Ann' } });
    assert.deepEqual(two.spans, [{ ref: '3:2', count: 3 }]);
    assert.deepEqual(applyOps(two.fixes, two.undo, utterances).fixes, one.fixes);
    // Typing what was heard, or putting it back, leaves no fix.
    assert.deepEqual(applyOps(one.fixes, [{ ref: '3:2', count: 3, text: 'Jo  Anne Kenzie,' }], utterances).fixes, {});
    assert.deepEqual(applyOps(one.fixes, [{ ref: '3:2', count: 3, text: null }], utterances).fixes, {});
    // An op for a word that does not exist is skipped.
    assert.deepEqual(applyOps({}, [{ ref: '9:0', count: 1, text: 'x' }, { ref: '3:99', count: 1, text: 'x' }], utterances).fixes, {});
});

test('retyping words widens to whole fixes and keeps their other words', () => {
    const words: FixedWord[] = applyFixes(heard, 3, { '3:2': { count: 3, text: 'JoAnn McKenzie,' } });
    // Retype "McKenzie," alone: the op covers the whole fix, keeping "JoAnn".
    assert.deepEqual(fixOp(words, 3, 3, 'MacKenzie,'), { ref: '3:2', count: 3, text: 'JoAnn MacKenzie,' });
    // Merge "met" and "JoAnn McKenzie,": from word 1 to the fix's end.
    assert.deepEqual(fixOp(words, 1, 2, 'met JoAnn'), { ref: '3:1', count: 4, text: 'met JoAnn McKenzie,' });
    assert.deepEqual(putBackOp(words, 3), { ref: '3:2', count: 3, text: null });
    assert.equal(putBackOp(words, 0), null);
    assert.deepEqual(fixGroup(words, 3), [2, 3]);
    // Across two utterances, or without refs (accepted before word fixes): no op.
    assert.equal(fixOp([{ text: 'a', ref: '1:4' }, { text: 'b', ref: '2:0' }], 0, 1, 'ab'), null);
    assert.equal(fixOp([{ text: 'a' }], 0, 0, 'b'), null);
});

test('find and replace: case and punctuation do not matter; the punctuation around a match stays', () => {
    const words = applyFixes(heard, 3, {});
    assert.deepEqual(findWords(words, 'jo anne'), [[2, 3]]);
    assert.deepEqual(findWords(words, 'KENZIE'), [[4, 4]]);
    assert.deepEqual(findWords(words, '  '), []);
    assert.equal(replacement([{ text: '"Kenzie,' }], 'McKenzie'), '"McKenzie,');
    assert.equal(replacement([{ text: 'Kenzie' }], '   '), '');
    assert.deepEqual(replaceAllOps(words, 'jo anne kenzie', 'JoAnn McKenzie'), [{ ref: '3:2', count: 3, text: 'JoAnn McKenzie,' }]);
    // Two places, each its own fix; a match inside an existing fix keeps the fix's other words.
    const twice = [...words, { text: 'kenzie', start: 2000, end: 2300, ref: '4:0' }];
    assert.deepEqual(replaceAllOps(twice, 'kenzie', 'McKenzie').map(o => o.ref), ['3:4', '4:0']);
    const fixed = applyFixes(heard, 3, { '3:2': { count: 3, text: 'Jo Anne McKenzie,' } });
    assert.deepEqual(replaceAllOps(fixed, 'jo anne', 'JoAnn'), [{ ref: '3:2', count: 3, text: 'JoAnn McKenzie,' }]);
});

test('the server checks fixes and ops against the transcript', () => {
    const counts = [0, 0, 0, heard.length];
    assert.deepEqual(parseWordFixes({ '3:2': { count: 3, text: ' JoAnn   McKenzie, ' } }, counts), { '3:2': { count: 3, text: 'JoAnn McKenzie,' } });
    assert.deepEqual(parseWordFixes(undefined, counts), {});
    for (const bad of [[], { x: {} }, { '3:6': { count: 2, text: 'a' } }, { '7:0': { count: 1, text: 'a' } }, { '3:0': { count: 1, text: '' } },
        { '3:0': { count: 0, text: 'a' } }, { '3:0': { count: 1, text: 'a '.repeat(21) } }, { '3:0': { count: 1, text: 'a'.repeat(201) } }]) {
        assert.throws(() => parseWordFixes(bad, counts), /Invalid word corrections/, JSON.stringify(bad));
    }
    assert.deepEqual(parseFixOps([{ ref: '3:2', count: 3, text: null }, { ref: '3:0', count: 1, text: 'Well' }], counts),
        [{ ref: '3:2', count: 3, text: null }, { ref: '3:0', count: 1, text: 'Well' }]);
    for (const bad of [[], 'x', [{ ref: '3:0', count: 1, text: 5 }], [{ ref: 'a', count: 1, text: 'x' }], Array(501).fill({ ref: '3:0', count: 1, text: 'x' })]) {
        assert.throws(() => parseFixOps(bad, counts), /Invalid word corrections/);
    }
});

test('the editor swaps the words of a changed stretch for the server\'s', () => {
    const words = applyFixes(heard, 3, {}).map(x => ({ ...x, speaker: 'Tom', clip: false }));
    const fixed = applyFixes(heard, 3, { '3:2': { count: 3, text: 'JoAnn McKenzie,' } }).filter(x => x.ref === '3:2').map(x => ({ ...x, speaker: 'Tom', clip: false }));
    const out = spliceWords(words, [{ ref: '3:2', count: 3, words: fixed }]);
    assert.deepEqual(out.map(x => x.text), ['We', 'met', 'JoAnn', 'McKenzie,', 'in', 'Boulder.']);
    // And back: the span's words heard return.
    const back = spliceWords(out, [{ ref: '3:2', count: 3, words: words.slice(2, 5) }]);
    assert.deepEqual(back.map(x => x.text), heard.map(x => x.text));
});
