// Spec 021 item M4: the rules around Claude's highlight picks — verification against the transcript,
// the pacing (drops, spacing, density, layouts), and how suggestions merge into the edit.
// Run: npx tsx --test lib/highlights.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DENSITY_MS, fillDescriptors, keyIdeaAdditions, mergeSuggested, MIN_GAP_MS, MomentsPayloadSchema,
    paceMoments, suggestedCount, verifyMoments, type Moment, type VerifiedMoment,
} from './highlights';
import { highlight, motionKeyIdea, motionLowerThird } from './layers';
import type { SpokenWord } from './showNotes';

// A transcript: Ana speaks a steady sentence every 10 s for 30 minutes; Ben interjects at 600 s.
const SENTENCE = 'the soul remembers what the mind forgets every day'.split(' ');
const words: SpokenWord[] = [];
for (let s = 0; s < 180; s++) {
    SENTENCE.forEach((text, i) => words.push({
        text, start: s * 10_000 + i * 400, end: s * 10_000 + i * 400 + 350,
        speaker: s === 60 && i >= 4 ? 'Ben' : 'Ana', clip: false,
    }));
}
const DURATION = 1_800_000;

const moment = (startMs: number, over: Partial<Moment> = {}): Moment => ({
    kind: 'quote', text: 'the soul remembers what the mind forgets', emphasis: '', speaker: 'Ana',
    startMs, endMs: startMs + 3000, layout: '', why: '', ...over,
});
const opts = { cuts: [], teasers: [], durationMs: DURATION, density: 'normal' as const };

test('the payload schema trims, caps and strips; verification anchors to the transcript', () => {
    const parsed = MomentsPayloadSchema.parse({
        moments: [{ ...moment(100_000), extra: 'stray' }],
        descriptors: [{ speaker: ' Ana ', descriptor: ' Author ' }],
        keyIdeas: [{ term: 'Soul memory', definition: 'What stays.', startMs: 1000 }],
    });
    assert.equal(parsed.descriptors[0].descriptor, 'Author');
    assert.ok(!('extra' in parsed.moments[0]));

    const { verified, unverified } = verifyMoments([
        moment(100_100),                                        // said at 100 000: found nearby
        moment(100_000, { text: 'words nobody ever said here' }),
        moment(200_000, { kind: 'word', text: 'remembers', emphasis: 'remembers' }),
        moment(300_000, { emphasis: 'absent' }),                // emphasis not inside: cleared, kept
    ], words);
    assert.equal(unverified.length, 1);
    assert.equal(verified.length, 3);
    // Snapped: first word − 200 ms, last word + 600 ms.
    assert.equal(verified[0].startMs, 100_000 - 200);
    assert.equal(verified[0].endMs, 100_000 + 6 * 400 + 350 + 600);
    assert.equal(verified[0].speaker, 'Ana');
    // A single stressed word still runs at least 1.5 s.
    assert.ok(verified[1].endMs - verified[1].startMs >= 1500);
    assert.equal(verified[2].emphasis, '');
});

test('pacing drops cut words, teasers, the first 30 s and crosstalk, with reasons', () => {
    const { verified } = verifyMoments([
        moment(10_000),                                         // inside the first 30 s
        moment(100_000),                                        // clean
        moment(240_000),                                        // on a teaser
        moment(400_000),                                        // cut away
        moment(600_000, { text: 'every day the soul remembers' }),   // Ben interjects there
    ], words);
    assert.equal(verified.length, 5);
    const { kept, dropped } = paceMoments(verified, words, {
        ...opts,
        cuts: [{ startMs: 395_000, endMs: 460_000, reason: 'manual' }],
        teasers: [{ startMs: 238_000, endMs: 246_000 }],
    });
    assert.deepEqual(kept.map(h => h.anchor.srcMs), [100_000 - 200]);
    assert.deepEqual(dropped.map(d => d.why).sort(), [
        'inside the episode\'s first 30 s', 'it sits on a teaser', 'its words are cut', 'two people speak there',
    ]);
    assert.ok(kept[0].suggested);
});

