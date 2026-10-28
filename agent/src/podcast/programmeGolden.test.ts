// Spec 022's proof that an edit saved before it renders exactly as it did: for a few stand-in episodes covering
// the old shapes (teasers with and without their tag, none, the episode's own intro, no intro or outro, the Studio's
// transitions and one too long to fit, the teasers' music and whoosh, the burned-in tag without the graphics
// renderer), the whole render job runs with the real renderer and every ffmpeg and ffprobe command it runs is
// compared with the ones recorded on the code before spec 022 (fixtures/programmeGolden.json). The same commands make
// the same video. The stand-in media are made so their lengths are exact (no lossy audio), so the commands do not
// depend on the ffmpeg build. RECORD_GOLDEN=1 writes the file instead of checking it.
// Run: npx tsx --test agent/src/podcast/programmeGolden.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import type { Episode } from '../../../types/episode';
import type { EpisodeEdit } from '../../../lib/edit';
import { renderEdit, traceCommands } from './editRender';
import { DEFAULT_SETTINGS, type StudioSettings } from '../../../lib/studioSettings';
import { DEFAULT_SECTION_JOINS } from '../../../lib/transitions';
import { EMPTY_LICENCE } from '../../../lib/audio';
import { runEditRender, type EditRenderDeps } from './editRenderJob';

const ID = 'goldenEpisode1';
const GOLDEN = path.join(__dirname, 'fixtures', 'programmeGolden.json');

function ffmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
        child.on('error', reject);
        child.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    });
}

// A clip with exact lengths: H.264 picture and PCM sound in Matroska.
const media = (out: string, seconds: number, colour: string, hz: number) => ffmpeg([
    '-f', 'lavfi', '-i', `color=c=${colour}:s=640x360:r=30:d=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=48000:duration=${seconds}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-shortest', out,
]);
const tone = (out: string, seconds: number, hz: number) => ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=48000:duration=${seconds}`, '-ac', '2', out]);

interface Fixture { name: string; edit: Partial<EpisodeEdit>; settings: Partial<StudioSettings>; graphics: boolean }

const sound = (id: string, file: string) => ({ library: id, path: `library/${file}`, name: id, gainDb: -10 });

const FIXTURES: Fixture[] = [
    {
        name: 'two teasers (one untagged), the show intro and outro, transitions everywhere, the teasers\' music and whoosh',
        edit: {
            cuts: [{ startMs: 1000, endMs: 1500, reason: 'filler' }],
            teasers: [{ startMs: 500, endMs: 2000, speaker: 'Ana Host' }, { startMs: 3000, endMs: 4400, speaker: 'Bo Guest', tag: false }],
            joins: [{ at: 'betweenTeasers', transition: 'dissolve', durationMs: 500 }],
        },
        settings: {
            joins: {
                ...DEFAULT_SECTION_JOINS,
                start: { transition: 'fade', durationMs: 300 }, afterTeasers: { transition: 'wipeLeft', durationMs: 300 },
                afterIntro: { transition: 'dissolve', durationMs: 500 }, beforeOutro: { transition: 'fade', durationMs: 500 },
                end: { transition: 'fade', durationMs: 300 },
            },
            teaserMusic: sound('bed', 'bed.wav'),
            teaserWhoosh: sound('whoosh', 'whoosh.wav'),
        },
        graphics: true,
    },
    {
        name: 'no teasers, the episode\'s own intro, no outro, a dissolve at a split',
        edit: {
            cuts: [],
            teasers: [],
            splits: [3000],
            joins: [{ at: { atSplit: 3000 }, transition: 'dissolve', durationMs: 400 }],
            intro: { path: `episodes/${ID}/media/own-intro.mkv`, name: 'Own intro' },
            outro: false,
        },
        settings: {},
        graphics: true,
    },
    {
        name: 'one teaser with the burned-in tag, no intro, the episode\'s own outro, a transition too long to fit',
        edit: {
            cuts: [{ startMs: 4000, endMs: 6000, reason: 'manual' }],
            teasers: [{ startMs: 1200, endMs: 2600, speaker: 'Ana Host' }],
            intro: false,
            outro: { path: `episodes/${ID}/media/own-outro.mkv`, name: 'Own outro' },
        },
        settings: { joins: { ...DEFAULT_SECTION_JOINS, afterTeasers: { transition: 'dissolve', durationMs: 2500 } } },
        graphics: false,
    },
];

// What one fixture ran: the job's calls (clips cut, graphics drawn and laid over) and every command, with this run's
// folders and time stamps taken out; the commands sorted, since two windows are made at once.
interface Ran { calls: string[]; commands: string[]; warnings: string[] }

