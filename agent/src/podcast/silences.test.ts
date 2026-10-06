// Silences measured at ingest (spec 019 item 1.1): a tone, two seconds of silence, a tone.

import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { SilencesFileSchema } from '../../../lib/edit';
import { measureSilences, SILENCE } from './silences';

test('silences: found in the audio, in milliseconds, and in the shape the editor reads', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silences-'));
    const file = path.join(dir, 'audio.m4a');
    try {
        const made = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
            '-f', 'lavfi', '-i', 'sine=f=440:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=1',
            '-filter_complex', '[0:a]aformat=sample_rates=44100:channel_layouts=mono[a];[2:a]aformat=sample_rates=44100:channel_layouts=mono[c];[a][1:a][c]concat=n=3:v=0:a=1',
            '-c:a', 'aac', file]);
        assert.equal(made.status, 0, made.stderr?.toString());
        const result = await measureSilences(file);
        assert.equal(result.noiseDb, SILENCE.noiseDb);
        assert.equal(result.minMs, SILENCE.minMs);
        assert.equal(result.silences.length, 1, JSON.stringify(result.silences));
        const [s] = result.silences;
        assert.ok(Math.abs(s.startMs - 1000) < 60 && Math.abs(s.endMs - 3000) < 60, JSON.stringify(s));
        assert.ok(Number.isInteger(s.startMs) && Number.isInteger(s.endMs));
        assert.ok(SilencesFileSchema.safeParse(JSON.parse(JSON.stringify(result))).success);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
