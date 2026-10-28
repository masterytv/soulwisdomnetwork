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
import { cutClip, probeDuration } from './media';
import { highlight, logoBug, motionEndScreen, motionLogoBug, motionLowerThird, SITE_LOGO } from '../../../lib/layers';
import { HIGHLIGHT_KEYFRAMES } from '../../../lib/reframe';
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

test('plan: the intro from a ready package; the teasers are the edit\'s clips, never the package\'s files (spec 022 D1)', () => {
    const ready = planEditRender(episode());
    assert.deepEqual(ready.programme.clips.map(c => c.kind), ['intro', 'episode', 'outro']);
    assert.equal(ready.intro, `episodes/${ID}/package/intro.mp4`);
    assert.equal(ready.warnings.length, 0);
    const e = episode();
    e.package!.status = 'building';
    assert.equal(planEditRender(e).intro, null);
    // Saved before the edit had teasers: the approved notes' clips, as the editor shows them, labelled.
    const old = episode();
    (old.notes!.approved as { teaserClips?: unknown }).teaserClips = [{ text: 'hi', speaker: 'Sam', startMs: 12_000, endMs: 13_100 }];
    const plan = planEditRender(old);
    assert.deepEqual(plan.programme.clips[0], { id: 't1', kind: 'recording', inMs: 11_700, outMs: 13_700, name: 'Sam' });
    assert.deepEqual(plan.programme.layers.map(l => l.fields.speaker), ['Sam']);
    assert.equal(plan.warnings.length, 0);
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
    // A 2 s teaser of the edit's own, without its label, cut from the recording (spec 022: never the package's file).
    const e = episode();
    e.edit!.teasers = [{ startMs: 14_000, endMs: 16_000, speaker: 'Host', tag: false }];
    await clip(put(e.media!.sourcePath!), 20, 440);
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
        settings: { ...DEFAULT_SETTINGS, finalSource: 'descript' },   // the render beside Descript's final cut
        getEpisode: async () => e,
        download: async (p, dest) => { downloads.push(p); fs.copyFileSync(path.join(store, p), dest); },
        upload: async (local, p, type) => { uploads[p] = type; fs.copyFileSync(local, put(p)); },
        saveToDrive: async (_local, name) => { driveName = name; return { fileId: 'drive-file-1', folderId: 'folder-04' }; },
        update: async fields => { updates.push(fields); },
        removeFolder: async prefix => { removed.push(prefix); },
        render: renderEdit,
        now: () => 'NOW',
        cutClip: async (input, output, start, seconds) => { await cutClip(input, output, start, seconds, true); },
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
        e.broll!.images!['0'].path, e.package!.introPath!,
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

test('Studio sound is given who speaks when, from the accepted transcript; a clip is no one\'s voice (spec 019 item 3.4)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-studio-'));
    const lines = [
        { speaker: 'A', name: 'Tom', clip: false, start: 0, end: 4000, text: 'Hello there', words: [{ text: 'Hello', start: 0, end: 500 }] },
        { speaker: 'C', name: 'Clip', clip: true, start: 4000, end: 9000, text: 'From a video', words: [{ text: 'From', start: 4000, end: 4300 }] },
        { speaker: 'B', name: 'Jo', clip: false, start: 9500, end: 12000, text: 'Hi', words: [{ text: 'Hi', start: 9500, end: 9800 }] },
    ];
    const run = async (studio: 'standard' | 'studio') => {
        let given: Parameters<EditRenderDeps['render']>[0] | null = null;
        await runEditRender(ID, {
            getEpisode: async () => episode({ package: undefined, broll: undefined, edit: { version: 2, cuts: [] } }),
            download: async (p, dest) => { fs.writeFileSync(dest, p.endsWith('reviewed.json') ? JSON.stringify({ lines }) : ''); },
            upload: async () => {},
            saveToDrive: async () => null,
            update: async () => {},
            render: async opts => {
                given = opts;
                fs.writeFileSync(opts.out, '');
                return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
            },
            now: () => 'NOW',
            settings: { ...DEFAULT_SETTINGS, voiceCleanup: studio },
            voice: { deepFilter: '/opt/deep-filter' },
        }, path.join(dir, 'work'), '1');
        return given!;
    };
    const studio = await run('studio');
    assert.equal(studio.clean, 'studio');
    assert.equal(studio.voice?.warmthDb, 0);
    assert.deepEqual(studio.voice?.turns, [
        { speaker: 'A', startMs: 0, endMs: 4000 }, { speaker: '', startMs: 4000, endMs: 9000 }, { speaker: 'B', startMs: 9500, endMs: 12000 },
    ]);
    assert.equal((await run('standard')).voice?.turns, undefined);
    assert.equal((await run('standard')).voice?.warmthDb, undefined);
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

test('the episode\'s own intro and outro, from its media, replace the Studio\'s (spec 020 item E9)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-ends-'));
    const run = async (edit: Partial<Episode['edit']>) => {
        let given: { intro?: string; outro?: string } = {};
        await runEditRender(ID, {
            getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: { version: 1, cuts: [], ...edit } }),
            download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
            upload: async () => {},
            saveToDrive: async () => null,
            update: async () => {},
            render: async opts => {
                // Spec 022: the whole video's files, in order.
                const file = (kind: string) => { const f = opts.programme?.find(p => p.kind === kind)?.file; return f && path.basename(f); };
                given = { intro: file('intro'), outro: file('outro') };
                fs.writeFileSync(opts.out, '');
                return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
            },
            now: () => 'NOW',
            settings: { ...DEFAULT_SETTINGS, intro: 'custom', introPath: 'settings/intro-1.mp4' },
        }, path.join(dir, 'work'), '1');
        return given;
    };
    assert.deepEqual(await run({}), { intro: 'intro.mp4', outro: 'intro.mp4' });
    assert.deepEqual(await run({ intro: { path: `episodes/${ID}/media/mv1.mp4`, name: 'New intro' } }), { intro: 'own-intro.mp4', outro: 'intro.mp4' });
    assert.deepEqual(await run({ outro: { path: `episodes/${ID}/media/mv2.mp4`, name: 'Goodbye' } }), { intro: 'intro.mp4', outro: 'own-outro.mp4' });
    // Item E14: none in this episode.
    assert.deepEqual(await run({ intro: false }), { intro: undefined, outro: 'intro.mp4' });
    assert.deepEqual(await run({ intro: false, outro: false }), { intro: undefined, outro: undefined });
    fs.rmSync(dir, { recursive: true, force: true });
});

