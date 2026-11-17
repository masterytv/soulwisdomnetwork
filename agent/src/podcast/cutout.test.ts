// The thumbnail cut-outs (cutout.ts): reading what cutout.py printed. The script itself needs rembg,
// which only the thumbnails workflow installs.
// Run: npx tsx --test agent/src/podcast/cutout.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutOutPeople, parseCutoutLines } from './cutout';

test('each frame is read from its own line; anything else printed is ignored', () => {
    const lines = parseCutoutLines([
        'Downloading data from https://github.com/…',
        '{"in": "/w/frame-0.jpg", "ok": true, "box": [181, 26, 848, 720], "share": 0.173}',
        '{"in": "/w/frame-1.jpg", "ok": false, "reason": "no person found"}',
        '{"something": "else"}',
        '',
    ].join('\n'));
    assert.equal(lines.size, 2);
    assert.deepEqual(lines.get('/w/frame-0.jpg')?.box, [181, 26, 848, 720]);
    assert.equal(lines.get('/w/frame-1.jpg')?.ok, false);
});

test('a python that cannot start costs only the cut-outs', async () => {
    const before = process.env.CUTOUT_PYTHON;
    process.env.CUTOUT_PYTHON = '/nonexistent/python';
    try {
        const made = await cutOutPeople([{ input: '/w/frame-0.jpg', output: '/w/cutout-0.png' }]);
        assert.equal(made.size, 0);
    } finally {
        if (before === undefined) delete process.env.CUTOUT_PYTHON;
        else process.env.CUTOUT_PYTHON = before;
    }
});
