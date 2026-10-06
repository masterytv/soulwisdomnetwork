// Editor Light render job: proves the plan and the whole job on stand-in data. Storage,
// Firestore and Drive are fakes backed by a temp folder; the render is real (ffmpeg), on a
// 20 s test clip with a 2 s teaser, a 3 s intro used again as the outro, and one b-roll still.
// Run: npx tsx --test agent/src/podcast/editRenderJob.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import type { Episode } from '../../../types/episode';
import { renderEdit } from './editRender';
import { DEFAULT_SETTINGS } from '../../../lib/studioSettings';
import { planEditRender, runEditRender, type EditRenderDeps } from './editRenderJob';
import { probeDuration } from './media';
import { logoBug, SITE_LOGO } from '../../../lib/layers';
import { EMPTY_LICENCE, newSound, type LicenceCheck } from '../../../lib/audio';

const ID = 'testEpisode123';

function ffmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
    });
}

const clip = (out: string, seconds: number, freq: number) => ffmpeg([
    '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=${seconds}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out,
]);

// An episode as Firestore would hold it once the package is built and the notes approved.
function episode(over: Partial<Episode> = {}): Episode {
    return {
        title: 'Test: Episode / One',
        status: 'speakers_confirmed',
        media: { sourcePath: `episodes/${ID}/source/original.mp4` },
        review: { reviewedPath: `episodes/${ID}/transcripts/reviewed.json` },
        edit: { version: 7, cuts: [{ startMs: 2000, endMs: 6000, reason: 'manual' }] },
        package: {
            status: 'ready',
            clipPaths: [`episodes/${ID}/package/clip-1.mp4`],
            introPath: `episodes/${ID}/package/intro.mp4`,
            episodePath: null,
        },
        broll: { status: 'ready', only: null, images: {
            '0': { index: 0, idea: 'sea', startMs: 12000, durationSeconds: 2, path: `episodes/${ID}/broll/0.png` } as never,
        } },
        notes: { status: 'approved', approved: {
            chapters: [{ startMs: 0, title: 'Start' }, { startMs: 10000, title: 'Middle' }],
            quotes: [
                { text: 'kept', speaker: 'Host', startMs: 7000, endMs: 9000 },
                { text: 'no end', speaker: 'Host', startMs: 8000, endMs: -1 },
            ],
        } as never },
        ...over,
    } as Episode;
}

test('plan: needs a saved edit', () => {
    assert.throws(() => planEditRender(episode({ edit: undefined })), /Save an edit/);
});

test('plan: needs the source video', () => {
    assert.throws(() => planEditRender(episode({ media: {}, package: undefined })), /original video/);
});

test('plan: uses the filled 1080p copy when the package made one', () => {
    const e = episode();
    e.package!.episodePath = `episodes/${ID}/package/episode-1080p.mp4`;
    assert.equal(planEditRender(e).video, `episodes/${ID}/package/episode-1080p.mp4`);
    assert.equal(planEditRender(episode()).video, `episodes/${ID}/source/original.mp4`);
});

test('plan: teasers and intro come only from a ready package, with a warning otherwise', () => {
    const ready = planEditRender(episode());
    assert.deepEqual(ready.teasers, [`episodes/${ID}/package/clip-1.mp4`]);
    assert.equal(ready.intro, `episodes/${ID}/package/intro.mp4`);
    assert.equal(ready.warnings.length, 0);
    const e = episode();
    e.package!.status = 'building';
    const notReady = planEditRender(e);
    assert.deepEqual(notReady.teasers, []);
    assert.equal(notReady.intro, null);
    assert.match(notReady.warnings.join(' '), /edit package/);
});