test('the edit\'s own teasers are cut exactly, with the "In this episode" tag unless it was taken off (spec 020 items E10, E14)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-tags-'));
    const cut: { start: number; tag?: { speaker: string } }[] = [];
    await runEditRender(ID, {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: { version: 1, cuts: [], teasers: [
            { startMs: 1000, endMs: 3000, speaker: 'Ana' },
            { startMs: 5000, endMs: 7000, speaker: 'Ben', tag: false },
        ] } }),
        download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
        upload: async () => {},
        saveToDrive: async () => null,
        update: async () => {},
        cutClip: async (_in, out, start, _s, tag) => { cut.push({ start, tag }); fs.writeFileSync(out, ''); },
        render: async opts => {
            fs.writeFileSync(opts.out, '');
            return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
        },
        now: () => 'NOW',
        settings: { ...DEFAULT_SETTINGS, intro: 'none' },
    }, path.join(dir, 'work'), '1');
    assert.deepEqual(cut, [{ start: 1, tag: { speaker: 'Ana' } }, { start: 5, tag: undefined }]);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('motion graphics: drawn once and kept in Storage; a kept clip is fetched, not drawn; no renderer warns (spec 021 M1)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-graphics-'));
    const graphic = { ...motionLowerThird(1000, 'Maria Santos', false), id: 'm1' };
    const fakeRender: EditRenderDeps['render'] = async opts => {
        given = (opts.onScreen?.pictures ?? []).map(p => ({ id: p.layer.id, path: p.layer.media.path, file: p.file }));
        fs.writeFileSync(opts.out, '');
        return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
    };
    let given: { id: string; path: string; file: string }[] = [];
    const run = async (over: Partial<EditRenderDeps>, kept: boolean) => {
        const drawn: string[] = [];
        const uploads: string[] = [];
        const downloads: string[] = [];
        const result = await runEditRender(ID, {
            getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: { version: 1, cuts: [], layers: [graphic] } }),
            download: async (p, dest) => { downloads.push(p); fs.writeFileSync(dest, ''); },
            upload: async (_local, p) => { uploads.push(p); },
            saveToDrive: async () => null,
            update: async () => {},
            exists: async p => kept && p.includes('/graphics/'),
            render: fakeRender,
            now: () => 'NOW',
            settings: { ...DEFAULT_SETTINGS, intro: 'none' },
            graphics: { name: () => 'lowerThird-abc123.mov', draw: async (_spec, out) => { drawn.push(out); fs.writeFileSync(out, ''); } },
            ...over,
        }, path.join(dir, `work-${kept}-${Math.random().toString(36).slice(2)}`), '1');
        return { drawn, uploads, downloads, result };
    };
    const clipPath = `episodes/${ID}/graphics/lowerThird-abc123.mov`;
    // Not kept yet: drawn and uploaded, then overlaid as a silent video layer across the frame.
    const fresh = await run({}, false);
    assert.equal(fresh.drawn.length, 1);
    assert.ok(fresh.uploads.includes(clipPath));
    assert.deepEqual(given.map(g => [g.id, g.path]), [['m1-clip', clipPath]]);
    // Kept from an earlier render: fetched, never drawn again.
    const kept = await run({}, true);
    assert.deepEqual(kept.drawn, []);
    assert.ok(kept.downloads.includes(clipPath));
    assert.ok(!kept.uploads.includes(clipPath));
    // No graphics renderer on the runner: the render still finishes, with a warning.
    const without = await run({ graphics: undefined }, false);
    assert.ok(without.result.warnings.some(w => /graphics renderer/.test(w)), without.result.warnings.join(' | '));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('motion graphics M2: the end screen and starlight go to the programme, the bug loops, teasers get the motion tag (spec 021)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-m2-'));
    const drawn: { template: string; durationMs: number; logo: boolean }[] = [];
    const tagged: string[] = [];
    let given: { overlays?: { durationMs: number; fromEnd?: number; at?: string }[]; pictures: { id: string; loop?: boolean }[] } = { pictures: [] };
    const logo = path.join(dir, 'logo-trimmed.png');
    fs.writeFileSync(logo, 'png');
    const layers = [motionLogoBug(), motionEndScreen()];
    await runEditRender(ID, {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: {
            version: 1, cuts: [], layers,
            teasers: [{ startMs: 1000, endMs: 4000, speaker: 'Ana' }],
            joins: [{ at: 'afterTeasers', transition: 'starlight', durationMs: 1000 }],
        } }),
        download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
        upload: async () => {},
        saveToDrive: async () => null,
        update: async () => {},
        cutClip: async (_in, out, _start, _s, tag) => { assert.equal(tag, undefined); fs.writeFileSync(out, ''); },
        overlayClip: async (input, _overlay, out) => { tagged.push(path.basename(input)); fs.writeFileSync(out, ''); },
        render: async opts => {
            given = {
                overlays: opts.overlays?.map(o => ({ durationMs: o.durationMs, fromEnd: o.fromEnd, at: o.at })),
                pictures: (opts.onScreen?.pictures ?? []).map(p => ({ id: p.layer.id, loop: p.loop })),
            };
            assert.ok(opts.programme?.[0].file?.endsWith('-tagged.mp4'), 'the teaser should carry the motion tag');
            fs.writeFileSync(opts.out, '');
            return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
        },
        now: () => 'NOW',
        settings: { ...DEFAULT_SETTINGS, intro: 'none' },
        graphics: { name: spec => `${spec.template}-x.mov`, draw: async (spec, out, logoFile) => { drawn.push({ template: spec.template, durationMs: spec.durationMs, logo: !!logoFile }); fs.writeFileSync(out, ''); } },
        logoTrimmed: logo,
    }, path.join(dir, 'work'), '3');
    fs.rmSync(dir, { recursive: true, force: true });
    // The bug's 12 s clip loops under its whole-episode layer; the end screen and starlight ride the programme.
    assert.deepEqual(given.pictures, [{ id: `${layers[0].id}-clip`, loop: true }]);
    assert.deepEqual(given.overlays, [
        { durationMs: 20_000, fromEnd: 20_000, at: undefined },
        { durationMs: 1000, fromEnd: undefined, at: 'clip:episode' },
    ]);
    assert.deepEqual(drawn.map(d => [d.template, d.logo]), [['logoBug', true], ['endScreen', true], ['starlight', true], ['teaserTag', true]]);
    assert.equal(drawn[0].durationMs, 12_000);
    assert.deepEqual(tagged, ['teaser-cut-1.mp4']);
});

