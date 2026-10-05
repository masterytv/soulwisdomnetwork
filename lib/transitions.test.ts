// Spec 020 item E4: transitions where sections and parts meet.
// Run: npx tsx --test lib/transitions.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CUT, DEFAULT_SECTION_JOINS, JoinsSchema, joinKey, SECTION_JOINS, SectionJoinsSchema, sectionJoins, setJoin, splitTransitions, studioOnlySummary,
    TRANSITION_LABELS, TRANSITIONS, XFADE, type Join,
} from './transitions';

test('every kind has a label and, but for Cut, an ffmpeg name; Dissolve is ffmpeg\'s smooth fade', () => {
    for (const t of TRANSITIONS) assert.ok(TRANSITION_LABELS[t]);
    for (const t of TRANSITIONS.filter(t => t !== 'cut')) assert.ok(XFADE[t as Exclude<typeof t, 'cut'>]);
    assert.equal(XFADE.dissolve, 'fade');
    assert.equal(XFADE.fade, 'fadeblack');
    assert.equal(TRANSITIONS[0], 'cut');
});

test('saved joins: one a place, 0.2 to 3 s, whole milliseconds', () => {
    const ok: Join[] = [{ at: 'afterIntro', transition: 'dissolve', durationMs: 500 }, { at: { atSplit: 60_000 }, transition: 'fade', durationMs: 1000 }];
    assert.ok(JoinsSchema.safeParse(ok).success);
    assert.ok(!JoinsSchema.safeParse([...ok, { at: { atSplit: 60_000 }, transition: 'cut', durationMs: 500 }]).success);
    assert.ok(!JoinsSchema.safeParse([{ at: 'end', transition: 'fade', durationMs: 100 }]).success);
    assert.ok(!JoinsSchema.safeParse([{ at: 'end', transition: 'fade', durationMs: 3500 }]).success);
    assert.ok(!JoinsSchema.safeParse([{ at: 'middle', transition: 'fade', durationMs: 500 }]).success);
    assert.ok(!JoinsSchema.safeParse([{ at: 'end', transition: 'spin', durationMs: 500 }]).success);
    assert.ok(!JoinsSchema.safeParse([{ at: 'end', transition: 'fade', durationMs: 500, extra: 1 }]).success);
    assert.equal(joinKey('start'), 'start');
    assert.equal(joinKey({ atSplit: 1234 }), 'split:1234');
});

test('section joins: the edit\'s own, else the Studio\'s, else a cut', () => {
    assert.deepEqual(DEFAULT_SECTION_JOINS.afterIntro, CUT);
    assert.ok(SectionJoinsSchema.safeParse(DEFAULT_SECTION_JOINS).success);
    assert.equal(SECTION_JOINS.length, 6);
    const studio = { ...DEFAULT_SECTION_JOINS, afterIntro: { transition: 'fade' as const, durationMs: 800 } };
    const mine: Join[] = [{ at: 'end', transition: 'fade', durationMs: 1500 }, { at: { atSplit: 5 }, transition: 'dissolve', durationMs: 500 }];
    const s = sectionJoins(mine, studio);
    assert.deepEqual(s.afterIntro, { transition: 'fade', durationMs: 800 });
    assert.deepEqual(s.end, { transition: 'fade', durationMs: 1500 });
    assert.deepEqual(s.start, CUT);
    assert.deepEqual(sectionJoins(undefined).end, CUT);
});

test('setting a join replaces the one there; null takes it away', () => {
    let joins = setJoin(undefined, { atSplit: 9000 }, { transition: 'dissolve', durationMs: 500 });
    joins = setJoin(joins, { atSplit: 9000 }, { transition: 'fade', durationMs: 700 });
    joins = setJoin(joins, 'start', { transition: 'fade', durationMs: 1000 });
    assert.deepEqual(joins, [{ at: { atSplit: 9000 }, transition: 'fade', durationMs: 700 }, { at: 'start', transition: 'fade', durationMs: 1000 }]);
    assert.deepEqual(setJoin(joins, 'start', null), [{ at: { atSplit: 9000 }, transition: 'fade', durationMs: 700 }]);
});

test('transitions at splits: only real ones at splits that are there, in order', () => {
    const joins: Join[] = [
        { at: { atSplit: 9000 }, transition: 'fade', durationMs: 700 },
        { at: { atSplit: 3000 }, transition: 'dissolve', durationMs: 500 },
        { at: { atSplit: 5000 }, transition: 'cut', durationMs: 500 },
        { at: { atSplit: 7000 }, transition: 'wipeLeft', durationMs: 500 },    // its split was removed
        { at: 'end', transition: 'fade', durationMs: 500 },
    ];
    assert.deepEqual(splitTransitions(joins, [3000, 5000, 9000]), [
        { atMs: 3000, transition: 'dissolve', durationMs: 500 },
        { atMs: 9000, transition: 'fade', durationMs: 700 },
    ]);
    assert.deepEqual(splitTransitions(undefined, [3000]), []);
});

test('the quick edit\'s line about what only the Studio editor shows', () => {
    assert.equal(studioOnlySummary({}), '');
    assert.equal(studioOnlySummary({ splits: [1000], joins: [{ at: { atSplit: 1000 }, transition: 'cut', durationMs: 500 }] }), '1 split');
    assert.equal(studioOnlySummary({
        splits: [1000, 2000],
        joins: [{ at: { atSplit: 1000 }, transition: 'dissolve', durationMs: 500 }, { at: 'end', transition: 'fade', durationMs: 500 }, { at: { atSplit: 9 }, transition: 'fade', durationMs: 500 }],
        overlays: [{}, {}, {}],
    }), '2 splits, 2 transitions, 3 on-screen items');
});
