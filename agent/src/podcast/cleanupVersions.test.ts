// The voice clean-up bake-off (spec 019 item 3.1): the stretch, the versions, Auphonic's calls and the blind report.
// Run: npx tsx --test agent/src/podcast/cleanupVersions.test.ts (needs ffmpeg)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    answerKey, applyChain, auphonicAlgorithms, auphonicClean, auphonicState, blindLetters, chainFor, chooseStretch, chooseVersions,
    cutStretch, parseTime, reportTable, VERSION_LABELS, VERSIONS, type VersionResult,
} from './cleanupVersions';

test('the stretch: 10 minutes from a third of the way in by default, kept inside the episode', () => {
    assert.equal(parseTime('12:30'), 750);
    assert.equal(parseTime('1:02:03'), 3723);
    assert.equal(parseTime('90'), 90);
    assert.equal(parseTime('ten'), null);
    assert.deepEqual(chooseStretch(2940, undefined, undefined), { startSec: 980, seconds: 600 });
    assert.deepEqual(chooseStretch(2940, '45:00', '10'), { startSec: 2340, seconds: 600 });
    assert.deepEqual(chooseStretch(300, '1:00', undefined), { startSec: 0, seconds: 300 });
    assert.throws(() => chooseStretch(2940, 'soon', '10'), /Not a time/);
    assert.throws(() => chooseStretch(2940, undefined, '20'), /between 1 and 15/);
});

test('versions: all by default, or the ones named, in the usual order', () => {
    assert.deepEqual(chooseVersions(''), [...VERSIONS]);
    assert.deepEqual(chooseVersions('deepfilter, today'), ['today', 'deepfilter']);
    assert.throws(() => chooseVersions('today,studio'), /Unknown versions: studio/);
});

test('blind letters: one each, A onwards, the same for the same run, shuffled across runs', () => {
    const a = blindLetters([...VERSIONS], 12345);
    assert.deepEqual([...a.values()].sort(), ['A', 'B', 'C', 'D', 'E']);
    assert.deepEqual([...blindLetters([...VERSIONS], 12345)], [...a]);
    const orders = new Set(Array.from({ length: 20 }, (_, i) => { const m = blindLetters([...VERSIONS], i + 1); return VERSIONS.map(v => m.get(v)).join(''); }));
    assert.ok(orders.size > 5);
});

test('the report gives loudness by letter only; the key names the versions, with time and cost', () => {
    const results: VersionResult[] = [
        { kind: 'deepfilter', letter: 'B', file: 'B.m4a', beforeLufs: -21.4, afterLufs: -14.0, truePeak: -1.2, seconds: 152, cost: 'runner time only' },
        { kind: 'auphonic', letter: 'A', note: 'no AUPHONIC_API_KEY repo secret' },
    ];
    const table = reportTable(results);
    assert.match(table, /\| A \| not made: no AUPHONIC_API_KEY/);
    assert.match(table, /\| B \| -14.0 LUFS \(was -21.4\) \| -1.2 dBTP \|$/m);
    for (const label of Object.values(VERSION_LABELS)) assert.equal(table.includes(label), false);
    assert.equal(table.includes('152'), false);
    assert.equal(answerKey(results), `A: ${VERSION_LABELS.auphonic} (not made: no AUPHONIC_API_KEY repo secret)\n` +
        `B: ${VERSION_LABELS.deepfilter}. Clean-up took 152 s; cost: runner time only.\n`);
});

test('Auphonic: the algorithms are checked against the names it lists', () => {
    assert.deepEqual(auphonicAlgorithms(['denoise', 'leveler', 'normloudness', 'loudnesstarget', 'hipfilter', 'filtering']),
        { denoise: true, leveler: true, normloudness: true, loudnesstarget: -14, hipfilter: true });
    assert.deepEqual(auphonicAlgorithms(['denoise', 'leveler', 'normloudness', 'loudnesstarget']),
        { denoise: true, leveler: true, normloudness: true, loudnesstarget: -14 });
    assert.throws(() => auphonicAlgorithms(['denoisemethod', 'leveler', 'normloudness', 'loudnesstarget']), /no longer lists denoise; it offers: denoisemethod/);
    assert.equal(auphonicState({ status: 3 }), 'done');
    assert.equal(auphonicState({ status_string: 'Error' }), 'error');
    assert.equal(auphonicState({ status: 4, status_string: 'Audio Processing' }), 'working');
});