test('highlights M3: the planes each layout needs are drawn by mode and routed to the render (spec 021)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-m3-'));
    const drawn: { template: string; mode?: string; durationMs: number }[] = [];
    let given: { highlights?: Parameters<typeof renderEdit>[0]['highlights'] } = {};
    const split = highlight(5000, 'splitQuote', 'The soul remembers', '', 'Ana');
    const over = highlight(20_000, 'over', 'What the mind forgets', 'forgets', 'Dan');
    await runEditRender(ID, {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: {
            version: 1, cuts: [], layers: [split, over],
        } }),
        download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
        upload: async () => {},
        saveToDrive: async () => null,
        update: async () => {},
        render: async opts => {
            given = { highlights: opts.highlights };
            fs.writeFileSync(opts.out, '');
            return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
        },
        now: () => 'NOW',
        settings: { ...DEFAULT_SETTINGS, intro: 'none' },
        graphics: { name: spec => `${spec.template}-${spec.mode ?? 'graphics'}.mov`, draw: async (spec, out) => { drawn.push({ template: spec.template, mode: spec.mode, durationMs: spec.durationMs }); fs.writeFileSync(out, ''); } },
    }, path.join(dir, 'work'), '4');
    fs.rmSync(dir, { recursive: true, force: true });
    // splitQuote draws all three planes; over draws only its words.
    assert.deepEqual(drawn.map(d => [d.template, d.mode]), [
        ['highlightSplitQuote', 'graphics'], ['highlightSplitQuote', 'matte'], ['highlightSplitQuote', 'background'],
        ['highlightOver', 'graphics'],
    ]);
    assert.ok(drawn.every(d => d.durationMs === 4000));
    const hs = given.highlights ?? [];
    assert.equal(hs.length, 2);
    assert.deepEqual([hs[0].layout, hs[0].srcMs, hs[0].durationMs], ['splitQuote', 5000, 4000]);
    assert.deepEqual(hs[0].keyframes, HIGHLIGHT_KEYFRAMES.splitQuote);
    assert.ok(hs[0].files.matte && hs[0].files.background && hs[0].files.graphics);
    assert.deepEqual([hs[1].layout, hs[1].files.matte, hs[1].files.background], ['over', undefined, undefined]);
});