test('plan: b-roll in idea order, quotes without an end dropped, notes warning', () => {
    const e = episode();
    e.broll!.images = {
        '2': { index: 2, startMs: 9000, durationSeconds: 3, path: 'b/2.png' } as never,
        '0': { index: 0, startMs: 1000, durationSeconds: 4, path: 'b/0.png' } as never,
    };
    const plan = planEditRender(e);
    assert.deepEqual(plan.broll, [
        { atMs: 1000, seconds: 4, image: 'b/0.png' },
        { atMs: 9000, seconds: 3, image: 'b/2.png' },
    ]);
    assert.deepEqual(plan.quotes.map(q => q.text), ['kept']);
    const draft = planEditRender(episode({ notes: { status: 'ready' } as never }));
    assert.deepEqual(draft.chapters, []);
    assert.match(draft.warnings.join(' '), /show notes/);
});

test('plan: transitions between sections are the edit\'s own, else the Studio\'s', () => {
    const studio = { ...DEFAULT_SETTINGS, joins: { ...DEFAULT_SETTINGS.joins, afterIntro: { transition: 'dissolve' as const, durationMs: 800 } } };
    const base = episode();
    const plain = planEditRender(base, studio);
    assert.deepEqual(plain.sections.afterIntro, { transition: 'dissolve', durationMs: 800 });
    assert.deepEqual(plain.sections.end, DEFAULT_SETTINGS.joins.end);
    const own = planEditRender(episode({ edit: { ...base.edit!, joins: [{ at: 'afterIntro', transition: 'fade', durationMs: 1500 }] } }), studio);
    assert.deepEqual(own.sections.afterIntro, { transition: 'fade', durationMs: 1500 });
});

