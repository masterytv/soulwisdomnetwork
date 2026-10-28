// The whole video as the Studio editor shows it and the render makes it (spec 020 item E10), and the edit an episode
// opens with. Run: npx tsx --test lib/programme.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTeaser, changeJoin, clipJoins, firstEdit, legacyFields, programmeEdit, ProgrammeSchema, setProgramme, teasersOf, withoutEnd, withTeasers, type Teaser, playedAt, recordingAt, moveTeaser, pickTeaserWord, setTeaserTag, wordsAround, programmeOf, studioIntro, teasersFromNotes, TeasersSchema, trimTeaser } from './programme';
import { DEFAULT_SECTION_JOINS, type SectionJoins } from './transitions';
import type { SpokenWord } from './showNotes';
import type { EpisodeEdit } from './edit';

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

// The whole video before spec 022: teasers, then the intro, the episode and the outro (null: none), as clips.
const old = (o: { teasers: number[]; introMs: number | null; outroMs: number | null; episodeMs: number; sections: SectionJoins }) => programmeOf({
    sections: o.sections,
    clips: [
        ...o.teasers.map((lengthMs, i) => ({ kind: 'recording' as const, id: `t${i + 1}`, lengthMs })),
        ...(o.introMs === null ? [] : [{ kind: 'intro' as const, id: 'intro', lengthMs: o.introMs }]),
        { kind: 'episode' as const, id: 'episode', lengthMs: o.episodeMs },
        ...(o.outroMs === null ? [] : [{ kind: 'outro' as const, id: 'outro', lengthMs: o.outroMs }]),
    ],
});