test('Auphonic: create, upload, start, wait, download, all with the key', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auph-'));
    const wav = path.join(dir, 'in.wav'), out = path.join(dir, 'out.flac');
    fs.writeFileSync(wav, 'RIFF');
    const calls: { url: string; method: string; auth: string | null; body?: unknown }[] = [];
    let polls = 0;
    const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
    const fake = (async (url: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        calls.push({ url, method: init.method ?? 'GET', auth: headers.get('authorization'), body: init.body });
        if (url.endsWith('/info/algorithms.json')) return json({ denoise: {}, leveler: {}, normloudness: {}, loudnesstarget: {}, hipfilter: {} });
        if (url.endsWith('/productions.json')) return json({ uuid: 'u1' });
        if (url.endsWith('/upload.json') || url.endsWith('/start.json')) return json({});
        if (url.endsWith('/production/u1.json')) return json(++polls < 2 ? { status: 4 } : { status: 3, output_files: [{ download_url: 'https://auphonic.com/dl/u1.flac' }] });
        if (url === 'https://auphonic.com/dl/u1.flac') return new Response(Buffer.from('fLaC'), { status: 200 });
        return new Response('no', { status: 404 });
    }) as typeof fetch;
    const r = await auphonicClean(wav, out, 'k3y', 'test', { fetch: fake, sleep: async () => {} });
    assert.equal(fs.readFileSync(out, 'utf8'), 'fLaC');
    assert.deepEqual(r.algorithms, { denoise: true, leveler: true, normloudness: true, loudnesstarget: -14, hipfilter: true });
    assert.ok(calls.every(c => c.auth === 'bearer k3y'));
    const created = JSON.parse(calls.find(c => c.url.endsWith('/productions.json'))!.body as string);
    assert.deepEqual(created.output_files, [{ format: 'flac' }]);
    assert.deepEqual(calls.map(c => c.url.replace('https://auphonic.com', '')), [
        '/api/info/algorithms.json', '/api/productions.json', '/api/production/u1/upload.json', '/api/production/u1/start.json',
        '/api/production/u1.json', '/api/production/u1.json', '/dl/u1.flac',
    ]);
    // A failed production says why.
    const failing = (async (url: string) => url.endsWith('/production/u1.json')
        ? json({ status: 2, error_message: 'Unsupported file' })
        : fake(url)) as typeof fetch;
    await assert.rejects(auphonicClean(wav, out, 'k3y', 'test', { fetch: failing, sleep: async () => {} }), /Auphonic: Unsupported file/);
});

test('the stretch is cut at 48 kHz stereo, and each chain keeps its length', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-'));
    const src = path.join(dir, 'src.m4a');
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=300:d=12', '-f', 'lavfi', '-i', 'anoisesrc=d=12:a=0.02',
        '-filter_complex', '[0][1]amix=inputs=2', '-ac', '1', '-ar', '44100', src]);
    const stretch = path.join(dir, 'stretch.wav');
    await cutStretch(src, 2, 6, stretch);
    const probe = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=channels,sample_rate:format=duration', '-of', 'json', f], { encoding: 'utf8' });
    const info = JSON.parse(probe(stretch));
    assert.equal(info.streams[0].channels, 2);
    assert.equal(info.streams[0].sample_rate, '48000');
    assert.ok(Math.abs(Number(info.format.duration) - 6) < 0.05);
    for (const kind of ['recorded', 'today'] as const) {
        const out = path.join(dir, `${kind}.wav`);
        await applyChain(stretch, chainFor(kind), out);
        assert.ok(Math.abs(Number(JSON.parse(probe(out)).format.duration) - 6) < 0.05, kind);
    }
});
