// Stock b-roll (docs/specs/023-stock-broll.md): reading Pexels and Pixabay answers, the picks Claude may make, the
// layers footage becomes, what counts as AI, and the credits.
// Run: npx tsx --test lib/stockBroll.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brollStale, isAiBroll } from './broll';
import { brollLayer } from './layers';
import {
    acceptPicks, bestPexelsFile, landscape, mergeCandidates, pexelsPhotos, pexelsUrl, pexelsVideos, pixabayPhotos, pixabayUrl, pixabayVideos,
    stockCredits, stockQuery, type PickMoment, type StockCandidate,
} from './stockBroll';

const PEXELS_VIDEOS = {
    videos: [{
        id: 857195, url: 'https://www.pexels.com/video/waves-crashing-on-the-shore-857195/', image: 'https://images.pexels.com/videos/857195/x.jpeg',
        duration: 19, user: { name: 'Ana Lee', url: 'https://www.pexels.com/@ana' },
        video_files: [
            { link: 'https://videos.pexels.com/video-files/857195/sd.mp4', width: 960, height: 540, file_type: 'video/mp4' },
            { link: 'https://videos.pexels.com/video-files/857195/hd.mp4', width: 1920, height: 1080, file_type: 'video/mp4' },
            { link: 'https://videos.pexels.com/video-files/857195/uhd.mp4', width: 3840, height: 2160, file_type: 'video/mp4' },
            { link: 'https://videos.pexels.com/video-files/857195/portrait.mp4', width: 1080, height: 1920, file_type: 'video/mp4' },
        ],
    }, {
        id: 2, url: 'https://www.pexels.com/video/portrait-only-2/', image: '', duration: 10, user: { name: 'X', url: '' },
        video_files: [{ link: 'https://videos.pexels.com/p.mp4', width: 1080, height: 1920, file_type: 'video/mp4' }],
    }],
};

test('Pexels footage: the 1920 landscape file, its length, credit and words from the page address; portrait-only left out', () => {
    const [v, ...rest] = pexelsVideos(PEXELS_VIDEOS);
    assert.equal(rest.length, 0);
    assert.equal(v.id, 'pexels-video-857195');
    assert.equal(v.url, 'https://videos.pexels.com/video-files/857195/hd.mp4');
    assert.equal(v.kind, 'video');
    assert.equal(v.seconds, 19);
    assert.equal(v.alt, 'waves crashing on the shore');
    assert.deepEqual(v.credit, { name: 'Ana Lee', url: 'https://www.pexels.com/@ana' });
    // Nothing at least 1280 under 1920: the largest that fits.
    assert.equal(bestPexelsFile([{ link: 'https://a/1.mp4', width: 960, height: 540, file_type: 'video/mp4' }])?.width, 960);
    assert.equal(bestPexelsFile([]), null);
});

test('Pexels photos: landscape only, the large2x size, the alt text', () => {
    const photos = pexelsPhotos({ photos: [
        { id: 1, width: 6000, height: 4000, url: 'https://www.pexels.com/photo/candle-light-1/', alt: 'A candle in the dark', photographer: 'Bo', photographer_url: 'https://www.pexels.com/@bo', src: { large2x: 'https://images.pexels.com/1-l.jpeg', medium: 'https://images.pexels.com/1-m.jpeg' } },
        { id: 2, width: 3000, height: 4000, url: 'https://www.pexels.com/photo/tall-2/', src: { large2x: 'https://x' } },
    ] });
    assert.equal(photos.length, 1);
    assert.equal(photos[0].url, 'https://images.pexels.com/1-l.jpeg');
    assert.equal(photos[0].alt, 'A candle in the dark');
});

test('Pixabay: AI-made and low-quality uploads left out; landscape files at most 1920 wide', () => {
    const data = { hits: [
        { id: 10, pageURL: 'https://pixabay.com/videos/id-10/', tags: 'sunrise, clouds', user: 'kim', user_id: 7, duration: 12,
            videos: { large: { url: 'https://cdn.pixabay.com/l.mp4', width: 3840, height: 2160, thumbnail: 'https://cdn.pixabay.com/l.jpg' },
                medium: { url: 'https://cdn.pixabay.com/m.mp4', width: 1920, height: 1080, thumbnail: 'https://cdn.pixabay.com/m.jpg' } } },
        { id: 11, pageURL: 'https://pixabay.com/videos/id-11/', isAiGenerated: true, videos: { medium: { url: 'https://cdn.pixabay.com/ai.mp4', width: 1920, height: 1080 } } },
        { id: 12, pageURL: 'https://pixabay.com/photos/id-12/', isLowQuality: true, largeImageURL: 'https://x', imageWidth: 1920, imageHeight: 1080 },
    ] };
    const [v, ...more] = pixabayVideos(data);
    assert.equal(more.length, 0);
    assert.equal(v.url, 'https://cdn.pixabay.com/m.mp4');
    assert.equal(v.credit.url, 'https://pixabay.com/users/kim-7/');
    assert.deepEqual(pixabayPhotos(data), []);
    assert.equal(pixabayPhotos({ hits: [{ id: 3, pageURL: 'p', tags: 'sea', largeImageURL: 'https://cdn.pixabay.com/s.jpg', imageWidth: 1920, imageHeight: 1280 }] })[0].kind, 'image');
});