test('the teasers\' music and whoosh (Studio settings): given to the render when checked, left out with a warning when not, credited first', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-teaser-sounds-'));
    const check: LicenceCheck | null = { by: 'u1', name: 'Tom', on: '2026-10-28' };
    const updates: Record<string, unknown>[] = [];
    let given: unknown;
    const withTeasers = { version: 1, cuts: [], teasers: [{ startMs: 1000, endMs: 3000, speaker: 'Ana' }, { startMs: 5000, endMs: 7000, speaker: 'Ben' }] };
    const run = (edit: typeof withTeasers | { version: number; cuts: never[] }) => runEditRender(ID, {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit }),
        download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
        upload: async () => {},
        saveToDrive: async () => null,
        update: async fields => { updates.push(fields); },
        cutClip: async (_in, out) => { fs.writeFileSync(out, ''); },
        render: async opts => {
            given = opts.teaserSounds;
            fs.writeFileSync(opts.out, '');
            return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [],
                ...(opts.teaserSounds ? { teaserSoundsPlayed: ['music' as const] } : {}) };
        },
        now: () => 'NOW',
        settings: {
            ...DEFAULT_SETTINGS, intro: 'none',
            teaserMusic: { library: 'bed', path: 'library/bed.mp3', name: 'Starlit', gainDb: -16 },
            teaserWhoosh: { library: 'wh', path: 'library/wh.wav', name: 'Whoosh', gainDb: -12 },
        },
        library: async ids => new Map(ids.flatMap((id): [string, { path: string; checked: LicenceCheck | null; licence: typeof EMPTY_LICENCE }][] => id === 'bed'
            ? [[id, { path: 'library/bed.mp3', checked: check, licence: { ...EMPTY_LICENCE, credit: 'Music: Starlit by B' } }]]
            : id === 'wh' ? [[id, { path: 'library/wh.wav', checked: null, licence: EMPTY_LICENCE }]] : [])),
        logUses: async () => {},
    }, path.join(dir, 'work'), '1');
    const result = await run(withTeasers);
    const g = given as { music?: { sound: { library: string } }; whoosh?: unknown };
    assert.equal(g.music?.sound.library, 'bed');
    assert.equal(g.whoosh, undefined);
    assert.ok(result.warnings.some(w => /whoosh "Whoosh": its licence is not checked/.test(w)), result.warnings.join(' | '));
    assert.deepEqual(result.credits, ['Music: Starlit by B']);
    // No teasers: nothing to play them under.
    given = 'unset';
    await run({ version: 1, cuts: [] });
    assert.equal(given, undefined);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('spec 022 (D2): starlight between teasers plays at every change, each the clip\'s own join', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-stars-'));
    let at: (string | undefined)[] = [];
    await runEditRender(ID, {
        getEpisode: async () => episode({ package: undefined, review: {}, broll: undefined, edit: {
            version: 1, cuts: [],
            teasers: [{ startMs: 1000, endMs: 3000, speaker: 'A' }, { startMs: 4000, endMs: 6000, speaker: 'B' }, { startMs: 7000, endMs: 9000, speaker: 'C' }],
            joins: [{ at: 'betweenTeasers', transition: 'starlight', durationMs: 1000 }],
        } }),
        download: async (_p, dest) => { fs.writeFileSync(dest, ''); },
        upload: async () => {},
        saveToDrive: async () => null,
        update: async () => {},
        cutClip: async (_in, out) => { fs.writeFileSync(out, ''); },
        overlayClip: async (_input, _overlay, out) => { fs.writeFileSync(out, ''); },
        render: async opts => {
            at = (opts.overlays ?? []).map(o => o.at);
            fs.writeFileSync(opts.out, '');
            return { inputSeconds: 1, outputSeconds: 1, cuts: 0, timeSavedSeconds: 0, renderSeconds: 1, qc: {} as never, warnings: [], soundsPlayed: [] };
        },
        now: () => 'NOW',
        settings: { ...DEFAULT_SETTINGS, intro: 'none' },
        graphics: { name: spec => `${spec.template}-x.mov`, draw: async (_spec, out) => { fs.writeFileSync(out, ''); } },
    }, path.join(dir, 'work'), '4');
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(at, ['clip:t2', 'clip:t3']);
});
