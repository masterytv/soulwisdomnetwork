// The recording checklist: ticks are saved by key, so keys must be unique; clearing keeps the one-time setup.
// Run: npx tsx --test lib/recordingChecklist.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECORDING_CHECKLIST, clearForNextRecording, itemKey } from './recordingChecklist';

test('every item has its own key', () => {
    const keys = RECORDING_CHECKLIST.flatMap(s => s.items.map(i => itemKey(s, i)));
    assert.equal(new Set(keys).size, keys.length);
});

test('clearing for the next recording keeps only the one-time ticks', () => {
    const all = Object.fromEntries(RECORDING_CHECKLIST.flatMap(s => s.items.map(i => [itemKey(s, i), true])));
    const left = clearForNextRecording(all);
    const oneTime = RECORDING_CHECKLIST.filter(s => !s.everyRecording).flatMap(s => s.items.map(i => itemKey(s, i)));
    assert.deepEqual(Object.keys(left).sort(), oneTime.sort());
    assert.deepEqual(clearForNextRecording({}), {});
});
