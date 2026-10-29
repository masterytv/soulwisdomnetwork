// A job's workflow marks it stopped when its step was cancelled or died before recording how it ended.
// Run: npx tsx --test agent/src/podcast/jobStopped.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { JOB_LABELS, stoppedUpdate } from './jobStopped';

test('a job still in progress is marked failed, with what to do; one that ended is left alone', () => {
    for (const status of ['queued', 'working', 'generating', 'building', 'making', 'uploading', 'publishing']) {
        const update = stoppedUpdate('shorts', { status })!;
        assert.equal(update['shorts.status'], 'failed', status);
        assert.match(String(update['shorts.error']), /^The shorts job stopped before it finished: it was cancelled in GitHub Actions/);
    }
    for (const status of ['ready', 'failed', 'approved']) assert.equal(stoppedUpdate('notes', { status }), null, status);
    assert.equal(stoppedUpdate('broll', undefined), null, 'never started');
});

test('every podcast workflow with an episode job marks it stopped, naming a field the script knows', () => {
    const dir = path.resolve('.github/workflows');
    const expected: Record<string, string> = {
        'podcast_audio.yml': 'podcast', 'podcast_broll.yml': 'broll', 'podcast_descript.yml': 'descript', 'podcast_final.yml': 'final',
        'podcast_package.yml': 'package', 'podcast_shorts.yml': 'shorts', 'podcast_thumbnails.yml': 'thumbnails', 'podcast_youtube.yml': 'youtube',
    };
    for (const [file, field] of Object.entries(expected)) {
        const yml = fs.readFileSync(path.join(dir, file), 'utf8');
        assert.match(yml, /if: \$\{\{ \(?failure\(\) \|\| cancelled\(\)\)?(?: && [^}]+)? \}\}\n\s+env:\n(?:.*\n)*?\s+JOB_FIELD: (\S+)\n(?:.*\n)*?\s+run: npx tsx agent\/src\/podcast\/jobStopped\.ts/, file);
        assert.equal(/JOB_FIELD: (\S+)/.exec(yml)![1], field, file);
        assert.ok(JOB_LABELS[field], field);
    }
    // The notes workflow's field is its mode's (notes, extras, translations, retakes, highlights).
    const notes = fs.readFileSync(path.join(dir, 'podcast_notes.yml'), 'utf8');
    assert.match(notes, /JOB_FIELD: \$\{\{ inputs\.mode \|\| 'notes' \}\}/);
    for (const mode of ['notes', 'extras', 'translations', 'retakes', 'highlights']) assert.ok(JOB_LABELS[mode], mode);
});
