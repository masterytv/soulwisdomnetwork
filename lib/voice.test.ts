// Spec 019 item 3.2: the voice clean-up choice, and Auphonic's free hours.
// Run: npx tsx --test lib/voice.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUPHONIC_FREE_SECONDS, AUPHONIC_MARGIN_MS, auphonicRefusal, auphonicSpan, auphonicUsed, hm, monthOf, voiceFor, type AuphonicHold } from './voice';
import { DEFAULT_SETTINGS, withDefaults } from './studioSettings';

test('the episode\'s own choice, else the Studio\'s; standard unless chosen', () => {
    assert.equal(DEFAULT_SETTINGS.voiceCleanup, 'standard');
    assert.equal(voiceFor(undefined, 'deepfilter'), 'deepfilter');
    assert.equal(voiceFor({ voice: null }, 'deepfilter'), 'deepfilter');
    assert.equal(voiceFor({ voice: 'auphonic' }, 'standard'), 'auphonic');
    // A saved value that is not a choice falls back to the default, never stopping a job.
    assert.equal(withDefaults({ voiceCleanup: 'studio-sound' }).voiceCleanup, 'standard');
    assert.equal(withDefaults({ voiceCleanup: 'deepfilter' }).voiceCleanup, 'deepfilter');
});

test('Auphonic is sent only the stretch the edit keeps, with a margin', () => {
    const minute = 60_000;
    // The first and last 5 minutes of an hour cut: 50 minutes and 4 seconds go.
    const span = auphonicSpan({ cuts: [{ startMs: 0, endMs: 5 * minute, reason: 'manual' }, { startMs: 55 * minute, endMs: 60 * minute, reason: 'manual' }] }, 60 * minute)!;
    assert.ok(Math.abs(span.startMs - (5 * minute - AUPHONIC_MARGIN_MS)) <= 100, String(span.startMs));
    assert.ok(Math.abs(span.endMs - (55 * minute + AUPHONIC_MARGIN_MS)) <= 100, String(span.endMs));
    // Never outside the recording.
    assert.deepEqual(auphonicSpan({ cuts: [] }, 10_000), { startMs: 0, endMs: 10_000 });
    // Everything cut: nothing to send.
    assert.equal(auphonicSpan({ cuts: [{ startMs: 0, endMs: 10_000, reason: 'manual' }] }, 10_000), null);
});

test('the month\'s hours: holds this calendar month count, a render that would go over is refused', () => {
    const oct = Date.UTC(2026, 9, 20), sept = Date.UTC(2026, 8, 30, 23);
    assert.equal(monthOf(oct), '2026-10');
    const holds: AuphonicHold[] = [
        { id: 'a', at: sept, seconds: 7000, episodeId: 'e1' },          // last month: free again
        { id: 'b', at: Date.UTC(2026, 9, 2), seconds: 3000, episodeId: 'e2' },
        { id: 'c', at: Date.UTC(2026, 9, 9), seconds: 1200, episodeId: 'e3' },
    ];
    assert.equal(auphonicUsed(holds, oct), 4200);
    assert.equal(auphonicRefusal(holds, AUPHONIC_FREE_SECONDS - 4200, oct), null);
    assert.match(auphonicRefusal(holds, 3001, oct)!, /50 min left this month and this render needs 51 min\. Choose Standard or DeepFilterNet/);
    assert.equal(auphonicRefusal([], AUPHONIC_FREE_SECONDS + 1, oct) !== null, true);
    assert.deepEqual([hm(59), hm(3600), hm(3901)], ['1 min', '1 h 00 min', '1 h 06 min']);
});
