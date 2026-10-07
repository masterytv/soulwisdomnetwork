// Editing and the edit package wait for the b-roll images, or for b-roll to be skipped.
// Run: npx tsx --test lib/brollGate.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Episode } from '../types/episode';
import { brollBlock } from './brollGate';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const idea = (text: string, style: 'photo' | 'digital' = 'photo') => ({ startMs: 0, durationSeconds: 6, idea: text, why: '', style });
const image = (index: number, text: string, style: 'photo' | 'digital' = 'photo') => ({ index, idea: text, style, path: 'p', model: 'm', prompt: '', usd: 0, createdAt: 0 });
const ep = (ideas: ReturnType<typeof idea>[], more: Partial<Episode> = {}): Episode => ({
    title: 't', recordedAt: null, status: 'speakers_confirmed', stage: 'finalize',
    drive: { fileId: 'abcdefghijkl', fileName: 'x.mp4', mimeType: 'video/mp4', sizeBytes: 1 },
    candidateSpeakers: [], costs: { items: [], totalUsd: 0 }, error: null, createdAt: 0, updatedAt: 0,
    notes: { status: 'approved', approved: { broll: ideas } } as unknown as Episode['notes'], ...more,
});

test('held until every approved idea has its image', () => {
    assert.match(brollBlock(ep([idea('a'), idea('b')]), NOW)!, /^2 of 2 b-roll ideas have no image yet/);
    assert.match(brollBlock(ep([idea('a')]), NOW)!, /^The b-roll idea has no image yet/);
    const one = { status: 'ready', only: null, images: { 0: image(0, 'a') } } as unknown as Episode['broll'];
    assert.match(brollBlock(ep([idea('a'), idea('b')], { broll: one }), NOW)!, /^1 of 2 b-roll ideas has/);
    // An image made for an older idea or style does not count.
    assert.ok(brollBlock(ep([idea('a', 'digital')], { broll: one }), NOW));
    const both = { status: 'ready', only: null, images: { 0: image(0, 'a'), 1: image(1, 'b') } } as unknown as Episode['broll'];
    assert.equal(brollBlock(ep([idea('a'), idea(' b ')], { broll: both }), NOW), null);
});

test('no ideas, skipped, or work already started: not held', () => {
    assert.equal(brollBlock(ep([]), NOW), null);
    assert.equal(brollBlock(ep([idea('a')], { brollSkipped: { by: 'Tom', at: 1 } }), NOW), null);
    assert.equal(brollBlock(ep([idea('a')], { edit: { cuts: [], version: 3 } as unknown as Episode['edit'] }), NOW), null);
    assert.equal(brollBlock(ep([idea('a')], { package: { status: 'ready' } as Episode['package'] }), NOW), null);
});

test('notes not approved, or images still being made: held', () => {
    assert.match(brollBlock(ep([idea('a')], { notes: { status: 'ready' } as Episode['notes'] }), NOW)!, /Approve the show notes/);
    const making = { status: 'generating', only: null, requestedAt: NOW - 60_000 } as unknown as Episode['broll'];
    assert.match(brollBlock(ep([idea('a')], { broll: making }), NOW)!, /still being made/);
    // A run that died long ago reads as images missing.
    assert.match(brollBlock(ep([idea('a')], { broll: { ...making!, requestedAt: NOW - 3600_000 } }), NOW)!, /no image yet/);
});
