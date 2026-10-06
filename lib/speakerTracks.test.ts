// Spec 019 item 3.3: which files are speaker tracks, and their names.
// Run: npx tsx --test lib/speakerTracks.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRACKS, pickTracks, trackName, usesTracks } from './speakerTracks';

test('a person\'s name from Zoom\'s file names', () => {
    assert.equal(trackName('audioTomWood11234567890.m4a'), 'Tom Wood');
    assert.equal(trackName('audioAna_Example21234567890.m4a'), 'Ana Example');
    assert.equal(trackName('GMT20261006-100000_Recording_separate1_Ana Example.m4a'), 'Ana Example');
    assert.equal(trackName('daniel.wav'), 'daniel');
});

test('the tracks in a recording folder: the subfolder\'s audio, else two or more beside the video', () => {
    const f = (name: string) => ({ name });
    const top = [f('video1.mp4'), f('audio1.m4a'), f('playback.m3u')];
    assert.deepEqual(pickTracks(top, [f('audioTomWood1234567.m4a'), f('audioAna1234567.m4a'), f('notes.txt')]).map(x => x.name), ['audioTomWood1234567.m4a', 'audioAna1234567.m4a']);
    // One audio file beside the video is the mix, not a track.
    assert.deepEqual(pickTracks(top, []), []);
    assert.deepEqual(pickTracks([...top, f('b.m4a')], []).map(x => x.name), ['audio1.m4a', 'b.m4a']);
    assert.equal(pickTracks([], Array.from({ length: 12 }, (_, i) => f(`a${i}.wav`))).length, MAX_TRACKS);
});

test('a render uses them when there are some, unless the edit says not', () => {
    const t = [{ path: 'p', name: 'n', fileName: 'f' }];
    assert.equal(usesTracks(t, {}), true);
    assert.equal(usesTracks(t, { speakerTracks: null }), true);
    assert.equal(usesTracks(t, { speakerTracks: false }), false);
    assert.equal(usesTracks([], {}), false);
    assert.equal(usesTracks(undefined, undefined), false);
});
