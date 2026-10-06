// Why: the voice clean-up bake-off (docs/specs/019-editor-light-v2.md item 3.1). The same stretch of an
// episode, cleaned up several ways and brought to the same loudness, so Tom and the producer can choose
// by ear. This file holds the parts the job (cleanupCompare.ts) is made of: the ffmpeg chains, Auphonic's
// calls, the blind letters and the report. DeepFilterNet (MIT or Apache-2.0, v0.5.6, frozen) runs as a
// LADSPA plugin inside ffmpeg, as measured in docs/research/2026-10-05-open-source-editors.md.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { cleanupFilter } from './editRender';

export const VERSIONS = ['recorded', 'today', 'deepfilter', 'auphonic', 'descript'] as const;
export type VersionKind = typeof VERSIONS[number];

export const VERSION_LABELS: Record<VersionKind, string> = {
    recorded: 'As recorded (loudness only)',
    today: "Today's clean-up (highpass, afftdn, compressor)",
    deepfilter: 'DeepFilterNet in the same chain, instead of afftdn',
    auphonic: 'Auphonic (denoise and leveller)',
    descript: "Descript's Studio Sound (the same stretch of its final cut)",
};

export const STRETCH_MINUTES = { default: 10, max: 15 };

// "1:02:03", "12:30", "750" (seconds) → seconds; null when it is none of these.
export function parseTime(text: string): number | null {
    const t = text.trim();
    if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) return null;
    return t.split(':').reduce((s, part) => s * 60 + Number(part), 0);
}

// Where the stretch starts and how long it is, inside the episode: by default 10 minutes from a third
// of the way in (past the introductions), shortened to fit.
export function chooseStretch(durationSec: number, start: string | undefined, minutes: string | undefined) {
    const wanted = minutes?.trim() ? Number(minutes) : STRETCH_MINUTES.default;
    if (!Number.isFinite(wanted) || wanted <= 0 || wanted > STRETCH_MINUTES.max) {
        throw new Error(`Give between 1 and ${STRETCH_MINUTES.max} minutes`);
    }
    const length = Math.min(wanted * 60, durationSec);
    let from = start?.trim() ? parseTime(start) : Math.round(durationSec / 3);
    if (from === null) throw new Error(`Not a time: ${start} (use 12:30 or 1:02:03)`);
    from = Math.max(0, Math.min(from, durationSec - length));
    return { startSec: from, seconds: length };
}

