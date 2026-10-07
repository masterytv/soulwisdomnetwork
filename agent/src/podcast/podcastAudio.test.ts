// Spec 019 item 5.1: the podcast MP3 is at −16 LUFS, with the chapters and a square cover.
// Run: npx tsx --test agent/src/podcast/podcastAudio.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makePodcastMp3 } from './podcastAudio';

test('the MP3: podcast loudness, the final cut\'s chapters as ID3 chapters, the artwork as a square cover', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
    const video = path.join(dir, 'final.mp4'), art = path.join(dir, 'logo.png'), out = path.join(dir, 'episode.mp3');
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=20',
        '-f', 'lavfi', '-i', 'aevalsrc=0.3*sin(2*PI*220*t)*lt(mod(t\\,1.3)\\,0.8):s=48000:d=20', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', video]);
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xf7c65b:s=800x400', '-frames:v', '1', art]);
    const loud = await makePodcastMp3({
        video, out, title: 'Ep 4: A test', artist: 'Soul Wisdom Collective', durationMs: 20_000, art, background: '#140a2e',
        chapters: [{ title: 'Welcome', startMs: 0 }, { title: 'The story', startMs: 8000 }],
    });
    assert.ok(Math.abs(loud.afterLufs + 16) <= 1, String(loud.afterLufs));
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_chapters', '-show_streams', '-show_format', '-of', 'json', out], { encoding: 'utf8' }));
    assert.deepEqual(probe.chapters.map((c: { start_time: string; end_time: string; tags: { title: string } }) => [c.tags.title, Number(c.start_time), Math.round(Number(c.end_time))]),
        [['Welcome', 0, 8], ['The story', 8, 20]]);
    const audio = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
    const cover = probe.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    assert.deepEqual([audio.codec_name, audio.sample_rate, audio.channels], ['mp3', '44100', 2]);
    assert.deepEqual([cover.width, cover.height, cover.disposition.attached_pic], [1400, 1400, 1]);
    assert.equal(probe.format.tags.title, 'Ep 4: A test');
    fs.rmSync(dir, { recursive: true, force: true });
});
