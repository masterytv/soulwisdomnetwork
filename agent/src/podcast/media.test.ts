// The shorts job reads the final cut straight from Storage: a connection that stalls must not hang ffmpeg
// (28 October 2026: 59 minutes on one short, until the workflow's limit cancelled the job). Served here by a
// local server that stops sending part way through the file.
// Run: npx tsx --test agent/src/podcast/media.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { AddressInfo } from 'net';
import { renderShort, urlInputOptions } from './media';

const FONTS = path.resolve(__dirname, '../../assets/fonts');

function ffmpeg(args: string[]) {
    const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    if (r.status !== 0) throw new Error(String(r.stderr));
}

// A server for `file` that answers ranges; `stall(n)` says whether the n-th request stops after its first 64 KB
// (`dead`: every request stops before sending anything).
async function serve(file: string, stall: (n: number) => boolean, dead = false) {
    const data = fs.readFileSync(file);
    let n = 0;
    const open = new Set<http.ServerResponse>();
    const server = http.createServer((req, res) => {
        const stalls = stall(++n);
        const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
        const from = m ? Number(m[1]) : 0, to = m && m[2] ? Number(m[2]) : data.length - 1;
        res.writeHead(m ? 206 : 200, {
            'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': to - from + 1,
            ...(m ? { 'Content-Range': `bytes ${from}-${to}/${data.length}` } : {}),
        });
        const body = data.subarray(from, to + 1);
        if (!stalls || body.length <= 65_536) { res.end(body); return; }
        if (!dead) res.write(body.subarray(0, 65_536));
        open.add(res);           // and then nothing more
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/final.mp4?X-Goog-Signature=secret`,
        requests: () => n,
        close: () => { for (const r of open) r.destroy(); server.closeAllConnections(); server.close(); },
    };
}

async function setup() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-short-'));
    const video = path.join(dir, 'final.mp4');
    ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-shortest', video]);
    const background = path.join(dir, 'background.png');
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x140a2e:s=1080x1920:d=1', '-frames:v', '1', background]);
    const ass = path.join(dir, 'short.ass');
    fs.writeFileSync(ass, '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n');
    const options = { startSeconds: 2, durationSeconds: 4, aspect: 14 / 9, background, ass, fontsDir: FONTS, width: 1080, videoTop: 400, readTimeoutSeconds: 1 };
    return { dir, video, options };
}

test('a URL is read with a time limit and reconnects; a file is read as it is', () => {
    assert.deepEqual(urlInputOptions('/tmp/final.mp4'), []);
    assert.deepEqual(urlInputOptions('https://storage.googleapis.com/b/final.mp4?sig', 60),
        ['-rw_timeout', '60000000', '-reconnect', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '10']);
});

test('a stalled read reconnects and the short is made', { timeout: 120_000 }, async () => {
    const { dir, video, options } = await setup();
    const server = await serve(video, n => n === 1);
    try {
        const out = path.join(dir, 'short.mp4');
        await renderShort(server.url, out, options);
        assert.ok(fs.statSync(out).size > 10_000);
        assert.ok(server.requests() >= 2, 'it read the rest on a new connection');
    } finally {
        server.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a read that never comes back fails in time, as a network error worth retrying, without the signed link', { timeout: 120_000 }, async () => {
    const { dir, video, options } = await setup();
    const server = await serve(video, () => true, true);
    try {
        const started = Date.now();
        const error = await renderShort(server.url, path.join(dir, 'short.mp4'), options).then(() => null, e => e as Error & { code?: string });
        assert.ok(error, 'it fails rather than hanging');
        assert.equal(error.code, 'ETIMEDOUT');
        assert.ok(!error.message.includes('secret'), 'the signed part of the link stays out of the message');
        assert.ok(Date.now() - started < 90_000);
    } finally {
        server.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