test('search: the idea\'s own search words, landscape, a key for Pixabay', () => {
    assert.equal(stockQuery({ idea: 'A man in a hospital bed, monitors beeping', search: '' }), 'A man in a hospital bed monitors beeping');
    assert.equal(stockQuery({ idea: 'anything', search: ' hospital corridor night ' }), 'hospital corridor night');
    assert.equal(new URL(pexelsUrl('video', 'sea', 8)).searchParams.get('orientation'), 'landscape');
    assert.equal(new URL(pexelsUrl('image', 'sea', 8)).pathname, '/v1/search');
    assert.equal(new URL(pixabayUrl('image', 'sea', 8, 'k')).searchParams.get('orientation'), 'horizontal');
    assert.equal(new URL(pixabayUrl('video', 'sea', 8, 'k')).pathname, '/api/videos/');
    assert.ok(landscape(1920, 1080) && landscape(1440, 1080) && !landscape(1080, 1080) && !landscape(1080, 1920));
});

const cand = (id: string, kind: 'video' | 'image', seconds: number | null = null): StockCandidate => ({
    id, source: 'pexels', kind, url: `https://x/${id}`, thumb: '', width: 1920, height: 1080, alt: id, credit: { name: 'A', url: null }, pageUrl: 'p', seconds,
});

test('candidates: footage first, the sites taken in turn, no repeats', () => {
    const merged = mergeCandidates([[cand('a1', 'image'), cand('a2', 'video')], [cand('b1', 'video'), cand('b2', 'video'), cand('a2', 'video')]], 10);
    assert.deepEqual(merged.map(c => c.id), ['a2', 'b1', 'b2', 'a1']);
    assert.equal(mergeCandidates([[cand('a', 'video'), cand('b', 'video')]], 1).length, 1);
});

test('picks: only offered candidates, never twice, never one in use, and no footage under half its moment', () => {
    const moments: PickMoment[] = [
        { index: 0, idea: 'sea', why: '', seconds: 8, candidates: [cand('v1', 'video', 20), cand('short', 'video', 3), cand('p1', 'image')] },
        { index: 1, idea: 'sea again', why: '', seconds: 8, candidates: [cand('v1', 'video', 20), cand('used', 'video', 30)] },
        { index: 2, idea: 'sky', why: '', seconds: 6, candidates: [cand('p2', 'image')] },
    ];
    const got = acceptPicks([
        { index: 0, candidate: 'v1', why: '' },
        { index: 1, candidate: 'v1', why: 'repeat' },          // already taken
        { index: 2, candidate: 'elsewhere', why: '' },          // not offered for this moment
        { index: 9, candidate: 'p1', why: '' },                 // no such moment
    ], moments);
    assert.deepEqual([...got].map(([i, c]) => [i, c.id]), [[0, 'v1']]);
    assert.equal(acceptPicks([{ index: 1, candidate: 'used', why: '' }], moments, new Set(['used'])).size, 0);
    assert.equal(acceptPicks([{ index: 0, candidate: 'short', why: '' }], moments).size, 0);
    assert.equal(acceptPicks([{ index: 0, candidate: null, why: 'none fits' }], moments).size, 0);
});

test('stock b-roll is not AI; a style change only makes an AI image out of date', () => {
    assert.equal(isAiBroll({}), true);
    assert.equal(isAiBroll({ source: 'ai' }), true);
    assert.equal(isAiBroll({ source: 'pexels' }), false);
    const idea = { idea: 'The sea at dawn', style: 'digital' as const };
    assert.equal(brollStale(undefined, idea), true);
    assert.equal(brollStale({ idea: 'The sea at dawn', style: 'photo', source: 'pexels' }, idea), false);
    assert.equal(brollStale({ idea: 'The sea at dawn', style: 'photo' }, idea), true);
    assert.equal(brollStale({ idea: 'Other words', source: 'pixabay' }, idea), true);
});

test('footage becomes a silent full-frame video layer, never longer than the footage; a still keeps its slow zoom', () => {
    const v = brollLayer({ index: 2, startMs: 61_000, durationSeconds: 10, path: 'episodes/abcdefghij/broll/03-1-pexels.mp4', kind: 'video', footageSeconds: 7.5 });
    assert.equal(v.kind, 'video');
    assert.equal(v.durationMs, 7500);
    assert.ok(v.kind === 'video' && v.volumeDb === null && v.trimInMs === 0 && v.w === 1);
    const long = brollLayer({ index: 2, startMs: 0, durationSeconds: 6, path: 'episodes/abcdefghij/broll/x.mp4', kind: 'video', footageSeconds: 30 });
    assert.equal(long.durationMs, 6000);
    const still = brollLayer({ index: 0, startMs: 0, durationSeconds: 6, path: 'episodes/abcdefghij/broll/01.png' });
    assert.ok(still.kind === 'image' && still.motion === 'kenBurnsIn');
});

test('credits: one line per site, each person once, AI images left out', () => {
    assert.deepEqual(stockCredits([
        { source: 'pexels', credit: { name: 'Bo' } }, { source: 'pixabay', credit: { name: 'kim' } },
        { source: 'pexels', credit: { name: 'Ana Lee' } }, { source: 'pexels', credit: { name: 'Bo' } }, { source: 'ai', credit: null }, {},
    ]), ['Ana Lee, Bo on Pexels', 'kim on Pixabay']);
    assert.deepEqual(stockCredits([]), []);
});
