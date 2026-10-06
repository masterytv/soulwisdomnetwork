// Spec 019 item 4.3: which cuts the second video covers in the Studio editor's preview.
// Run: npx tsx --test components/studio/cutBridge.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE, cutAhead } from './cutBridge';

const ranges = [{ startMs: 0, endMs: 5000 }, { startMs: 7000, endMs: 12000 }, { startMs: 12500, endMs: 13000 }, { startMs: 14000, endMs: 20000 }];

test('the cut ahead: the end of the stretch playing and the start of the next', () => {
    assert.deepEqual(cutAhead(ranges, 4000, []), { endMs: 5000, nextMs: 7000, nextEndMs: 12000 });
    // In a cut, or in the last stretch: nothing to cover.
    assert.equal(cutAhead(ranges, 6000, []), null);
    assert.equal(cutAhead(ranges, 15000, []), null);
});

test('not when the next stretch is under a second (the second video could not be ready again), nor at a transition', () => {
    assert.equal(BRIDGE.minStretchMs, 1000);
    assert.equal(cutAhead(ranges, 11000, []), null);      // the next stretch is 0.5 s
    assert.equal(cutAhead(ranges, 4000, [5000]), null);   // a transition plays there (TransitionPreview)
});
