// The whole video as the Studio editor shows it and the render makes it (spec 020 item E10), and the edit an episode
// opens with. Run: npx tsx --test lib/programme.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTeaser, firstEdit, moveTeaser, setTeaserTag, programmeOf, studioIntro, teasersFromNotes, TeasersSchema, trimTeaser } from './programme';
import { DEFAULT_SECTION_JOINS, type SectionJoins } from './transitions';
import type { SpokenWord } from './showNotes';

const w = (text: string, start: number, end: number, speaker = 'A'): SpokenWord => ({ text, start, end, speaker } as SpokenWord);

test('teasers from the notes: 300 ms before, 600 ms after, at least a second, inside the recording', () => {
    assert.deepEqual(teasersFromNotes([
        { startMs: 10_000, endMs: 14_000, speaker: 'Sam' },
        { startMs: 200, endMs: 500, speaker: 'Alex' },            // short, at the very start
        { startMs: 59_500, endMs: 59_900, speaker: 'Sam' },       // runs past the end
        { startMs: 30_000, endMs: 30_000, speaker: 'Sam' },       // nothing to it
    ], 60_000), [
        { startMs: 9_700, endMs: 14_600, speaker: 'Sam' },
        { startMs: 0, endMs: 1_800, speaker: 'Alex' },
        { startMs: 59_200, endMs: 60_000, speaker: 'Sam' },
    ]);
});

test('teasers the Studio may save', () => {
    assert.ok(TeasersSchema.safeParse([{ startMs: 0, endMs: 1000, speaker: 'Sam' }]).success);
    assert.ok(!TeasersSchema.safeParse([{ startMs: 1000, endMs: 1000, speaker: 'Sam' }]).success);
    assert.ok(!TeasersSchema.safeParse([{ startMs: 0, endMs: 1000, speaker: 'Sam', extra: 1 }]).success);
    assert.ok(!TeasersSchema.safeParse(Array.from({ length: 13 }, () => ({ startMs: 0, endMs: 1000, speaker: 'S' }))).success);
});

test('the first edit: fillers, stammers and long pauses cut, the teasers placed, the producer\'s own cuts kept', () => {
    const words = [w('So', 0, 300), w('um', 400, 700), w('the', 800, 1000), w('the', 1050, 1250), w('point', 1300, 1700), w('is', 4000, 4200)];
    const { edit, counts } = firstEdit({ cuts: [{ startMs: 5000, endMs: 6000, reason: 'manual' }], version: 0 },
        { words, silences: null, teasers: [{ startMs: 0, endMs: 1700, speaker: 'A' }] });
    assert.deepEqual(counts, { filler: 1, repeat: 1, pause: 1 });
    assert.deepEqual(edit.cuts.map(c => c.reason).sort(), ['filler', 'manual', 'pause', 'repeat']);
    assert.deepEqual(edit.teasers, [{ startMs: 0, endMs: 1700, speaker: 'A' }]);
    // Teasers already on the edit stay.
    assert.deepEqual(firstEdit({ cuts: [], version: 0, teasers: [] }, { words, silences: null, teasers: [{ startMs: 0, endMs: 1, speaker: 'A' }] }).edit.teasers, []);
});

test('the programme in order, joined as the render joins it', () => {
    const p = programmeOf({ teasers: [5000, 4000], introMs: 3000, outroMs: 3000, episodeMs: 60_000, sections: DEFAULT_SECTION_JOINS });
    assert.deepEqual(p.pieces.map(x => [x.kind, x.atMs, x.lengthMs]), [
        ['teaser', 0, 5000], ['teaser', 5000, 4000], ['intro', 9000, 3000], ['episode', 12_000, 60_000], ['outro', 72_000, 3000],
    ]);
    assert.equal(p.lengthMs, 75_000);
    assert.equal(p.episodeAtMs, 12_000);

    // Transitions overlap the pieces they join; one longer than a piece plays as a straight cut.
    const sections: SectionJoins = {
        ...DEFAULT_SECTION_JOINS,
        afterIntro: { transition: 'dissolve', durationMs: 1000 },
        betweenTeasers: { transition: 'dissolve', durationMs: 3000 },
        beforeOutro: { transition: 'fade', durationMs: 500 },
    };
    const q = programmeOf({ teasers: [5000, 2000], introMs: 3000, outroMs: 3000, episodeMs: 60_000, sections });
    assert.deepEqual(q.pieces.map(x => [x.kind, x.atMs, x.joinMs]), [
        ['teaser', 0, 0], ['teaser', 5000, 0], ['intro', 7000, 0], ['episode', 9000, 1000], ['outro', 68_500, 500],
    ]);
    assert.equal(q.lengthMs, 71_500);
    assert.equal(q.warnings.length, 1);

    // Nothing but the episode.
    const r = programmeOf({ teasers: [], introMs: null, outroMs: null, episodeMs: 1000, sections });
    assert.deepEqual(r.pieces.map(x => x.kind), ['episode']);
    assert.equal(r.episodeAtMs, 0);
});

