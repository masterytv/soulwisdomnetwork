// Spec 019 item 2.6: which copy of unsaved changes, kept in the browser, the editor offers back.
// Run: npx tsx --test lib/localDraft.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftToOffer } from './localDraft';

const copy = (version: number) => JSON.stringify({ value: { cuts: [{ startMs: 1, endMs: 2 }] }, version, at: 1_700_000_000_000 });

test('a copy made on the version still saved is offered back', () => {
    const d = draftToOffer<{ cuts: unknown[] }>(copy(7), 7);
    assert.ok(d && d !== 'stale');
    assert.equal(d.value.cuts.length, 1);
});

test('a copy a newer save overtook is stale, never offered', () => {
    assert.equal(draftToOffer(copy(6), 7), 'stale');
});

test('nothing, or something unreadable, offers nothing', () => {
    assert.equal(draftToOffer(null, 7), null);
    assert.equal(draftToOffer('{not json', 7), null);
    assert.equal(draftToOffer(JSON.stringify({ version: 7 }), 7), null);
    assert.equal(draftToOffer('null', 7), null);
});
