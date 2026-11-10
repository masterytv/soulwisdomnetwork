// Run: npx tsx --test agent/src/podcast/renderStages.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageClock, type RenderStage } from './renderStages';

test('each stage is written and logged as it starts; counts at most every 5 s, the last one always; a summary of times', async () => {
    let t = 0;
    const writes: RenderStage[] = [], lines: string[] = [];
    const clock = stageClock(async s => { writes.push(s); }, () => t, l => lines.push(l));
    clock.stage('Getting the files');
    t = 60_000;
    clock.stage('Motion graphics', 0, 3);
    t = 61_000; clock.stage('Motion graphics', 1, 3);    // too soon: not written
    t = 66_000; clock.stage('Motion graphics', 2, 3);
    t = 67_000; clock.stage('Motion graphics', 3, 3);    // the last: written
    t = 127_000;
    const summary = clock.summary();
    await clock.flushed();
    assert.deepEqual(writes.map(w => `${w.label} ${w.done}/${w.total}`), [
        'Getting the files null/null', 'Motion graphics 0/3', 'Motion graphics 2/3', 'Motion graphics 3/3',
    ]);
    assert.deepEqual(lines, ['⏱️ 0:00 Getting the files', '⏱️ 1:00 Motion graphics (3)']);
    assert.equal(summary, 'Getting the files 1:00 · Motion graphics 1:07');
});

test('a write that fails never stops the render', async () => {
    const clock = stageClock(async () => { throw new Error('offline'); }, () => 0, () => {});
    clock.stage('Encoding the video', 1, 2);
    await clock.flushed();
});