test('job: renders on stand-in data and saves everything', { timeout: 600_000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-job-'));
    const store = path.join(dir, 'storage');
    const put = (p: string) => { const f = path.join(store, p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };
    const e = episode();
    await clip(put(e.media!.sourcePath!), 20, 440);
    await clip(put(e.package!.clipPaths![0]), 2, 660);
    await clip(put(e.package!.introPath!), 3, 880);
    await ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=800x600', '-frames:v', '1', put(`episodes/${ID}/broll/0.png`)]);
    fs.writeFileSync(put(e.review!.reviewedPath!), JSON.stringify({ lines: [
        { words: [{ text: 'hello', start: 500, end: 900 }, { text: 'gone', start: 3000, end: 3500 }] },
        { words: [{ text: 'after', start: 7000, end: 7400 }] },
    ] }));

    const downloads: string[] = [];
    const uploads: Record<string, string> = {};
    const updates: Record<string, unknown>[] = [];
    const removed: string[] = [];
    let driveName = '';
    e.editRender = { status: 'queued', videoPath: `episodes/${ID}/editRender/v6-111/episode.mp4` };
    const deps: EditRenderDeps = {
        getEpisode: async () => e,
        download: async (p, dest) => { downloads.push(p); fs.copyFileSync(path.join(store, p), dest); },
        upload: async (local, p, type) => { uploads[p] = type; fs.copyFileSync(local, put(p)); },
        saveToDrive: async (_local, name) => { driveName = name; return { fileId: 'drive-file-1', folderId: 'folder-04' }; },
        update: async fields => { updates.push(fields); },
        removeFolder: async prefix => { removed.push(prefix); },
        render: renderEdit,
        now: () => 'NOW',
    };
    const result = await runEditRender(ID, deps, path.join(dir, 'work'), '222');

    // Status moves in order and ends ready, with the edit version it was made from.
    const statuses = updates.map(u => u['editRender.status']).filter(Boolean);
    assert.deepEqual(statuses, ['downloading', 'rendering', 'saving', 'ready']);
    const last = updates[updates.length - 1];
    assert.equal(last['editRender.error'], null);
    assert.equal(last['editRender.editVersion'], 7);
    assert.equal(last['editRender.driveUrl'], 'https://drive.google.com/file/d/drive-file-1/view');
    assert.equal(last['editRender.folderUrl'], 'https://drive.google.com/drive/folders/folder-04');

    // Every input downloaded exactly once; the intro serves as the outro without a second download.
    assert.deepEqual([...downloads].sort(), [
        e.broll!.images!['0'].path, e.package!.introPath!, e.package!.clipPaths![0],
        e.media!.sourcePath!, e.review!.reviewedPath!,
    ].sort());

    // The video and its words, captions and chapters are saved in a folder of this render's
    // own, and the previous render's folder is removed once the episode points at the new one.
    const prefix = `episodes/${ID}/editRender/v7-222`;
    assert.deepEqual(uploads, {
        [`${prefix}/episode.mp4`]: 'video/mp4',
        [`${prefix}/episode.words.json`]: 'application/json',
        [`${prefix}/episode.srt`]: 'application/x-subrip',
        [`${prefix}/episode.chapters.json`]: 'application/json',
    });
    assert.equal(driveName, 'Test- Episode - One (Editor Light).mp4');
    assert.equal(last['editRender.videoPath'], `${prefix}/episode.mp4`);
    assert.deepEqual(removed, [`episodes/${ID}/editRender/v6-111`]);

    // Length: teaser 2 + intro 3 + edited (20 - 4 cut) + outro 3 = 24 s.
    const seconds = await probeDuration(path.join(store, `${prefix}/episode.mp4`));
    assert.ok(Math.abs(seconds - 24) < 0.5, `rendered ${seconds}s, expected 24s`);
    assert.ok(Math.abs(result.durationSeconds - 24) < 0.5);
    assert.equal(result.cuts, 1);

    // Times moved onto the rendered video: the cut word is gone, the rest shift by the
    // 4 s cut less the 40 ms it stops short of the words on each side (keepRanges), and by
    // the 5 s of teaser and intro in front.
    const words = JSON.parse(fs.readFileSync(path.join(store, `${prefix}/episode.words.json`), 'utf8')) as { text: string; start: number }[];
    assert.deepEqual(words.map(w => w.text), ['hello', 'after']);
    assert.ok(Math.abs(words[1].start - (7000 - 3920 + 5000)) <= 50, `after at ${words[1].start}`);
    const chapters = JSON.parse(fs.readFileSync(path.join(store, `${prefix}/episode.chapters.json`), 'utf8')) as { chapters: { title: string; startMs: number }[] };
    const middle = chapters.chapters.find(c => c.title === 'Middle');
    assert.ok(middle && Math.abs(middle.startMs - (10000 - 3920 + 5000)) <= 50, `Middle at ${middle?.startMs}`);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('job: a failed render never reports ready', async () => {
    const updates: Record<string, unknown>[] = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-fail-'));
    const deps: EditRenderDeps = {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined }),
        download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
        upload: async () => { throw new Error('should not upload'); },
        saveToDrive: async () => { throw new Error('should not save'); },
        update: async fields => { updates.push(fields); },
        render: async () => { throw new Error('ffmpeg exited 1'); },
        now: () => 'NOW',
    };
    await assert.rejects(runEditRender(ID, deps, dir), /ffmpeg exited 1/);
    assert.ok(!updates.some(u => u['editRender.status'] === 'ready'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('job: the site\'s logo (no Studio logo) comes from the repository, never from Storage', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-logo-'));
    const downloads: string[] = [];
    let pictures: { layer: { id: string }; file: string }[] = [];
    const bug = logoBug({ path: SITE_LOGO, name: 'Logo' });
    const upload = { ...bug, id: 'up', element: undefined, media: { path: `episodes/${ID}/media/mabcdef1.png`, name: 'pic' } };
    const siteLogo = path.join(dir, 'logo.png');
    fs.writeFileSync(siteLogo, 'png');
    const deps: EditRenderDeps = {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: { version: 2, cuts: [], layers: [bug, upload] } }),
        download: async (p, dest) => { downloads.push(p); fs.writeFileSync(dest, ''); },
        upload: async () => { throw new Error('should not upload'); },
        saveToDrive: async () => { throw new Error('should not save'); },
        update: async () => {},
        render: async opts => { pictures = opts.onScreen?.pictures ?? []; throw new Error('stop here'); },
        now: () => 'NOW',
        siteLogo,
    };
    await assert.rejects(runEditRender(ID, deps, path.join(dir, 'work')), /stop here/);
    assert.deepEqual(pictures.map(p => [p.layer.id, p.file === siteLogo]), [[bug.id, true], ['up', false]]);
    assert.deepEqual(downloads.filter(p => p.includes('media') || p.startsWith('site')), [`episodes/${ID}/media/mabcdef1.png`]);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('job: library sounds play only while checked; their credits and uses are recorded', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-sounds-'));
    const downloads: string[] = [];
    const updates: Record<string, unknown>[] = [];
    const logged: { ids: string[]; kind: string; ref: string }[] = [];
    let given: string[] = [];
    const bed = { ...newSound({ path: 'library/sbed.mp3', name: 'Calm', library: 'ok' }, 'music', { srcMs: 0, atMs: 0 }), id: 'bed' };
    const hit = { ...newSound({ path: 'library/shit.wav', name: 'Hit', library: 'unchecked' }, 'effect', { srcMs: 0, atMs: 0 }), id: 'hit' };
    const own = { ...newSound({ path: `episodes/${ID}/media/mown123.wav`, name: 'Ours' }, 'effect', { srcMs: 0, atMs: 0 }), id: 'own' };
    const check: LicenceCheck | null = { by: 'u1', name: 'Tom', on: '2026-10-06' };
    const deps: EditRenderDeps = {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: { version: 3, cuts: [], audio: [bed, hit, own] } }),
        download: async (p, dest) => { downloads.push(p); fs.writeFileSync(dest, ''); },
        upload: async () => {},
        saveToDrive: async () => null,
        update: async fields => { updates.push(fields); },
        render: async opts => {
            given = (opts.sounds ?? []).map(s => s.sound.id);
            fs.writeFileSync(opts.out, '');
            return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: ['own', 'bed'] };
        },
        now: () => 'NOW',
        settings: { ...DEFAULT_SETTINGS, finalSource: 'editorLight' },
        library: async ids => new Map(ids.flatMap((id): [string, { path: string; checked: LicenceCheck | null; licence: typeof EMPTY_LICENCE }][] => id === 'ok'
            ? [[id, { path: 'library/sbed.mp3', checked: check, licence: { ...EMPTY_LICENCE, credit: 'Music: Calm by A' } }]]
            : id === 'unchecked' ? [[id, { path: 'library/shit.wav', checked: null, licence: EMPTY_LICENCE }]] : [])),
        logUses: async (ids, use) => { logged.push({ ids, kind: use.kind, ref: use.ref }); },
    };
    const result = await runEditRender(ID, deps, path.join(dir, 'work'), '9');
    // The unchecked one is left out, with a warning; it is never downloaded.
    assert.deepEqual(given, ['bed', 'own']);
    assert.ok(!downloads.includes('library/shit.wav'));
    assert.ok(result.warnings.some(w => /"Hit": its licence is not checked/.test(w)), result.warnings.join(' | '));
    // The credit, on the render and on the final cut it became; the use, on the library entry.
    assert.deepEqual(result.credits, ['Music: Calm by A']);
    const last = updates[updates.length - 1] as { final?: { credits: string[]; library: string[] } };
    assert.deepEqual([last.final?.credits, last.final?.library], [['Music: Calm by A'], ['ok']]);
    assert.deepEqual(logged, [{ ids: ['ok'], kind: 'episode', ref: `episodes/${ID}/editRender/v3-9/episode.mp4` }]);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('the voice clean-up: the edit\'s own choice or the Studio\'s, given to the renderer and kept with the render (spec 019 item 3.2)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-voice-'));
    const run = async (voice: 'standard' | 'deepfilter' | 'auphonic' | null, studio: 'standard' | 'deepfilter' | 'auphonic') => {
        const updates: Record<string, unknown>[] = [];
        let given: Parameters<EditRenderDeps['render']>[0] | null = null;
        await runEditRender(ID, {
            getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: { version: 2, cuts: [], voice } }),
            download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
            upload: async () => {},
            saveToDrive: async () => null,
            update: async fields => { updates.push(fields); },
            render: async opts => {
                given = opts;
                fs.writeFileSync(opts.out, '');
                return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
            },
            now: () => 'NOW',
            settings: { ...DEFAULT_SETTINGS, voiceCleanup: studio },
            voice: { deepFilter: '/opt/deep-filter', auphonicKey: 'k3y' },
        }, path.join(dir, 'work'), '1');
        const ready = updates.find(u => u['editRender.status'] === 'ready')!;
        return { clean: given!.clean, voice: given!.voice, kept: ready['editRender.voice'] };
    };
    assert.deepEqual(await run(null, 'standard').then(r => [r.clean, r.kept]), ['light', 'standard']);
    assert.deepEqual(await run(null, 'deepfilter').then(r => [r.clean, r.kept]), ['deepfilter', 'deepfilter']);
    assert.deepEqual(await run('auphonic', 'deepfilter').then(r => [r.clean, r.kept]), ['auphonic', 'auphonic']);
    const tools = (await run('auphonic', 'standard')).voice!;
    assert.equal(tools.deepFilter, '/opt/deep-filter');
    assert.equal(tools.auphonic?.apiKey, 'k3y');
    assert.equal(planEditRender(episode({ edit: { version: 1, cuts: [] } })).voice, 'standard');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('the files for other editors are saved with the render; when they cannot be made, the render is kept with a warning (spec 019 item 4.1)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-files-'));
    const run = async (exportEdit: EditRenderDeps['exportEdit']) => {
        const uploads: string[] = [];
        const drive: { name: string; type?: string; folder?: string }[] = [];
        const result = await runEditRender(ID, {
            getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: { version: 4, cuts: [{ startMs: 1000, endMs: 3000, reason: 'manual' }] } }),
            download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
            upload: async (_l, p) => { uploads.push(p); },
            saveToDrive: async (_l, name, type, folder) => { drive.push({ name, type, folder }); return { fileId: `f${drive.length}`, folderId: 'F' }; },
            update: async () => {},
            render: async opts => {
                fs.writeFileSync(opts.out, '');
                return { inputSeconds: 20, outputSeconds: 18, cuts: 1, timeSavedSeconds: 2, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
            },
            now: () => 'NOW',
            exportEdit,
        }, path.join(dir, 'work'), '5');
        return { result, uploads, drive };
    };
    let asked: Parameters<NonNullable<EditRenderDeps['exportEdit']>>[0] | null = null;
    const local = path.join(dir, 'r.xml');
    fs.writeFileSync(local, '<xmeml/>');
    const made = await run(async o => {
        asked = o;
        return { files: [{ kind: 'resolve', local, name: 'Test- Episode - One - DaVinci Resolve.xml', contentType: 'application/xml' }], warnings: ['varies'], frameRate: { rate: '25/1', fps: 25, variable: true } };
    });
    // The play order of the saved edit, on the recording's length (two stretches around the cut), and the recording's
    // file name (here the stored one; an episode from Drive gives its original name).
    assert.equal(asked!.clips.length, 2);
    assert.equal(asked!.clips[1].endMs, 20_000);
    assert.equal(asked!.name, path.basename(planEditRender(episode()).video));
    assert.ok(made.uploads.includes(`episodes/${ID}/editRender/v4-5/edit-files/resolve.xml`));
    assert.deepEqual(made.drive[1], { name: 'Test- Episode - One - DaVinci Resolve.xml', type: 'application/xml', folder: 'Test- Episode - One (for other editors)' });
    assert.deepEqual(made.result.exports, [{ kind: 'resolve', name: 'Test- Episode - One - DaVinci Resolve.xml', path: `episodes/${ID}/editRender/v4-5/edit-files/resolve.xml`, driveUrl: 'https://drive.google.com/file/d/f2/view' }]);
    assert.ok(made.result.warnings.includes('varies'));

    const failed = await run(async () => { throw new Error('auto-editor exited 1'); });
    assert.deepEqual(failed.result.exports, []);
    assert.ok(failed.result.warnings.some(w => /files for Resolve, Premiere and Final Cut were not made: auto-editor exited 1/.test(w)));
    assert.equal(failed.result.videoPath, `episodes/${ID}/editRender/v4-5/episode.mp4`);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('finished windows are kept under the run\'s work folder for a re-run, and removed once the render is saved (spec 019 item 4.2)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-work-'));
    const stored = new Set([`episodes/${ID}/editRender/work/77/window-0-abc.mkv`]);
    const uploads: string[] = [], downloads: string[] = [], removed: string[] = [];
    let found: boolean[] = [];
    await runEditRender(ID, {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: { version: 2, cuts: [] } }),
        download: async (p, dest) => { downloads.push(p); fs.writeFileSync(dest, ''); },
        upload: async (_l, p) => { uploads.push(p); },
        exists: async p => stored.has(p),
        removeFolder: async p => { removed.push(p); },
        saveToDrive: async () => null,
        update: async () => {},
        render: async opts => {
            found = [await opts.store!.get('window-0-abc.mkv', path.join(dir, 'a.mkv')), await opts.store!.get('window-1-def.mkv', path.join(dir, 'b.mkv'))];
            await opts.store!.put(path.join(dir, 'b.mkv'), 'window-1-def.mkv');
            fs.writeFileSync(opts.out, '');
            return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
        },
        now: () => 'NOW',
    }, path.join(dir, 'work'), '77');
    assert.deepEqual(found, [true, false]);
    assert.ok(downloads.includes(`episodes/${ID}/editRender/work/77/window-0-abc.mkv`));
    assert.ok(uploads.includes(`episodes/${ID}/editRender/work/77/window-1-def.mkv`));
    assert.ok(removed.includes(`episodes/${ID}/editRender/work`));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('speaker tracks: downloaded and given to the renderer, unless the edit turns them off; the render says how many (spec 019 item 3.3)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-tracks-'));
    const speakerTracks = [
        { path: `episodes/${ID}/source/tracks/1-audioTom.m4a`, name: 'Tom', fileName: 'audioTom.m4a' },
        { path: `episodes/${ID}/source/tracks/2-audioAna.m4a`, name: 'Ana', fileName: 'audioAna.m4a' },
    ];
    const run = async (use: boolean | undefined) => {
        const downloads: string[] = [], updates: Record<string, unknown>[] = [];
        let given: string[] | undefined;
        await runEditRender(ID, {
            getEpisode: async () => {
                const e = episode({ package: undefined, review: {}, broll: undefined, edit: { version: 1, cuts: [], speakerTracks: use } });
                return { ...e, media: { ...e.media, speakerTracks } };
            },
            download: async (p, dest) => { downloads.push(p); fs.writeFileSync(dest, ''); },
            upload: async () => {},
            saveToDrive: async () => null,
            update: async f => { updates.push(f); },
            render: async opts => {
                given = opts.tracks;
                fs.writeFileSync(opts.out, '');
                return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
            },
            now: () => 'NOW',
        }, path.join(dir, 'work'), '1');
        return { given, downloads, tracks: updates.find(u => u['editRender.status'] === 'ready')!['editRender.tracks'] };
    };
    const on = await run(undefined);
    assert.equal(on.given?.length, 2);
    assert.ok(on.given!.every(f => /track-\d\.m4a$/.test(f)));
    assert.ok(speakerTracks.every(t => on.downloads.includes(t.path)));
    assert.equal(on.tracks, 2);
    const off = await run(false);
    assert.equal(off.given, undefined);
    assert.equal(off.tracks, 0);
    assert.ok(!off.downloads.some(p => p.includes('/tracks/')));
    fs.rmSync(dir, { recursive: true, force: true });
});