test('the Studio\'s intro, as the render picks it', () => {
    assert.deepEqual(studioIntro({ intro: 'custom', introPath: 'settings/intro.mp4' }, null), { path: 'settings/intro.mp4' });
    assert.equal(studioIntro({ intro: 'custom', introPath: null }, null), null);
    assert.equal(studioIntro({ intro: 'show', introPath: null }, null), 'site');
    assert.deepEqual(studioIntro({ intro: 'show', introPath: null }, { introPath: 'episodes/x/package/intro.mp4' }), { path: 'episodes/x/package/intro.mp4' });
    assert.equal(studioIntro({ intro: 'show', introPath: null }, { introPath: null }), null);
    assert.equal(studioIntro({ intro: 'none', introPath: 'settings/intro.mp4' }, null), null);
});

test('teasers moved and trimmed (item E12)', () => {
    const t = [{ startMs: 1000, endMs: 4000, speaker: 'A' }, { startMs: 9000, endMs: 12_000, speaker: 'B' }, { startMs: 20_000, endMs: 22_000, speaker: 'C' }];
    assert.deepEqual(moveTeaser(t, 2, 0).map(x => x.speaker), ['C', 'A', 'B']);
    assert.deepEqual(moveTeaser(t, 0, 1).map(x => x.speaker), ['B', 'A', 'C']);
    assert.equal(moveTeaser(t, 0, 5), t);
    assert.deepEqual(trimTeaser(t, 0, 'start', 2500)[0], { startMs: 2500, endMs: 4000, speaker: 'A' });
    assert.deepEqual(trimTeaser(t, 0, 'start', 3900)[0].startMs, 3500);       // keeps half a second
    assert.deepEqual(trimTeaser(t, 0, 'start', -200)[0].startMs, 0);
    assert.deepEqual(trimTeaser(t, 2, 'end', 25_000, 23_000)[2].endMs, 23_000);  // not past the recording's end
    assert.deepEqual(trimTeaser(t, 1, 'end', 9100)[1].endMs, 9500);
    assert.equal(trimTeaser(t, 1, 'end', 12_000), t);
});

test('teasers made on the timeline, and their "In this episode" tag (item E14)', () => {
    const words = [w('Hello', 1000, 1500, 'Ana'), w('there', 1600, 2000, 'Ana'), w('Yes', 9000, 9400, 'Ben')];
    const t = [{ startMs: 1000, endMs: 4000, speaker: 'Ana' }];
    // At a place, with the speaker heard first in it.
    assert.deepEqual(addTeaser(t, { startMs: 8800, endMs: 12_000.4 }, 0, words), [{ startMs: 8800, endMs: 12_000, speaker: 'Ben' }, t[0]]);
    assert.deepEqual(addTeaser(t, { startMs: 20_000, endMs: 22_000 }, 9, words)[1], { startMs: 20_000, endMs: 22_000, speaker: '' });
    // Too short, or too many: unchanged.
    assert.equal(addTeaser(t, { startMs: 0, endMs: 100 }, 0, words), t);
    const full = Array.from({ length: 12 }, () => t[0]);
    assert.equal(addTeaser(full, { startMs: 0, endMs: 5000 }, 0, words), full);
    // The tag off and on again, and its name.
    const off = setTeaserTag(t, 0, { tag: false });
    assert.deepEqual(off, [{ ...t[0], tag: false }]);
    assert.deepEqual(setTeaserTag(off, 0, { tag: true }), t);
    assert.deepEqual(setTeaserTag(t, 0, { speaker: '  Ana Smith ' })[0].speaker, 'Ana Smith');
    assert.equal(setTeaserTag(t, 5, { tag: false }), t);
    // A teaser with its tag off can be saved; it plays plainly in the render.
    assert.ok(TeasersSchema.safeParse(off).success);
});