test('the programme in order, joined as the render joins it', () => {
    const p = old({ teasers: [5000, 4000], introMs: 3000, outroMs: 3000, episodeMs: 60_000, sections: DEFAULT_SECTION_JOINS });
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
    const q = old({ teasers: [5000, 2000], introMs: 3000, outroMs: 3000, episodeMs: 60_000, sections });
    assert.deepEqual(q.pieces.map(x => [x.kind, x.atMs, x.joinMs]), [
        ['teaser', 0, 0], ['teaser', 5000, 0], ['intro', 7000, 0], ['episode', 9000, 1000], ['outro', 68_500, 500],
    ]);
    assert.equal(q.lengthMs, 71_500);
    assert.equal(q.warnings.length, 1);
    // Each piece says which transition plays into it, for the preview; a straight cut (or one too long) is 'cut'.
    assert.deepEqual(q.pieces.map(x => x.transition), ['cut', 'cut', 'cut', 'dissolve', 'fade']);

    // Nothing but the episode.
    const r = old({ teasers: [], introMs: null, outroMs: null, episodeMs: 1000, sections });
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

test('picking a teaser clip\'s words on the notes page', () => {
    const ws = [w('One', 0, 400, 'A'), w('two', 500, 900, 'A'), w('three', 1000, 1400, 'A'), w('four', 1500, 1900, 'B'), w('five', 2000, 2400, 'B'), w('six', 20_000, 20_400, 'B')];
    const clip = { startMs: 500, endMs: 1900 };
    assert.deepEqual(wordsAround(ws, clip).map(x => [x.word.text, x.inside]),
        [['One', false], ['two', true], ['three', true], ['four', true], ['five', false]]);
    // Before the middle: starts there; after: ends there; the text follows.
    assert.deepEqual(pickTeaserWord(ws, clip, ws[0]), { startMs: 0, endMs: 1900, text: 'One two three four', speaker: 'A' });
    assert.deepEqual(pickTeaserWord(ws, clip, ws[4]), { startMs: 500, endMs: 2400, text: 'two three four five', speaker: 'A' });
    assert.deepEqual(pickTeaserWord(ws, clip, ws[3]), { startMs: 500, endMs: 1900, text: 'two three four', speaker: 'A' });
    assert.deepEqual(pickTeaserWord(ws, clip, ws[1]), { startMs: 500, endMs: 1900, text: 'two three four', speaker: 'A' });
    // Too short a clip: just the word, at least half a second.
    assert.deepEqual(pickTeaserWord(ws, { startMs: 1000, endMs: 1400 }, ws[2]).endMs - 1000, 500);
});

test('the preview\'s hand-over: the recording at a moment of the edited episode, and back (item E16)', () => {
    const ranges = [{ startMs: 1000, endMs: 3000 }, { startMs: 10_000, endMs: 11_000 }, { startMs: 5000, endMs: 6000 }];
    assert.deepEqual([0, 500, 2000, 2500, 3000, 3999, 9999].map(ms => recordingAt(ranges, ms)), [1000, 1500, 10_000, 10_500, 5000, 5999, 6000]);
    assert.deepEqual([1000, 2999, 3000, 10_500, 5500, 7000].map(ms => playedAt(ranges, ms)), [0, 1999, null, 2500, 3500, null]);
    assert.equal(recordingAt([], 100), 0);
});

// ─── Spec 022: the whole video as clips ───────────────────────────────────────

test('spec 022: an old edit converts to clips, and back to the same old fields', () => {
    const teasers: Teaser[] = [{ startMs: 1000, endMs: 4000, speaker: 'Ana' }, { startMs: 9000, endMs: 9600, speaker: 'Bo', tag: false }];
    const p = programmeEdit({ teasers, intro: null, outro: null });
    assert.deepEqual(p.clips.map(c => [c.kind, c.id]), [['recording', 't1'], ['recording', 't2'], ['intro', 'intro'], ['episode', 'episode'], ['outro', 'outro']]);
    assert.deepEqual(p.clips[0], { id: 't1', kind: 'recording', inMs: 1000, outMs: 4000, name: 'Ana' });
    // A label on the tagged teaser only, the whole clip long; a short clip's label is drawn for a second, as before.
    assert.deepEqual(p.layers.map(l => [l.anchor.clip, l.fields.speaker, l.durationMs]), [['t1', 'Ana', 3000]]);
    assert.equal(programmeEdit({ teasers: [{ startMs: 0, endMs: 600, speaker: 'C' }] }).layers[0].durationMs, 1000);
    assert.ok(ProgrammeSchema.safeParse(p).success);
    assert.deepEqual(legacyFields(p, { intro: null, outro: null }), { teasers, intro: null, outro: null });
    // Taken out: no clip; and back to false.
    const own = { path: 'episodes/abcdefghij/media/i.mp4', name: 'Mine' };
    const q = programmeEdit({ teasers: [], intro: own, outro: false });
    assert.deepEqual(q.clips.map(c => c.kind), ['intro', 'episode']);
    assert.deepEqual(legacyFields(q, { intro: own, outro: false }), { teasers: [], intro: own, outro: false });
    // Saved before the edit had teasers: the ones the editor shows (the notes' clips), D1.
    assert.deepEqual(programmeEdit({ teasers: null }, teasers).clips.length, 5);
    assert.deepEqual(programmeEdit({}).clips.map(c => c.kind), ['intro', 'episode', 'outro']);
    // Its own wins.
    assert.equal(programmeEdit({ programme: q, teasers }), q);
});

test('spec 022: the teasers\' actions on clips keep the rest of the video, and the edit keeps its old fields in step', () => {
    const p = programmeEdit({ teasers: [{ startMs: 0, endMs: 2000, speaker: 'A' }], intro: false });
    const next = withTeasers(p, [{ startMs: 5000, endMs: 6000, speaker: 'B', tag: false }, { startMs: 0, endMs: 2000, speaker: 'A' }]);
    assert.deepEqual(next.clips.map(c => c.id), ['t1', 't2', 'episode', 'outro']);
    assert.deepEqual(next.layers.map(l => l.anchor.clip), ['t2']);
    assert.deepEqual(teasersOf(next), [{ startMs: 5000, endMs: 6000, speaker: 'B', tag: false }, { startMs: 0, endMs: 2000, speaker: 'A' }]);
    const base: EpisodeEdit = { cuts: [], version: 1, intro: false, outro: null };
    const edit = setProgramme(base, withoutEnd(next, 'outro'));
    assert.deepEqual([edit.intro, edit.outro, edit.teasers?.length], [false, false, 2]);
    assert.deepEqual(programmeEdit({ ...edit, programme: null }).clips.map(c => c.id), ['t1', 't2', 'episode']);
});

test('spec 022: what may be saved', () => {
    const p = programmeEdit({ teasers: [{ startMs: 0, endMs: 2000, speaker: 'A' }] });
    assert.ok(ProgrammeSchema.safeParse(p).success);
    const bad = (q: unknown) => !ProgrammeSchema.safeParse(q).success;
    assert.ok(bad({ ...p, clips: p.clips.filter(c => c.kind !== 'episode') }), 'the episode once');
    assert.ok(bad({ ...p, clips: [...p.clips, { id: 'episode', kind: 'episode' }] }), 'not twice');
    assert.ok(bad({ ...p, clips: [{ id: 't1', kind: 'recording', inMs: 0, outMs: 100, name: '' }, ...p.clips.slice(1)] }), 'half a second at least');
    assert.ok(bad({ ...p, layers: [{ ...p.layers[0], anchor: { clip: 'gone', ms: 0 } }] }), 'a graphic on a clip that is there');
    assert.ok(bad({ ...p, layers: [{ ...p.layers[0], anchor: { clip: 'episode', ms: 0 } }] }), 'not on the episode');
    assert.ok(bad({ ...p, clips: [...p.clips.slice(0, 1), { id: 't9', kind: 'recording', inMs: 0, outMs: 900, name: 'x' }, ...p.clips.slice(1)].concat(p.clips[0]) }), 'ids once');
});

test('spec 022: each change\'s transition, its own or the default for its kind', () => {
    const sections: SectionJoins = { ...DEFAULT_SECTION_JOINS, betweenTeasers: { transition: 'dissolve', durationMs: 500 }, afterTeasers: { transition: 'wipeLeft', durationMs: 300 } };
    const clips = [
        { kind: 'recording' as const, id: 'a', lengthMs: 2000 },
        { kind: 'recording' as const, id: 'b', lengthMs: 2000, join: { transition: 'cut' as const, durationMs: 500 } },
        { kind: 'intro' as const, id: 'intro', lengthMs: null },           // no file: skipped
        { kind: 'episode' as const, id: 'episode', lengthMs: 9000 },
        { kind: 'recording' as const, id: 'c', lengthMs: 1000 },             // after the episode: a straight cut by default
    ];
    assert.deepEqual(clipJoins(clips, sections).map(j => [j.clip.id, j.join?.transition ?? null, j.label]), [
        ['a', null, ''], ['b', 'cut', 'Into b'], ['episode', 'wipeLeft', 'After the teasers'], ['c', null, 'Into c'],
    ]);
    const pg = programmeOf({ clips, sections });
    assert.deepEqual(pg.pieces.map(x => [x.id, x.atMs, x.joinMs]), [['a', 0, 0], ['b', 2000, 0], ['episode', 3700, 300], ['c', 12_700, 0]]);
    assert.equal(changeJoin('intro', 'episode'), 'afterIntro');
    assert.equal(changeJoin('episode', 'outro'), 'beforeOutro');
    assert.equal(changeJoin('outro', 'recording'), null);
});