async function runFixture(f: Fixture, root: string): Promise<Ran> {
    const dir = path.join(root, f.name.replace(/\W+/g, '-').slice(0, 40));
    const store = path.join(dir, 'storage');
    const put = (p: string) => { const file = path.join(store, p); fs.mkdirSync(path.dirname(file), { recursive: true }); return file; };
    const source = `episodes/${ID}/source/original.mkv`;
    await media(put(source), 6, 'red', 440);
    await media(put(`episodes/${ID}/media/own-intro.mkv`), 2, 'green', 660);
    await media(put(`episodes/${ID}/media/own-outro.mkv`), 1.5, 'yellow', 550);
    // The show's intro sits in the work folder, which the window names leave out (windowKey), so they do not depend
    // on where the test runs.
    const work = path.join(dir, 'work');
    fs.mkdirSync(work, { recursive: true });
    const showIntro = path.join(work, 'show-intro.mkv');
    await media(showIntro, 2, 'blue', 880);
    await tone(put('library/bed.wav'), 1.5, 330);
    await tone(put('library/whoosh.wav'), 0.4, 3000);
    const reviewed = `episodes/${ID}/transcripts/reviewed.json`;
    fs.writeFileSync(put(reviewed), JSON.stringify({ lines: [
        { speaker: 'Ana Host', start: 500, end: 2000, words: [{ text: 'hello', start: 500, end: 900, speaker: 'Ana Host' }, { text: 'there', start: 1600, end: 2000, speaker: 'Ana Host' }] },
        { speaker: 'Bo Guest', start: 3000, end: 4400, words: [{ text: 'welcome', start: 3000, end: 3600, speaker: 'Bo Guest' }] },
    ] }));
    const e = {
        title: 'Golden',
        status: 'speakers_confirmed',
        media: { sourcePath: source },
        review: { reviewedPath: reviewed },
        edit: { version: 3, cuts: [], ...f.edit },
    } as unknown as Episode;
    const checked = { by: 'u', name: 'Admin', on: '2026-10-01' };
    const calls: string[] = [];
    const deps: EditRenderDeps = {
        settings: { ...DEFAULT_SETTINGS, finalSource: 'descript', ...f.settings },
        getEpisode: async () => e,
        download: async (p, dest) => { fs.copyFileSync(path.join(store, p), dest); },
        upload: async (local, p) => { if (fs.statSync(local).isFile()) fs.copyFileSync(local, put(p)); },
        saveToDrive: async () => null,
        update: async () => {},
        render: renderEdit,
        now: () => 'NOW',
        showIntro,
        cutClip: async (input, output, start, seconds, tag) => {
            calls.push(`cut ${path.basename(output)} from ${start.toFixed(3)} for ${seconds.toFixed(3)}${tag ? ` tagged ${tag.speaker}` : ''}`);
            await ffmpeg(['-ss', start.toFixed(3), '-i', input, '-t', seconds.toFixed(3), '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', output]);
        },
        library: async ids => new Map(ids.map(id => [id, { path: `library/${id === 'bed' ? 'bed' : 'whoosh'}.wav`, checked, licence: EMPTY_LICENCE }])),
        ...(f.graphics ? {
            graphics: {
                name: spec => `g-${createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 12)}.mov`,
                draw: async (spec, out) => { calls.push(`draw ${spec.template} ${JSON.stringify(spec.fields)} ${spec.durationMs} ms`); fs.writeFileSync(out, ''); },
            },
            overlayClip: async (input, overlay, out) => { calls.push(`overlay ${path.basename(overlay)} on ${path.basename(input)}`); fs.copyFileSync(input, out); },
        } : {}),
    };
    const commands: string[] = [];
    traceCommands((cmd, args) => commands.push([cmd, ...args].join(' ')));
    let warnings: string[];
    try {
        warnings = (await runEditRender(ID, deps, work, '1')).warnings;
    } finally {
        traceCommands(null);
    }
    // This run's folders and the render's time stamp (its temporary folders' names) taken out.
    const stamps = new Set(commands.flatMap(c => [...c.matchAll(/_(?:broll|clean|blocks)_(\d+)/g)].map(m => m[1])));
    const clean = (s: string) => {
        let out = s.split(dir).join('<dir>');
        for (const st of stamps) out = out.split(st).join('<stamp>');
        return out;
    };
    return { calls: calls.map(clean), commands: commands.map(clean).sort(), warnings };
}

test('spec 022: old edits run exactly the commands they ran before', { timeout: 900_000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'programme-golden-'));
    try {
        const ran: Record<string, Ran> = {};
        for (const f of FIXTURES) ran[f.name] = await runFixture(f, root);
        if (process.env.RECORD_GOLDEN) {
            fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
            fs.writeFileSync(GOLDEN, JSON.stringify(ran, null, 1) + '\n');
            return;
        }
        const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Record<string, Ran>;
        for (const f of FIXTURES) {
            assert.deepEqual(ran[f.name].calls, golden[f.name].calls, `${f.name}: the job's calls`);
            assert.deepEqual(ran[f.name].warnings, golden[f.name].warnings, `${f.name}: the warnings`);
            assert.deepEqual(ran[f.name].commands, golden[f.name].commands, `${f.name}: the render's commands`);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
