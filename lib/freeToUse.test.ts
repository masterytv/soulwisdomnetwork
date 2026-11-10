// Free To Use (lib/freeToUse.ts): reading the catalogue, the track pages and the licence record of an import.
// Run: npx tsx --test lib/freeToUse.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { licenceMissing, licenceProblem } from './audio';
import {
    freeToUseCredit, freeToUseLicence, importedId, searchUrl, slug, toTrack, toTrackList, trackPageUrl, FREE_TO_USE_PAGE,
} from './freeToUse';

// A track as the API sent it on 9 November 2026 (waveform left out).
const FEATHERS = {
    "id": "bb28e71c-5e67-49f3-a2fe-04f227b05de3",
    "title": "Feathers",
    "duration": 142.63048,
    "release_date": "2026-10-30T00:00:00.000Z",
    "genre": "Folk",
    "is_premium": false,
    "artists": [
        [
            0,
            {
                "id": "d1bc1d33-3b8b-438c-980e-44537e3dae28",
                "name": "Zambolino"
            }
        ]
    ],
    "categories": [
        [
            0,
            {
                "id": "c6bf6821-fc52-4138-819a-acbea99517a5",
                "name": "Emotional"
            }
        ],
        [
            7,
            {
                "id": "5a72fd26-e5be-9a3a-b0db-90ea2400a833",
                "name": "Nature"
            }
        ]
    ],
    "tags": [
        [
            1,
            "acoustic"
        ],
        [
            2,
            "guitar"
        ]
    ],
    "thumbnails": {
        "sm": "https://eu.data.freetouse.com/music/tracks/bb28e71c-5e67-49f3-a2fe-04f227b05de3/cover/webp/sm/cover-sm.webp",
        "md": "https://eu.data.freetouse.com/music/tracks/bb28e71c-5e67-49f3-a2fe-04f227b05de3/cover/webp/md/cover-md.webp",
        "lg": "https://eu.data.freetouse.com/music/tracks/bb28e71c-5e67-49f3-a2fe-04f227b05de3/cover/webp/lg/cover-lg.webp",
        "xl": "https://eu.data.freetouse.com/music/tracks/bb28e71c-5e67-49f3-a2fe-04f227b05de3/cover/webp/xl/cover-xl.webp"
    },
    "files": {
        "mp3": "https://eu.data.freetouse.com/music/tracks/bb28e71c-5e67-49f3-a2fe-04f227b05de3/file/mp3/file.mp3"
    }
};

test('a track from the API reads into what the Studio shows', () => {
    const t = toTrack(FEATHERS)!;
    assert.equal(t.id, FEATHERS.id);
    assert.equal(t.title, 'Feathers');
    assert.deepEqual(t.artists, ['Zambolino']);
    assert.equal(t.durationMs, 142630);
    assert.equal(t.premium, false);
    assert.equal(t.released, '2026-10-30');
    assert.equal(t.pageUrl, 'https://freetouse.com/music/zambolino/feathers');
    assert.match(t.previewUrl!, /^https:\/\/eu\.data\.freetouse\.com\/.*\.mp3$/);
    assert.ok(t.moods.includes('Emotional'));
});

test('artists in their order; an MP3 from elsewhere is not played or fetched; unknown premium counts as premium', () => {
    const t = toTrack({
        ...FEATHERS, is_premium: undefined, files: { mp3: 'https://evil.example.com/x.mp3' },
        artists: [[1, { id: 'b', name: 'Waesto' }], [0, { id: 'a', name: 'Luke Bergs' }]],
    })!;
    assert.deepEqual(t.artists, ['Luke Bergs', 'Waesto']);
    assert.equal(t.previewUrl, null);
    assert.equal(t.premium, true);
    assert.equal(toTrack({ title: 'no id' }), null);
});

test('track pages: first artist and title, slugged as the site does', () => {
    assert.equal(trackPageUrl(['Luke Bergs', 'Waesto'], 'Follow The Sun'), 'https://freetouse.com/music/luke-bergs/follow-the-sun');
    assert.equal(slug('  Café Déjà-vu!  '), 'cafe-deja-vu');
    assert.equal(trackPageUrl([], 'X'), 'https://freetouse.com/music');
});

test('lists: the tracks it can read and the total', () => {
    const r = toTrackList({ ok: true, data: [FEATHERS, { nope: 1 }], pagination: { limit: 20, offset: 0, count: 182 } });
    assert.equal(r.tracks.length, 1);
    assert.equal(r.total, 182);
    assert.deepEqual(toTrackList(null), { tracks: [], total: 0 });
});

test('search addresses: words search, none lists everything, one page at a time', () => {
    const u = new URL(searchUrl(' calm piano ', 40, 'random'));
    assert.equal(u.origin + u.pathname, 'https://api.freetouse.com/v3/music/tracks/search');
    assert.equal(u.searchParams.get('query'), 'calm piano');
    assert.equal(u.searchParams.get('offset'), '40');
    assert.equal(u.searchParams.get('limit'), String(FREE_TO_USE_PAGE));
    assert.equal(u.searchParams.get('order'), 'random');
    const all = new URL(searchUrl('', -5));
    assert.equal(all.pathname, '/v3/music/tracks/all');
    assert.equal(all.searchParams.get('offset'), '0');
    assert.equal(all.searchParams.get('query'), null);
});

test('the licence record of an import: filled in, allowed, credit as the licence asks, snapshot left to the admin', () => {
    const t = toTrack(FEATHERS)!;
    const l = freeToUseLicence(t, '2026-11-09');
    assert.equal(licenceProblem(l), null);
    assert.deepEqual(licenceMissing(l), ['a snapshot of the licence page']);
    assert.equal(l.credit, 'Music: "Feathers" by Zambolino, from Free To Use (https://freetouse.com/music)');
    assert.equal(importedId(l), t.id);
    assert.equal(importedId({ code: 'ABC-123' }), null);
    assert.equal(freeToUseCredit({ title: 'Take Off', artists: ['Luke Bergs', 'Waesto', 'X'] }),
        'Music: "Take Off" by Luke Bergs, Waesto & X, from Free To Use (https://freetouse.com/music)');
});
