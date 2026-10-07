// Deleting and starting over an episode: refused while a job works on it, and what a start-over keeps.
// Run: npx tsx --test lib/episodeReset.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Episode } from '../types/episode';
import { docIdOf, keptOnStartOver, runningJobs, STALE_MS, startedOver, toMs } from './episodeReset';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const base = (more: Partial<Episode> = {}): Episode => ({
    title: 'Recording 2026-06-23', recordedAt: '2026-06-23', status: 'speakers_confirmed', stage: 'finalize',
    drive: { fileId: 'abcdefghijkl', fileName: 'GMT20260623-140410_SWC - Recording.mp4', mimeType: 'video/mp4', sizeBytes: 1 },
    candidateSpeakers: ['Tom'], costs: { items: [{ item: 'transcription_raw', usd: 0.4, at: 0 } as never], totalUsd: 0.4 },
    error: null, createdAt: { _seconds: 100 }, updatedAt: new Date(NOW - 60_000), ...more,
});

test('times from Firestore, a Date or a number', () => {
    assert.equal(toMs({ toMillis: () => 5 }), 5);
    assert.equal(toMs({ _seconds: 2 }), 2000);
    assert.equal(toMs(new Date(7)), 7);
    assert.equal(toMs(9), 9);
    assert.equal(toMs(undefined), 0);
});

test('a job working on the episode holds it; a finished, failed or long-dead one does not', () => {
    assert.deepEqual(runningJobs(base(), NOW), []);
    assert.deepEqual(runningJobs(base({ status: 'transcribing' }), NOW), ['Processing']);
    const render = { status: 'rendering', requestedAt: NOW - 3600_000 } as Episode['editRender'];
    assert.deepEqual(runningJobs(base({ editRender: render, notes: { status: 'ready' } as Episode['notes'] }), NOW), ['Render']);
    assert.deepEqual(runningJobs(base({ editRender: { ...render!, status: 'failed' } }), NOW), []);
    // Nothing moved for longer than any job may run: it died.
    const old = new Date(NOW - STALE_MS - 1);
    assert.deepEqual(runningJobs(base({ updatedAt: old, status: 'ingesting', editRender: { ...render!, requestedAt: old } }), NOW), []);
});

test('starting over keeps the recording and its tracks, and clears everything since', () => {
    const tracks = [{ path: 'episodes/abcdefghijkl/source/tracks/1-tom.m4a', fileName: 'tom.m4a', name: 'Tom' }];
    const e = base({
        media: { sourcePath: 'episodes/abcdefghijkl/source/x.mp4', proxyPath: 'p', audioPath: 'a', speakerTracks: tracks },
        transcription: { provider: 'assemblyai', transcriptId: 't', speechModels: [] },
        review: { docUrl: 'https://docs.google.com/document/d/1AbC-d_9/edit' },
        notes: { status: 'approved' } as Episode['notes'],
        youtube: { status: 'ready', videoId: 'v' },
        finished: { by: { uid: 'u', name: 'Tom' }, at: 1 },
    });
    const fresh = startedOver(e, ['Tom', 'Ana']);
    assert.deepEqual(fresh, {
        title: e.title, recordedAt: e.recordedAt, status: 'ingesting', stage: 'copy', source: 'upload', drive: e.drive,
        media: { sourcePath: 'episodes/abcdefghijkl/source/x.mp4', speakerTracks: tracks },
        candidateSpeakers: ['Tom', 'Ana'], costs: { items: [], totalUsd: 0 }, error: null, createdAt: e.createdAt,
    });
    assert.deepEqual(startedOver(base({ media: { sourcePath: 's' } }), []).media, { sourcePath: 's' });
    assert.ok(keptOnStartOver('abcdefghijkl', 'episodes/abcdefghijkl/source/tracks/1-tom.m4a'));
    assert.ok(!keptOnStartOver('abcdefghijkl', 'episodes/abcdefghijkl/proxy_720p.mp4'));
    assert.ok(!keptOnStartOver('abcdefghijkl', 'episodes/abcdefghijkl/editRender/work/r1/w0.mp4'));
    assert.equal(docIdOf(e.review?.docUrl), '1AbC-d_9');
    assert.equal(docIdOf(undefined), null);
});
