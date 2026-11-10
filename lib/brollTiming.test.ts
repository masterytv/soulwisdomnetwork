// B-roll timing (docs/specs/023-stock-broll.md, "Timing"): each idea starts one second after its cue words, found
// word for word in the transcript; the edit takes its time from the approved notes.
// Run: npx tsx --test lib/brollTiming.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brollTiming } from './broll';
import { BROLL_CUE_DELAY_MS, cueTime, mergeRedraft, redraftDirection, StoredShowNotesSchema, timeBroll, type ShowNotes, type SpokenWord } from './showNotes';

// Words at 400 ms each from `fromMs`, all said by Mikias.
function said(text: string, fromMs: number): SpokenWord[] {
    return text.split(' ').map((t, i) => ({ text: t, start: fromMs + i * 400, end: fromMs + i * 400 + 350, speaker: 'Mikias', clip: false }));
}

// The paragraph starts at 3:10; "pets" comes 5.2 s in, "analyzed" a while later.
const WORDS = [
    ...said('So then the next thing that surprised me was how many people met their pets in the afterlife.', 190_000),
    ...said('Um and I analyzed each of the experiences and tried to pull out common elements.', 204_000),
];
const PETS_AT = WORDS.find(w => w.text === 'pets')!.start;
const ANALYZED_AT = WORDS.find(w => w.text === 'analyzed')!.start;

const notes = (broll: Partial<ShowNotes['broll'][number]>[]): ShowNotes => StoredShowNotesSchema.parse({
    titles: ['t'], chosenTitle: 0, description: 'd', summary: 's', chapters: [], quotes: [], tags: [], themes: [], topics: [],
    broll: broll.map(b => ({ startMs: 190_000, durationSeconds: 8, idea: 'x', why: '', style: 'photo', search: '', cue: '', ...b })),
});

test('a concrete subject: one second after "pets" is said, not at the start of the paragraph', () => {
    assert.equal(cueTime('their pets in the afterlife', WORDS, 190_000), WORDS.find(w => w.text === 'their')!.start + BROLL_CUE_DELAY_MS);
    assert.equal(cueTime('pets', WORDS, 190_000), PETS_AT + 1000);
});

test('an abstract moment: one second after the words of the action it illustrates', () => {
    assert.equal(cueTime('analyzed each of the experiences', WORDS, 204_000), ANALYZED_AT + 1000);
    // Filler words, punctuation and case do not matter; words that were never said find nothing.
    assert.equal(cueTime('Analyzed each of the experiences,', WORDS), ANALYZED_AT + 1000);
    assert.equal(cueTime('studied every account', WORDS), null);
    assert.equal(cueTime('', WORDS), null);
});

test('timing a draft: ideas move to their cues, those not found keep their time, and none runs into the next', () => {
    const n = notes([
        { idea: 'a happy dog in a meadow', cue: 'pets in the afterlife', durationSeconds: 15 },
        { idea: 'a laptop with a network map', cue: 'analyzed each of the experiences', startMs: 204_000, durationSeconds: 8 },
        { idea: 'a sunrise', cue: 'words nobody said', startMs: 230_000 },
    ]);
    const missing = timeBroll(n, WORDS);
    assert.deepEqual(missing, ['words nobody said']);
    assert.deepEqual(n.broll.map(b => b.startMs), [PETS_AT + 1000, ANALYZED_AT + 1000, 230_000]);
    // The dog would run 15 s, into the laptop: shortened to fit.
    assert.equal(n.broll[0].durationSeconds, Math.floor((ANALYZED_AT - PETS_AT) / 1000));
    assert.equal(n.broll[1].durationSeconds, 8);
});

test('notes drafted before cue words still load, with none', () => {
    const n = notes([{ idea: 'old' }]);
    assert.equal(n.broll[0].cue, '');
    assert.deepEqual(timeBroll(n, WORDS), []);
    assert.equal(n.broll[0].startMs, 190_000);
});

test('redrafting only the b-roll keeps everything else', () => {
    const current = notes([{ idea: 'old idea' }]);
    current.description = 'edited by Tom';
    const fresh = notes([{ idea: 'new idea', cue: 'pets' }, { idea: 'another' }]);
    fresh.description = 'Claude\'s new one';
    const merged = mergeRedraft(current, fresh, 'broll');
    assert.equal(merged.description, 'edited by Tom');
    assert.deepEqual(merged.broll.map(b => b.idea), ['new idea', 'another']);
    assert.match(redraftDirection({ instruction: '', only: 'broll' }), /b-roll ideas and their cue words/);
    assert.equal(redraftDirection({ instruction: '', only: 'titles' }), '');
});

test('the edit places b-roll where the approved notes have it now', () => {
    const made = { index: 1, idea: 'a laptop', startMs: 190_000, durationSeconds: 6 };
    const ideas = [{ idea: 'x', startMs: 0, durationSeconds: 5 }, { idea: ' a laptop ', startMs: 205_000, durationSeconds: 9 }];
    assert.deepEqual(brollTiming(made, ideas), { startMs: 205_000, durationSeconds: 9 });
    // The idea changed since (its b-roll is out of date), or is gone: the record's own time.
    assert.deepEqual(brollTiming(made, [ideas[0], { ...ideas[1], idea: 'other' }]), { startMs: 190_000, durationSeconds: 6 });
    assert.deepEqual(brollTiming(made, undefined), { startMs: 190_000, durationSeconds: 6 });
});
