// Free To Use tracks as the API sends them, and the licence record a brought-in track starts with.
// Run: npx tsx --test lib/freeToUse.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { licenceMissing, licenceProblem } from './audio';
import { ftuLicence, ftuSlug, isFtuUrl, parseTrack } from './freeToUse';

const ID = '163eaaee-4845-4702-9b3d-a95126dfda2a';
const FILES = 'https://eu.data.freetouse.com/music/tracks/163eaaee-4845-4702-9b3d-a95126dfda2a';
// Trimmed from a real /music/tracks/search answer.
const raw = (more: Record<string, unknown> = {}) => ({
    id: ID, title: 'Slight Unease', status: 1, duration: 146.03448, genre: 'Soundtrack', is_premium: false,
    artists: [[1, { id: 'b', name: 'Second' }], [0, { id: 'a', name: 'Zolvi' }]],
    tags: [[1, 'tension'], [0, 'soft']],
    thumbnails: { sm: `${FILES}/cover/webp/sm/cover-sm.webp` },
    files: { mp3: `${FILES}/file/mp3/file.mp3` },
    ...more,
});

test('a track from the API', () => {
    const t = parseTrack(raw())!;
    assert.equal(t.title, 'Slight Unease');
    assert.equal(t.artist, 'Zolvi & Second');
    assert.deepEqual(t.tags, ['soft', 'tension']);
    assert.equal(t.durationMs, 146034);
    assert.equal(t.premium, false);
    assert.equal(t.pageUrl, 'https://freetouse.com/music/zolvi/slight-unease');
    assert.match(t.cover!, /cover-sm\.webp$/);
});

test('a track without an id, a title or an MP3 on Free To Use is left out', () => {
    assert.equal(parseTrack(raw({ id: 'nope' })), null);
    assert.equal(parseTrack(raw({ title: ' ' })), null);
    assert.equal(parseTrack(raw({ files: { mp3: 'https://example.com/file.mp3' } })), null);
    assert.equal(parseTrack(raw({ files: { mp3: 'http://eu.data.freetouse.com/file.mp3' } })), null);
    assert.equal(parseTrack(null), null);
});

test('only Free To Use addresses over https', () => {
    assert.ok(isFtuUrl('https://freetouse.com/music'));
    assert.ok(isFtuUrl('https://eu.data.freetouse.com/x.mp3'));
    assert.ok(!isFtuUrl('https://freetouse.com.evil.example/x.mp3'));
    assert.ok(!isFtuUrl('https://notfreetouse.com/x.mp3'));
    assert.ok(!isFtuUrl('not a url'));
});

test('names as the site writes them in addresses', () => {
    assert.equal(ftuSlug('Café del Mar!'), 'cafe-del-mar');
    assert.equal(ftuSlug('  A -- B  '), 'a-b');
});

test('the licence record starts filled in, but needs its snapshot before it can be checked', () => {
    const l = ftuLicence(parseTrack(raw())!, '2026-11-09');
    assert.equal(l.name, 'Free To Use License');
    assert.equal(l.url, 'https://freetouse.com/license');
    assert.equal(l.sourceUrl, 'https://freetouse.com/music/zolvi/slight-unease');
    assert.equal(l.author, 'Zolvi & Second');
    assert.equal(l.credit, 'Music track: Slight Unease by Zolvi & Second · Source: https://freetouse.com/music · Free To Use');
    assert.equal(licenceProblem(l), null);
    assert.deepEqual(licenceMissing(l), ['a snapshot of the licence page']);
});