// Which versions to make, from a comma-separated list (empty: all of them).
export function chooseVersions(list: string | undefined): VersionKind[] {
    const asked = (list ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (!asked.length) return [...VERSIONS];
    const bad = asked.filter(a => !VERSIONS.includes(a as VersionKind));
    if (bad.length) throw new Error(`Unknown versions: ${bad.join(', ')} (choose from ${VERSIONS.join(', ')})`);
    return VERSIONS.filter(v => asked.includes(v));
}

// The ffmpeg chain for each version made here. DeepFilterNet works on one channel at 48 kHz, so the
// voice is mixed to mono first (halving the time; a recording's speech is the same in both channels)
// and spread back to both after; `c0` is how far it may turn noise down, in dB (100: no limit).
export function chainFor(kind: 'recorded' | 'today' | 'deepfilter', ladspa?: string): string {
    if (kind === 'recorded') return 'aresample=48000';
    if (kind === 'today') return cleanupFilter('light', undefined);
    if (!ladspa) throw new Error('DeepFilterNet needs its LADSPA plugin (DEEPFILTER_LADSPA)');
    return cleanupFilter('light', undefined).replace('afftdn=nr=12',
        `aresample=48000,pan=mono|c0=0.5*c0+0.5*c1,ladspa=file=${ladspa}:plugin=deep_filter_mono:controls=c0=100,pan=stereo|c0=c0|c1=c0`);
}

function ffmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        // DeepFilterNet warns of "underruns" as if it ran live; offline they mean nothing.
        p.stderr.on('data', d => { err += d; });
        p.on('error', reject);
        p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.split('\n').filter(l => !/Underrun/.test(l)).join('\n').slice(-400)}`))));
    });
}

// The stretch, as 48 kHz stereo WAV, from a file or a link (ffmpeg seeks over HTTP without
// downloading the whole recording).
export function cutStretch(input: string, startSec: number, seconds: number, out: string) {
    return ffmpeg(['-ss', startSec.toFixed(3), '-t', seconds.toFixed(3), '-i', input, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
}

export function applyChain(input: string, chain: string, out: string) {
    return ffmpeg(['-i', input, '-af', chain, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
}

// ─── Auphonic ────────────────────────────────────────────────────────────────

const AUPHONIC = 'https://auphonic.com/api';
// What we ask Auphonic for: its denoiser and leveller, loudness normalised to −14 LUFS, and its
// high-pass filter when it has one. Checked against GET /api/info/algorithms.json at the start of
// each run, so a renamed field fails the version with what Auphonic offers instead.
export const AUPHONIC_ALGORITHMS: Record<string, unknown> = { denoise: true, leveler: true, normloudness: true, loudnesstarget: -14 };
const OPTIONAL_ALGORITHMS: Record<string, unknown> = { hipfilter: true };

// The algorithms to send, given the names Auphonic lists; throws when one we need is missing.
export function auphonicAlgorithms(known: string[]): Record<string, unknown> {
    const missing = Object.keys(AUPHONIC_ALGORITHMS).filter(k => !known.includes(k));
    if (missing.length) {
        throw new Error(`Auphonic no longer lists ${missing.join(', ')}; it offers: ${known.join(', ')}. Update AUPHONIC_ALGORITHMS.`);
    }
    return { ...AUPHONIC_ALGORITHMS, ...Object.fromEntries(Object.entries(OPTIONAL_ALGORITHMS).filter(([k]) => known.includes(k))) };
}

// Auphonic's production status: 3 is Done, 2 Error (its API also gives the words).
export function auphonicState(data: { status?: number; status_string?: string; error_message?: string | null }): 'done' | 'error' | 'working' {
    if (data.status === 3 || data.status_string === 'Done') return 'done';
    if (data.status === 2 || data.status_string === 'Error') return 'error';
    return 'working';
}

export interface AuphonicDeps { fetch: typeof fetch; sleep: (ms: number) => Promise<void> }

// Sends the stretch to Auphonic and saves what comes back as `out` (FLAC). Uses the account's credit
// (2 hours a month free; decision D1).
export async function auphonicClean(wav: string, out: string, apiKey: string, title: string, deps: AuphonicDeps = { fetch, sleep: ms => new Promise(r => setTimeout(r, ms)) }) {
    const auth = { Authorization: `bearer ${apiKey}` };
    const call = async (path: string, init: RequestInit = {}) => {
        const res = await deps.fetch(`${AUPHONIC}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
        if (!res.ok) throw new Error(`Auphonic ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
        return (await res.json()) as { data: Record<string, unknown> };
    };
    const known = Object.keys((await call('/info/algorithms.json')).data);
    const algorithms = auphonicAlgorithms(known);
    const created = await call('/productions.json', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { title }, algorithms, output_files: [{ format: 'flac' }] }),
    });
    const uuid = created.data.uuid as string;
    const form = new FormData();
    form.append('input_file', new Blob([fs.readFileSync(wav)]), 'stretch.wav');
    await call(`/production/${uuid}/upload.json`, { method: 'POST', body: form });
    await call(`/production/${uuid}/start.json`, { method: 'POST' });
    for (let i = 0; i < 360; i++) {
        await deps.sleep(5000);
        const d = (await call(`/production/${uuid}.json`)).data as {
            status?: number; status_string?: string; error_message?: string | null; output_files?: { download_url?: string }[];
        };
        const state = auphonicState(d);
        if (state === 'error') throw new Error(`Auphonic: ${d.error_message || 'the production failed'}`);
        if (state === 'done') {
            const url = d.output_files?.find(f => f.download_url)?.download_url;
            if (!url) throw new Error('Auphonic finished without a file to download');
            const res = await deps.fetch(url, { headers: auth });
            if (!res.ok) throw new Error(`Auphonic download: ${res.status}`);
            fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
            return { uuid, algorithms };
        }
    }
    throw new Error('Auphonic took more than 30 minutes');
}

// ─── Blind letters and the report ────────────────────────────────────────────

// Each version gets a letter in an order fixed by `seed` (the run), so the files can be heard without
// knowing which is which; the key is in its own file.
export function blindLetters(kinds: VersionKind[], seed: number): Map<VersionKind, string> {
    const order = [...kinds];
    // mulberry32: run numbers close together still give unrelated orders.
    let s = seed >>> 0;
    const next = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    };
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return new Map(order.map((k, i) => [k, String.fromCharCode(65 + i)]));
}

export interface VersionResult {
    kind: VersionKind;
    letter: string;
    file?: string;                 // the local .m4a
    beforeLufs?: number;
    afterLufs?: number;
    truePeak?: number;
    seconds?: number;              // how long the clean-up took
    cost?: string;
    note?: string;                 // why it was skipped or failed
}

export const clock = (sec: number) => {
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
};

// The table for the email and the run summary: letters with their loudness only. Time and cost would
// give the versions away (Auphonic's credit, DeepFilterNet's minutes), so they are in the key.
export function reportTable(results: VersionResult[]): string {
    const rows = [...results].sort((a, b) => a.letter.localeCompare(b.letter)).map(r => r.file
        ? `| ${r.letter} | ${r.afterLufs?.toFixed(1)} LUFS (was ${r.beforeLufs?.toFixed(1)}) | ${r.truePeak?.toFixed(1)} dBTP |`
        : `| ${r.letter} | not made: ${r.note ?? ''} | |`);
    return ['| File | Loudness | True peak |', '|---|---|---|', ...rows].join('\n');
}

// The key: which letter is which version, with each one's clean-up time and cost.
export function answerKey(results: VersionResult[]): string {
    return [...results].sort((a, b) => a.letter.localeCompare(b.letter)).map(r => r.file
        ? `${r.letter}: ${VERSION_LABELS[r.kind]}. Clean-up took ${Math.round(r.seconds ?? 0)} s; cost: ${r.cost ?? 'none'}.`
        : `${r.letter}: ${VERSION_LABELS[r.kind]} (not made: ${r.note ?? ''})`).join('\n') + '\n';
}
