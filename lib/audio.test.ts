// Spec 020 item E7: music and effects, the show library's licence rules, and the credits.
// Run: npx tsx --test lib/audio.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    EMPTY_LICENCE, fileTimeAt, licenceMissing, licenceProblem, newSound, soundCredits, soundFilter, soundGainAt, soundsMix,
    SoundSchema, SoundsSchema, soundSpan, SOUND_TRACK, uploadKind, type Licence,
} from './audio';
import { WHOLE_EPISODE_MS } from './layers';
import { youtubeDescription, type ShowNotes } from './showNotes';
import { shortMetadata } from './shorts';

const lic = (over: Partial<Licence>): Licence => ({ ...EMPTY_LICENCE, ...over });

test('licences: NC, ND and YouTube Audio Library are refused; ordinary ones pass', () => {
    assert.match(licenceProblem(lic({ name: 'CC BY-NC 4.0' }))!, /non-commercial/);
    assert.match(licenceProblem(lic({ name: 'Attribution-NonCommercial' }))!, /non-commercial/);
    assert.match(licenceProblem(lic({ url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' }))!, /non-commercial/);
    assert.match(licenceProblem(lic({ name: 'CC BY-ND 4.0' }))!, /no-derivatives/);
    assert.match(licenceProblem(lic({ url: 'https://creativecommons.org/licenses/by-nd/4.0/' }))!, /no-derivatives/);
    assert.match(licenceProblem(lic({ name: 'YouTube Audio Library' }))!, /YouTube only/);
    assert.match(licenceProblem(lic({ sourceUrl: 'https://studio.youtube.com/channel/x/music' }))!, /YouTube only/);
    for (const ok of [
        lic({ name: 'Pixabay Content License', url: 'https://pixabay.com/service/license-summary/' }),
        lic({ name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' }),
        lic({ name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }),
        lic({ name: 'Mixkit Sound Effects Free License', author: 'Sounds Inc' }),
        lic({ name: 'Standard licence and terms', sourceUrl: 'https://incompetech.com/music/royalty-free/nc/' }),
    ]) assert.equal(licenceProblem(ok), null, ok.name);
});

test('licences: what must be filled in before a check', () => {
    assert.deepEqual(licenceMissing(EMPTY_LICENCE), ['where it came from', "the licence's name", "the licence's web page", 'the download date', 'a snapshot of the licence page']);
    assert.deepEqual(licenceMissing(lic({ sourceUrl: 'https://x', name: 'CC0', url: 'https://y', downloadedOn: '2026-10-06', proofPath: 'library/proof-abc.pdf' })), []);
});

test('sounds: a music bed pinned to the end, ducked; an effect on its moment at full level', () => {
    const bed = newSound({ path: 'library/sbed1234.mp3', name: 'Calm', library: 'e1' }, 'music', { srcMs: 9000, atMs: 7000 });
    assert.equal(SoundSchema.safeParse(bed).success, true);
    assert.deepEqual([bed.track, bed.anchor, bed.durationMs, bed.loop, bed.gainDb, bed.duck, bed.library], [SOUND_TRACK.music, { atMs: 7000 }, WHOLE_EPISODE_MS, true, -18, true, 'e1']);
    const hit = newSound({ path: 'episodes/abcdefghij/media/mabc123.wav', name: 'Whoosh', durationMs: 1200 }, 'effect', { srcMs: 9000, atMs: 7000 });
    assert.equal(SoundSchema.safeParse(hit).success, true);
    assert.deepEqual([hit.track, hit.anchor, hit.durationMs, hit.loop, hit.gainDb, hit.duck, 'library' in hit], [SOUND_TRACK.effects, { srcMs: 9000 }, 1200, false, 0, false, false]);
    // Spans: the bed from 7 s to the end, whatever the edit's length.
    assert.deepEqual(soundSpan(bed, [{ startMs: 0, endMs: 60_000 }], 60_000), { startMs: 7000, endMs: 60_000 });
    // Only Studio files; ids unique; uploads of 30 s or more count as music.
    assert.equal(SoundSchema.safeParse({ ...hit, media: { path: 'settings/intro.mp4', name: 'x' } }).success, false);
    assert.equal(SoundsSchema.safeParse([hit, hit]).success, false);
    assert.deepEqual([uploadKind(29_000), uploadKind(30_000), uploadKind(null)], ['effect', 'music', 'effect']);
});

test('the preview: level with fades and ducking; place in the file, round again when looping', () => {
    const s = { gainDb: -6, fadeInMs: 1000, fadeOutMs: 2000, duck: true };
    const span = { startMs: 10_000, endMs: 20_000 };
    assert.equal(soundGainAt(s, span, 9_999, false), null);
    assert.equal(soundGainAt(s, span, 20_000, false), null);
    assert.ok(Math.abs(soundGainAt(s, span, 10_500, false)! - 0.5 * 10 ** (-6 / 20)) < 1e-9);
    assert.ok(Math.abs(soundGainAt(s, span, 15_000, false)! - 10 ** (-6 / 20)) < 1e-9);
    assert.ok(Math.abs(soundGainAt(s, span, 15_000, true)! - 10 ** (-18 / 20)) < 1e-9);
    assert.ok(Math.abs(soundGainAt(s, span, 19_000, false)! - 0.5 * 10 ** (-6 / 20)) < 1e-9);
    assert.equal(soundGainAt({ ...s, duck: false }, span, 15_000, true), 10 ** (-6 / 20));
    assert.equal(fileTimeAt({ inMs: 500, loop: false }, span, 13_000, 2000), 3500);
    assert.equal(fileTimeAt({ inMs: 500, loop: true }, span, 13_000, 2000), 1500);
    assert.equal(fileTimeAt({ inMs: 500, loop: true }, span, 13_000, null), 3500);
});

test('the render: each sound trimmed, levelled, faded and placed; the ducked ones keyed by the voice', () => {
    const hit = { ...newSound({ path: 'library/s1.wav', name: 'h', durationMs: 2000 }, 'effect', { srcMs: 0, atMs: 0 }), inMs: 250, gainDb: -3, fadeInMs: 0, fadeOutMs: 500 };
    assert.equal(soundFilter(4, 'snd0', hit, { startMs: 1500, endMs: 3500 }),
        '[4:a]atrim=start=0.250:duration=2.000,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=-3dB,' +
        'afade=t=in:d=0.010,afade=t=out:st=1.500:d=0.500,adelay=1500|1500[snd0];');
    assert.equal(soundsMix('epa', [], [], 'out'), '[epa]anull[out];');
    assert.equal(soundsMix('epa', [], ['a', 'b'], 'out'), '[epa][a][b]amix=inputs=3:normalize=0:duration=first:dropout_transition=0[out];');
    assert.equal(soundsMix('epa', ['m'], ['e'], 'out'),
        '[epa]asplit=2[out_v][out_key];[m][out_key]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=500[out_duck];' +
        '[out_v][out_duck][e]amix=inputs=3:normalize=0:duration=first:dropout_transition=0[out];');
    assert.match(soundsMix('epa', ['m1', 'm2'], [], 'out'), /\[m1\]\[m2\]amix=inputs=2:normalize=0:duration=longest:dropout_transition=0\[out_bed\];\[out_bed\]\[out_key\]sidechaincompress/);
});

test('credits: each library file that plays, once, in the order they start; uploads and silent ones owe none', () => {
    const mk = (id: string, library?: string) => ({ ...newSound({ path: 'library/s1.wav', name: id, library }, 'effect', { srcMs: 0, atMs: 0 }), id });
    const library = new Map([
        ['a', { licence: lic({ credit: 'Music: "Calm" by A (CC BY 4.0)' }) }],
        ['b', { licence: lic({ credit: 'Whoosh by B, freesound.org' }) }],
        ['c', { licence: lic({ credit: '' }) }],
    ]);
    const credits = soundCredits([
        { sound: mk('1', 'b'), span: { startMs: 5000, endMs: 6000 } },
        { sound: mk('2', 'a'), span: { startMs: 1000, endMs: 9000 } },
        { sound: mk('3', 'b'), span: { startMs: 7000, endMs: 8000 } },
        { sound: mk('4', 'c'), span: { startMs: 0, endMs: 1000 } },
        { sound: mk('5'), span: { startMs: 0, endMs: 1000 } },
        { sound: mk('6', 'a'), span: null },
    ], library);
    assert.deepEqual(credits, ['Music: "Calm" by A (CC BY 4.0)', 'Whoosh by B, freesound.org']);
});

test('credits go in the YouTube description before the hashtags, and in a Short\'s', () => {
    const notes = { description: 'About it.', chapters: [], hashtags: ['#soul'] } as unknown as ShowNotes;
    const links = { siteUrl: '', siteLinkText: '', subscribeLine: 'Subscribe.' };
    assert.equal(youtubeDescription(notes, links, ['Music: Calm by A']), 'About it.\n\nSubscribe.\n\nMusic and sound\nMusic: Calm by A\n\n#soul');
    assert.equal(youtubeDescription(notes, links), 'About it.\n\nSubscribe.\n\n#soul');
    const meta = shortMetadata({ title: 'T', speaker: 'Ana', synthetic: false }, 'Words.', { url: '', linkText: '', hashtags: ['soul'], tags: [], credits: ['Music: Calm by A'] });
    assert.equal(meta.description, '“Words.” — Ana\n\nMusic and sound\nMusic: Calm by A\n\n#soul #shorts');
});
