import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isFiller } from './fillers';
import { locate, type SpokenWord } from './showNotes';
import { timeMap } from './retime';
import { suggestCuts } from './edit';

const spoken = (text: string, gapMs = 0): SpokenWord[] =>
    text.split(' ').map((t, i) => ({ text: t, start: i * (300 + gapMs), end: i * (300 + gapMs) + 250, speaker: 'A', clip: false }));

describe('isFiller', () => {
    test('hesitations as AssemblyAI writes them', () => {
        for (const t of ['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'hmm', 'hm', 'mhm']) assert.ok(isFiller(t), t);
    });

    test('real words are not fillers', () => {
        for (const t of ['umbrella', 'huh', 'ah', 'her', 'hum', 'mum', 'yeah', 'uhhuh']) assert.ok(!isFiller(t), t);
    });
});

describe('locate with fillers in the transcript', () => {
    const words = spoken('And I, um, I saw the light, uh, at the end of it.');

    test('finds a quote Claude tidied the fillers out of', () => {
        const found = locate('I saw the light at the end of it.', words);
        assert.ok(found);
        assert.equal(found.startMs, words[3].start);
        assert.equal(found.endMs, words[words.length - 1].end);
    });

    test('still finds a quote that kept them', () => {
        assert.ok(locate('I saw the light, uh, at the end', words));
    });

    test('a long passage found by its ends gives the wording without fillers', () => {
        const long = spoken('so we drove out to the lake that morning and um the water was so still that uh it looked like glass all the way across to the far side');
        const found = locate('so we drove out to the lake that morning and the water was very still and it looked like glass all the way across to the far side', long);
        assert.ok(found?.text);
        assert.doesNotMatch(found.text, /\b(um|uh)\b/);
    });
});

test('timeMap pairs runs across fillers missing from the final cut', () => {
    const original = spoken('we um went down to the uh river and we sat there for a long um time talking about it');
    const final = spoken('we went down to the river and we sat there for a long time talking about it');
    const map = timeMap(original, final, 10_000);
    assert.equal(map.coverage, 1);
    assert.equal(map.at(original[3].start), final[2].start);
});

test('suggestCuts marks a written-out filler', () => {
    const cuts = suggestCuts(spoken('I, umm, think so'));
    assert.deepEqual(cuts.filter(c => c.reason === 'filler').map(c => c.startMs), [300]);
});