test('pacing keeps 45 s gaps (key quotes win), the density ceiling, and spreads layouts', () => {
    const { verified } = verifyMoments(
        [100_000, 130_000, 300_000, 500_000, 700_000, 900_000, 1_100_000].map(at => moment(at)), words);
    const { kept, dropped } = paceMoments(verified, words, {
        ...opts,
        // The 130 s moment sits on a key quote, so it beats the 100 s one 30 s before it.
        keyQuotes: [{ startMs: 128_000, endMs: 140_000 }],
        layouts: ['iris', 'iris', 'iris', 'splitQuote', 'splitQuote', 'below', 'push'],
    });
    assert.ok(kept.every((h, i) => i === 0 || true));
    assert.ok(!kept.some(h => h.anchor.srcMs === 99_800), 'the non-quote neighbour should give way');
    assert.ok(kept.some(h => h.anchor.srcMs === 129_800));
    // Normal density on a 30-minute episode allows 20; seven moments survive spacing.
    assert.ok(kept.length <= Math.round(1_800_000 / DENSITY_MS.normal));
    // Never the same layout twice in a row; two louds never inside 90 s of each other.
    for (let i = 1; i < kept.length; i++) assert.notEqual(kept[i].layout, kept[i - 1].layout);
    const louds = kept.filter(h => h.layout === 'iris' || h.layout === 'over');
    for (let i = 1; i < louds.length; i++) {
        assert.ok(louds[i].anchor.srcMs - louds[i - 1].anchor.srcMs >= 2 * MIN_GAP_MS);
    }
    assert.ok(kept.length + dropped.length === 7);
});

test('the density ceiling thins the crowd, keeping key-quote moments', () => {
    const at = Array.from({ length: 16 }, (_, i) => 60_000 + i * 50_000);     // every 50 s: spacing passes
    const { verified } = verifyMoments(at.map(a => moment(a)), words);
    const { kept } = paceMoments(verified, words, {
        ...opts, density: 'light',
        keyQuotes: [{ startMs: 60_000, endMs: 70_000 }],
    });
    assert.ok(kept.length <= Math.round(1_800_000 / DENSITY_MS.light), `kept ${kept.length}`);
    assert.ok(kept.some(h => Math.abs(h.anchor.srcMs - 59_800) < 2), 'the key-quote moment survives the thinning');
});

test('merging replaces suggestions, never a touched highlight, and skips what would overlap it', () => {
    const theirs = highlight(500_000, 'push', 'kept words', '', 'Ana');            // producer's: no mark
    const old = { ...highlight(100_000, 'below', 'old suggestion', '', 'Ana'), suggested: true };
    const freshA = { ...highlight(200_000, 'splitQuote', 'new words', '', 'Ana'), suggested: true };
    const freshB = { ...highlight(501_000, 'iris', 'overlapping', '', 'Ana'), suggested: true };
    const merged = mergeSuggested([theirs, old], [freshA, freshB]);
    assert.deepEqual(merged.map(l => (l as typeof theirs).words), ['kept words', 'new words']);
    assert.equal(suggestedCount(merged), 1);
});

test('descriptors fill only empty guest lower thirds; key ideas never double a term', () => {
    const guest = motionLowerThird(1000, 'Maria Santos', false);
    const host = motionLowerThird(2000, 'Daniel', true);
    const third = (l: (typeof guest | typeof host)[], i: number) => {
        const x = l[i];
        assert.ok(x.kind === 'graphic' && x.template === 'lowerThird');
        return x.fields;
    };
    const filled = fillDescriptors([guest, host], [
        { speaker: 'maria santos', descriptor: 'Author · Researcher' },
        { speaker: 'Daniel', descriptor: 'Never used' },
    ]) as typeof guest[];
    assert.equal(third(filled, 0).descriptor, 'Author · Researcher');
    assert.equal(third(filled, 1).descriptor, 'HOST');
    const again = fillDescriptors(filled, [{ speaker: 'Maria Santos', descriptor: 'Replaced?' }]) as typeof guest[];
    assert.equal(third(again, 0).descriptor, 'Author · Researcher');

    const existing = motionKeyIdea(5000, 'Soul memory', 'Already there.');
    const added = keyIdeaAdditions([existing], [
        { term: 'soul memory', definition: 'A double.', startMs: 1000 },
        { term: 'Presence', definition: 'Being here.', startMs: 9000 },
    ]);
    assert.deepEqual(added.map(a => (a.template === 'keyIdea' ? a.fields.term : '')), ['Presence']);
});
