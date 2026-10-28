// Editor Light (spec 015), render job: turns the edit saved in the Studio into a finished
// episode. Loads the episode and its edit, downloads the source video, teaser clips, intro
// (also used as the outro) and b-roll stills, runs renderEdit, then saves the video and its
// words, captions and chapter times to Cloud Storage and the video to "04 Final" in Drive.
// Firestore, Storage, Drive and the renderer come in as `deps`, so tests can run the whole
// job on stand-in data. editRenderRun.ts wires in the real services.
//
// The Studio settings (lib/studioSettings.ts) choose the intro (the show's, an uploaded one,
// or none), whether teaser clips play first, and whether this render becomes the episode's
// final cut in place of Descript's, which the thumbnails, Shorts and YouTube steps then use.
// With the default settings and a built edit package, it renders exactly as before.
// Part I: captions (the edit's own choice or the Studio's), text overlays and image overlays go to the renderer.
// Spec 020 item E4: so do the transitions between the video's sections (the edit's own, or the Studio's);
// the ones at splits come with the edit. Item E5: the edit's layers (lib/layers.ts) replace the overlays,
// and once an edit has them its b-roll is among them; before that, the notes plan's b-roll is drawn as always.
// Spec 019 item 3.2: the voice clean-up is the edit's own choice or the Studio's (lib/voice.ts), recorded with the render.
// Item E9 (spec 020): the edit's own play order of sections goes with it; its own intro and outro replace the Studio's.
// Item E10 (spec 020): the edit's own teasers (lib/programme.ts), as the Studio editor shows them, are cut from the recording
// exactly, with the "In this episode" tag. Spec 022: the whole video is the edit's clips (lib/programme.ts programmeEdit, an
// old edit converted as the editor converts it), each recording clip cut exactly with its label, the intro and outro where
// the clips put them, and each change's transition its own or the default for its kind (clipJoins).
// Item 3.3: when the episode has speaker tracks (lib/speakerTracks.ts), the voice is made from them unless its edit says not.
// Item 4.1: files that open the edit's cuts in Resolve, Premiere or Final Cut are saved beside it (editExport.ts); when
// they cannot be made, the render is still kept, with a warning.

import * as fs from 'fs';
import * as path from 'path';
import type { EpisodeEdit } from '../../../lib/edit';
import { captionLook, type CaptionStyle } from '../../../lib/onScreen';
import { isPicture, layersOf, SITE_LOGO, type GraphicLayer, type HighlightLayer, type PictureLayer, type TextLayer } from '../../../lib/layers';
import { asVideoLayer, episodeAnchored, graphicSpec, highlightTemplate, type GraphicSpec } from '../../../lib/graphics';
import { HIGHLIGHT_KEYFRAMES, HIGHLIGHT_LABELS } from '../../../lib/reframe';
import { HIGHLIGHT_PLANES } from './graphics/reframe';
import { createHash } from 'crypto';
import { soundCredits, type LibraryEntry, type LibraryUse, type Sound, type TeaserSound } from '../../../lib/audio';
import { MIN_CHAPTER_MS, type TimedWord } from '../../../lib/retime';
import { DEFAULT_SETTINGS, type StudioSettings } from '../../../lib/studioSettings';
import { sectionJoins, type SectionJoins } from '../../../lib/transitions';
import { voiceFor, WARMTH_DB, type VoiceCleanup } from '../../../lib/voice';
import { usesTracks, type SpeakerTrack } from '../../../lib/speakerTracks';
import { turnsOf, type ReviewedLine, type Turn } from './studioSound';
import type { Episode, EpisodeEditRender } from '../../../types/episode';
import type { ProgrammeInput, renderEdit } from './editRender';
import type { ExportResult } from './editExport';
import { sequenceOf, type Clip } from '../../../lib/sequence';
import { clipJoins, INTRO_CLIP, OUTRO_CLIP, programmeEdit, studioIntro, teasersFromNotes, type ProgrammeEdit } from '../../../lib/programme';

export interface EditRenderDeps {
    getEpisode: () => Promise<Episode | undefined>;
    download: (storagePath: string, dest: string) => Promise<void>;
    upload: (local: string, storagePath: string, contentType: string) => Promise<void>;
    // null when no Drive folder is set up; the video is then only in Cloud Storage.
    // `subfolder`, when given, is a folder of that name inside the final folder.
    saveToDrive: (local: string, name: string, contentType?: string, subfolder?: string) => Promise<{ fileId: string; folderId: string } | null>;
    update: (fields: Record<string, unknown>) => Promise<void>;
    // Deletes every file under a Storage folder: the previous render, once this one is saved.
    removeFolder?: (prefix: string) => Promise<void>;
    // Whether a file is in Storage: with it, finished windows are kept under the run's work folder, so a re-run of
    // the same GitHub run skips them (spec 019 item 4.2).
    exists?: (storagePath: string) => Promise<boolean>;
    render: typeof renderEdit;
    now: () => unknown;                  // a server timestamp in production
    settings?: StudioSettings;           // the defaults when left out
    showIntro?: string;                  // the show's intro in the repository, when there is no edit package
    siteLogo?: string;                   // the site's logo in the repository (lib/layers.ts SITE_LOGO)
    // Cuts a teaser clip from the recording: plainly, when there is no edit package to take clips from, or with the
    // "In this episode" tag and its speaker (`tag`) for the edit's own teasers (item E10).
    cutClip?: (input: string, output: string, startSeconds: number, durationSeconds: number, tag?: { speaker: string }) => Promise<void>;
    // The show library's entries for the sounds' files (spec 020 item E7), and its log of uses.
    library?: (ids: string[]) => Promise<Map<string, Pick<LibraryEntry, 'path' | 'checked' | 'licence'>>>;
    logUses?: (ids: string[], use: LibraryUse) => Promise<void>;
    // The voice clean-ups' tools (spec 019 item 3.2): the deep-filter program, the Auphonic key, and a call made
    // just before the audio goes to Auphonic.
    voice?: { deepFilter?: string; auphonicKey?: string; onAuphonicSending?: () => Promise<void> };
    // The files that open the edit in Resolve, Premiere or Final Cut (spec 019 item 4.1, editExport.ts); left out, none are made.
    exportEdit?: (o: {
        video: string; name: string; title: string; clips: Clip[]; words?: TimedWord[]; workDir: string;
        // Spec 021 M5: the highlights as timeline markers, and the drawn motion clips beside the cuts.
        markers?: { srcMs: number; name: string }[]; graphics?: { local: string; name: string }[];
    }) => Promise<ExportResult>;
    // Motion graphics (spec 021, agent/src/podcast/graphics/render.ts): names a clip by what draws it,
    // and draws it in headless Chromium (`logoFile`: the Studio's logo for templates that draw it). Left
    // out (no Chromium on the runner), graphic layers are skipped with a warning and the teaser tags fall
    // back to the ASS banner.
    graphics?: { name: (spec: GraphicSpec) => string; draw: (spec: GraphicSpec, out: string, logoFile?: string) => Promise<unknown> };
    // The site's trimmed logo in the repository (public/logo-trimmed.png), when the Studio has none of its own.
    logoTrimmed?: string;
    // Lays a clip with alpha over a video, full frame, keeping the video's sound: the motion teaser tag.
    overlayClip?: (input: string, overlay: string, out: string) => Promise<void>;
}

export interface EditRenderPlan {
    edit: EpisodeEdit;
    video: string;                       // Storage path of the source
    // The whole video (spec 022): the edit's clips in order, with the graphics on them.
    programme: ProgrammeEdit;
    intro: string | null;                // Storage path; also closes the episode as the outro
    showIntro: boolean;                  // use the show's intro from the repository (no package)
    // The episode's own intro and outro (spec 020 item E9), from its media bin: they replace the Studio's.
    ownIntro: string | null;
    ownOutro: string | null;
    broll: { atMs: number; seconds: number; image: string }[];   // image = Storage path
    // On screen: the captions look (null for none), text layers, and picture and video layers (Storage paths).
    onScreen: { captions: CaptionStyle | null; texts: TextLayer[]; pictures: PictureLayer[] };
    // Motion graphics (spec 021): drawn into clips before the render, then overlaid as video layers.
    graphics: GraphicLayer[];
    // Highlight moments (spec 021 item M3): the picture reframed by each one's template planes.
    highlights: HighlightLayer[];
    wordsPath: string | null;            // reviewed transcript, Storage path
    chapters: { title: string; startMs: number }[];
    quotes: { text: string; speaker: string; startMs: number; endMs: number }[];
    sections: SectionJoins;              // the transitions between the video's sections
    sounds: Sound[];                     // music and effects (spec 020 item E7)
    voice: VoiceCleanup;                 // the voice clean-up (spec 019 item 3.2)
    warmthDb: number;                    // Studio sound's warmth (item 3.4), from the Studio settings
    tracks: SpeakerTrack[];              // the speaker tracks the voice is made from (spec 019 item 3.3); empty: the recording's sound
    warnings: string[];
}

// The renderer's name for each voice clean-up.
const CLEAN_FOR = { standard: 'light', studio: 'studio', deepfilter: 'deepfilter', auphonic: 'auphonic' } as const satisfies Record<VoiceCleanup, string>;

// Drive allows almost anything in a name, but the file gets downloaded to Macs and PCs.
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

// Decides what the render needs from the episode and settings, without touching any service, so
// the choices (filled source first, intro as outro, b-roll in idea order) are testable.
export function planEditRender(episode: Episode, settings: StudioSettings = DEFAULT_SETTINGS): EditRenderPlan {
    const edit = episode.edit;
    if (!edit) throw new Error('Save an edit in the Studio editor first');
    const video = episode.package?.episodePath || episode.media?.sourcePath;
    if (!video) throw new Error('The original video is not in Cloud Storage');
    const warnings: string[] = [];
    const pkg = episode.package?.status === 'ready' ? episode.package : undefined;
    const images = Object.values(episode.broll?.images ?? {}).sort((a, b) => a.index - b.index);
    const notes = episode.notes?.status === 'approved' ? episode.notes.approved : undefined;
    if (!notes) warnings.push('The show notes are not approved, so no chapter or quote times were made.');

    // The whole video (spec 022): the edit's own clips, or its old fields converted as the Studio editor converts them;
    // an edit saved before it had teasers gets the approved notes' teaser clips, as the editor shows it (D1).
    const programme = programmeEdit(edit, settings.teasers && notes ? teasersFromNotes(notes.teaserClips ?? []) : []);
    const studio = studioIntro(settings, pkg);
    const intro = studio && studio !== 'site' ? studio.path : null;
    const showIntro = studio === 'site';
    const captions = captionLook(edit, settings);
    const wordsPath = episode.review?.reviewedPath ?? null;
    if (captions && !wordsPath) warnings.push('Captions are on, but the transcript is not accepted, so no captions were burned in.');
    return {
        edit,
        video,
        programme,
        intro,
        showIntro,
        ownIntro: edit.intro ? edit.intro.path : null,
        ownOutro: edit.outro ? edit.outro.path : null,
        // An edit with layers has its b-roll among them (the Studio editor added the notes plan's when it
        // first opened the edit), so the notes plan's is drawn only for an edit without.
        broll: edit.layers ? [] : images.map(i => ({ atMs: i.startMs, seconds: i.durationSeconds, image: i.path })),
        onScreen: {
            captions: wordsPath ? captions : null,
            texts: layersOf(edit).filter((l): l is TextLayer => l.kind === 'text'),
            pictures: layersOf(edit).filter(isPicture),
        },
        graphics: layersOf(edit).filter((l): l is GraphicLayer => l.kind === 'graphic'),
        highlights: layersOf(edit).filter((l): l is HighlightLayer => l.kind === 'highlight'),
        wordsPath,
        chapters: notes?.chapters ?? [],
        quotes: (notes?.quotes ?? []).filter(q => q.endMs > q.startMs)
            .map(q => ({ text: q.text, speaker: q.speaker, startMs: q.startMs, endMs: q.endMs })),
        sections: sectionJoins(edit.joins, settings.joins),
        sounds: edit.audio ?? [],
        voice: voiceFor(edit, settings.voiceCleanup),
        warmthDb: WARMTH_DB[settings.voiceWarmth],
        tracks: usesTracks(episode.media?.speakerTracks, edit) ? episode.media!.speakerTracks! : [],
        warnings,
    };
}

// Runs the whole job. Status moves queued → downloading → rendering → saving → ready;
// the caller marks it failed when this throws. Each render is saved in a folder of its own
// (`runId` names it), and the episode points at it only once every file is there, so a
// render that fails while saving leaves the previous one whole.
export async function runEditRender(episodeId: string, deps: EditRenderDeps, workDir: string, runId = String(Date.now())): Promise<EditRenderResult> {
    const settings = deps.settings ?? DEFAULT_SETTINGS;
    const episode = await deps.getEpisode();
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    const plan = planEditRender(episode, settings);
    fs.mkdirSync(workDir, { recursive: true });

    await deps.update({
        'editRender.status': 'downloading', 'editRender.startedAt': deps.now(), 'editRender.error': null,
        'editRender.editVersion': plan.edit.version, 'editRender.transcriptVersion': episode.review?.acceptedVersion ?? 0,
        updatedAt: deps.now(),
    });
    // Each file is downloaded once, under a name that keeps its extension for ffmpeg.
    const fetched = new Map<string, string>();
    const get = async (storagePath: string, name: string) => {
        const known = fetched.get(storagePath);
        if (known) return known;
        const local = path.join(workDir, `${name}${path.extname(storagePath) || '.mp4'}`);
        await deps.download(storagePath, local);
        fetched.set(storagePath, local);
        return local;
    };
    const video = await get(plan.video, 'source');
    // The whole video (spec 022): each recording clip cut from the recording exactly, with its "In this episode" label
    // as the motion tag (spec 021: teaserTag.html, overlaid below once the graphics are drawn) or, without a graphics
    // renderer, burned in by the cutter as before; a clip with no label is cut plainly. The intro and outro are the
    // episode's own or the Studio's (the outro is the Studio's intro, as always).
    const motionTags = !!deps.graphics && !!deps.overlayClip;
    const tagLater: { file: string; speaker: string; durationMs: number }[] = [];
    const files = new Map<string, string>();
    let cut = 0;
    for (const c of plan.programme.clips) {
        if (c.kind !== 'recording' || !deps.cutClip) continue;
        const out = path.join(workDir, `teaser-cut-${++cut}.mp4`);
        const label = plan.programme.layers.find(l => l.anchor.clip === c.id);
        if (label && motionTags) {
            await deps.cutClip(video, out, c.inMs / 1000, (c.outMs - c.inMs) / 1000);
            tagLater.push({ file: out, speaker: label.fields.speaker, durationMs: label.durationMs });
        } else await deps.cutClip(video, out, c.inMs / 1000, (c.outMs - c.inMs) / 1000, label ? { speaker: label.fields.speaker } : undefined);
        files.set(c.id, out);
    }
    const studioIntro = plan.intro ? await get(plan.intro, 'intro')
        : plan.showIntro && deps.showIntro && fs.existsSync(deps.showIntro) ? deps.showIntro : undefined;
    const intro = plan.programme.clips.some(c => c.kind === 'intro') ? (plan.ownIntro ? await get(plan.ownIntro, 'own-intro') : studioIntro) : undefined;
    const outro = plan.programme.clips.some(c => c.kind === 'outro') ? (plan.ownOutro ? await get(plan.ownOutro, 'own-outro') : studioIntro) : undefined;
    if (intro) files.set(INTRO_CLIP, intro);
    if (outro) files.set(OUTRO_CLIP, outro);
    // Each change's transition, its own or the default for its kind (lib/programme.ts clipJoins, as the editor plays it).
    const names = new Map(plan.programme.clips.map(c => [c.id, c.kind === 'recording' ? `"${c.name || 'a clip'}"` : `the ${c.kind}`]));
    const joins = clipJoins(plan.programme.clips.map(c => ({
        kind: c.kind, id: c.id, ...(c.join ? { join: c.join } : {}), lengthMs: c.kind === 'episode' || files.has(c.id) ? 1 : null,
    })), plan.sections, c => names.get(c.id) ?? c.id);
    const programme: ProgrammeInput[] = joins.map(({ clip, join, label, key }) => ({
        kind: clip.kind === 'recording' ? 'teaser' : clip.kind,
        ...(clip.kind === 'episode' ? {} : { file: files.get(clip.id)! }),
        join: join ? { transition: join, label, key } : null,
    }));
    const broll: { atMs: number; seconds: number; image: string }[] = [];
    for (const [i, b] of plan.broll.entries()) broll.push({ ...b, image: await get(b.image, `broll-${i + 1}`) });
    // Each picture's file, downloaded once; the renderer leaves out what has nothing to show.
    const pictures: { layer: PictureLayer; file: string; loop?: boolean }[] = [];
    for (const [i, l] of plan.onScreen.pictures.entries()) {
        if (l.media.path === SITE_LOGO) {
            if (deps.siteLogo && fs.existsSync(deps.siteLogo)) pictures.push({ layer: l, file: deps.siteLogo });
            continue;
        }
        pictures.push({ layer: l, file: await get(l.media.path, `layer-${i + 1}`) });
    }
    // Motion graphics (spec 021): each clip is drawn by its template in headless Chromium into ProRes 4444
    // with alpha, and kept in Storage under a name made from everything that drew it — a re-render only
    // draws what changed. Episode-anchored graphics go to the renderer as silent video layers (looped when
    // their clip is shorter than the layer: the whole-episode logo bug); the end screen and the starlight
    // clips are overlaid on the programme's own clock (renderEdit's `overlays`).
    const graphicWarnings: string[] = [];
    const overlays: NonNullable<Parameters<typeof renderEdit>[0]['overlays']> = [];
    const highlights: NonNullable<Parameters<typeof renderEdit>[0]['highlights']> = [];
    // The motion graphic layers' drawn clips, for the editor hand-off (spec 021 M5): one file each,
    // named template-hash as the cache names them.
    const exportClips = new Map<string, string>();
    // Time spent actually drawing graphic clips this run, for the Usage page (spec 021 M5).
    let graphicsMs = 0;
    // The starlight joins this edit plays (lib/transitions.ts): the Studio's or the edit's at sections,
    // and the edit's own at splits that are there.
    // Spec 022 (D2): one at each change that has it.
    const starlight = [
        ...programme.flatMap(p => (p.join?.transition.transition === 'starlight' ? [{ key: p.join.key, durationMs: p.join.transition.durationMs }] : [])),
        ...(plan.edit.joins ?? []).flatMap(j => (typeof j.at === 'object' && j.transition === 'starlight' && (plan.edit.splits ?? []).includes(j.at.atSplit)
            ? [{ key: `split:${j.at.atSplit}`, durationMs: j.durationMs }] : [])),
    ];
    const wantGraphics = plan.graphics.length > 0 || plan.highlights.length > 0 || starlight.length > 0;
    if (wantGraphics && !deps.graphics) {
        graphicWarnings.push('Motion graphics were not drawn: the graphics renderer is not on this runner.');
    } else if (deps.graphics) {
        const graphics = deps.graphics;
        // The Studio's logo for the templates that draw it, and its hash, so a changed logo redraws them.
        let logoFile = deps.logoTrimmed && fs.existsSync(deps.logoTrimmed) ? deps.logoTrimmed : undefined;
        if (settings.logoPath) logoFile = await get(settings.logoPath, 'studio-logo').catch(() => logoFile);
        const logoKey = logoFile ? createHash('sha256').update(fs.readFileSync(logoFile)).digest('hex').slice(0, 16) : undefined;
        // One clip per spec, drawn once and kept in Storage. The time spent actually drawing goes to
        // the Usage page (spec 021 M5, editRender.graphicsSeconds); a cached clip costs nothing.
        const drawClip = async (spec: GraphicSpec): Promise<{ local: string; storagePath: string }> => {
            const clipName = graphics.name(spec);
            const storagePath = `episodes/${episodeId}/graphics/${clipName}`;
            const local = path.join(workDir, clipName);
            if (fs.existsSync(local)) return { local, storagePath };
            if (deps.exists && await deps.exists(storagePath)) await deps.download(storagePath, local);
            else {
                const begun = Date.now();
                await graphics.draw(spec, local, logoFile);
                graphicsMs += Date.now() - begun;
                await deps.upload(local, storagePath, 'video/quicktime');
            }
            return { local, storagePath };
        };
        for (const g of plan.graphics) {
            const spec = graphicSpec(g, settings.colors, logoKey);
            const { local, storagePath } = await drawClip(spec);
            exportClips.set(path.basename(local), local);
            if (episodeAnchored(g.anchor)) {
                pictures.push({ layer: asVideoLayer(g, storagePath), file: local, loop: spec.durationMs < g.durationMs });
            } else {
                overlays.push({ file: local, durationMs: Math.min(g.durationMs, spec.durationMs), fromEnd: g.anchor.fromEnd });
            }
        }
        pictures.sort((a, b) => a.layer.track - b.layer.track);
        for (const s of starlight) {
            const { local } = await drawClip({ template: 'starlight', fields: {}, colors: settings.colors, durationMs: s.durationMs, width: 1920, height: 1080 });
            overlays.push({ file: local, durationMs: s.durationMs, at: s.key });
        }
        // Highlight moments (spec 021 item M3): the planes each layout needs, one clip apiece — the words
        // ('graphics'), the window's mask ('matte') and the backdrop ('background') — for the reframe
        // inside the window encode. The logo plays no part, so the clips survive a logo change.
        for (const h of plan.highlights) {
            const planes = HIGHLIGHT_PLANES[h.layout];
            const fields = { words: h.words, emphasis: h.emphasis, speaker: h.speaker };
            const draw = async (mode: 'graphics' | 'matte' | 'background') => (await drawClip({
                template: highlightTemplate(h.layout), fields, colors: settings.colors,
                durationMs: h.durationMs, width: 1920, height: 1080, mode,
            })).local;
            highlights.push({
                layout: h.layout, keyframes: HIGHLIGHT_KEYFRAMES[h.layout],
                srcMs: h.anchor.srcMs, durationMs: h.durationMs,
                files: {
                    graphics: await draw('graphics'),
                    ...(planes.matte ? { matte: await draw('matte') } : {}),
                    ...(planes.background ? { background: await draw('background') } : {}),
                },
            });
        }
        // The motion "In this episode" label onto each cut clip, its progress line spanning the label.
        for (const t of tagLater) {
            const { local } = await drawClip({
                template: 'teaserTag', fields: { speaker: t.speaker }, colors: settings.colors,
                durationMs: t.durationMs, width: 1920, height: 1080,
            });
            const tagged = t.file.replace(/\.mp4$/, '-tagged.mp4');
            await deps.overlayClip!(t.file, local, tagged);
            for (const p of programme) if (p.file === t.file) p.file = tagged;
        }
    }
    // Each sound's file. A show library file plays only while its licence is checked (an admin can take a
    // check back after the sound was placed); the others are left out, with a warning.
    // The teasers' music and whoosh (Studio settings) go by the same rule, and only when there are teasers.
    const teaserPicks = programme.some(p => p.kind === 'teaser')
        ? ([['music', settings.teaserMusic], ['whoosh', settings.teaserWhoosh]] as const).flatMap(([k, t]) => (t ? [{ k, t }] : []))
        : [];
    const libraryIds = [...new Set([...plan.sounds.flatMap(s => (s.library ? [s.library] : [])), ...teaserPicks.map(x => x.t.library)])];
    const library = libraryIds.length && deps.library ? await deps.library(libraryIds) : new Map<string, Pick<LibraryEntry, 'path' | 'checked' | 'licence'>>();
    const sounds: { sound: Sound; file: string }[] = [];
    const soundWarnings: string[] = [];
    for (const [i, s] of plan.sounds.entries()) {
        if (s.library) {
            const entry = library.get(s.library);
            if (!entry || entry.path !== s.media.path) { soundWarnings.push(`The sound "${s.media.name}" is no longer in the show library, so it was left out.`); continue; }
            if (!entry.checked) { soundWarnings.push(`The sound "${s.media.name}": its licence is not checked, so it was left out.`); continue; }
        }
        sounds.push({ sound: s, file: await get(s.media.path, `sound-${i + 1}`) });
    }
    const teaserSounds: { music?: { sound: TeaserSound; file: string }; whoosh?: { sound: TeaserSound; file: string } } = {};
    for (const { k, t } of teaserPicks) {
        const entry = library.get(t.library);
        const label = k === 'music' ? 'The teasers\' music' : 'The teasers\' whoosh';
        if (!entry || entry.path !== t.path) { soundWarnings.push(`${label} "${t.name}" is no longer in the show library, so it was left out.`); continue; }
        if (!entry.checked) { soundWarnings.push(`${label} "${t.name}": its licence is not checked, so it was left out.`); continue; }
        teaserSounds[k] = { sound: t, file: await get(t.path, `teaser-${k}`) };
    }
    const onScreen = plan.onScreen.captions || plan.onScreen.texts.length || pictures.length
        ? { captions: plan.onScreen.captions, texts: plan.onScreen.texts, pictures } : undefined;
    // The speaker tracks, when the render uses them.
    const tracks: string[] = [];
    for (const [i, t] of plan.tracks.entries()) tracks.push(await get(t.path, `track-${i + 1}`));
    let words: TimedWord[] | undefined;
    let turns: Turn[] | undefined;
    if (plan.wordsPath) {
        const local = await get(plan.wordsPath, 'reviewed');
        const reviewed = JSON.parse(fs.readFileSync(local, 'utf8')) as { lines: (ReviewedLine & { words: TimedWord[] })[] };
        words = reviewed.lines.flatMap(l => l.words);
        turns = turnsOf(reviewed.lines);
    }

    await deps.update({ 'editRender.status': 'rendering' });
    // This run's finished windows; GitHub's "Re-run" keeps the run's ID, so it finds them here.
    const work = `episodes/${episodeId}/editRender/work/${runId.replace(/[^\w-]/g, '')}`;
    const out = path.join(workDir, 'episode.mp4');
    const report = await deps.render({
        video, edit: plan.edit, out,
        programme,
        broll: broll.length ? broll : undefined,
        ...(onScreen ? { onScreen } : {}),
        words, chapters: plan.chapters, quotes: plan.quotes,
        sections: plan.sections,
        ...(overlays.length ? { overlays } : {}),
        ...(highlights.length ? { highlights } : {}),
        ...(sounds.length ? { sounds } : {}),
        ...(teaserSounds.music || teaserSounds.whoosh ? { teaserSounds } : {}),
        ...(deps.exists ? { store: {
            get: async (name: string, local: string) => {
                const at = `${work}/${name}`;
                if (!(await deps.exists!(at))) return false;
                await deps.download(at, local);
                return true;
            },
            put: (local: string, name: string) => deps.upload(local, `${work}/${name}`, name.endsWith('.flac') ? 'audio/flac' : 'video/x-matroska'),
        } } : {}),
        ...(tracks.length ? { tracks } : {}),
        clean: CLEAN_FOR[plan.voice],
        voice: {
            deepFilter: deps.voice?.deepFilter,
            ...(plan.voice === 'studio' ? { warmthDb: plan.warmthDb, ...(turns ? { turns } : {}) } : {}),
            ...(deps.voice?.auphonicKey ? { auphonic: { apiKey: deps.voice.auphonicKey, title: `${episode.title} (render)`, onSending: deps.voice.onAuphonicSending } } : {}),
        },
    });
    // The credits the library files it played ask for, and those files, for the description and the log.
    const order = report.soundsPlayed ?? [];
    const played = new Set(order);
    // The teasers' sounds play first, before the episode, so their credits come first.
    const teaserUsed = (report.teaserSoundsPlayed ?? []).flatMap(k => (teaserSounds[k] ? [teaserSounds[k]!.sound.library] : []));
    const credits = [...new Set([
        ...teaserUsed.flatMap(id => { const c = library.get(id)?.licence.credit.trim(); return c ? [c] : []; }),
        ...soundCredits(plan.sounds.map(s => ({ sound: s, span: played.has(s.id) ? { startMs: order.indexOf(s.id), endMs: order.indexOf(s.id) + 1 } : null })), library),
    ])];
    const usedLibrary = [...new Set([...teaserUsed, ...plan.sounds.flatMap(s => (played.has(s.id) && s.library && library.has(s.library) ? [s.library] : []))])];

    // renderEdit writes episode.words.json, .srt and .chapters.json beside the video when
    // it was given words, chapters or quotes; each one found is kept with the video.
    await deps.update({ 'editRender.status': 'saving' });
    const base = `episodes/${episodeId}/editRender`;
    const prefix = `${base}/v${plan.edit.version}-${runId.replace(/[^\w-]/g, '')}`;
    const videoPath = `${prefix}/episode.mp4`;
    await deps.upload(out, videoPath, 'video/mp4');
    const extras: Record<string, string | null> = { wordsPath: null, captionsPath: null, chaptersPath: null };
    const sidecars: [keyof typeof extras, string, string][] = [
        ['wordsPath', 'episode.words.json', 'application/json'],
        ['captionsPath', 'episode.srt', 'application/x-subrip'],
        ['chaptersPath', 'episode.chapters.json', 'application/json'],
    ];
    for (const [key, name, type] of sidecars) {
        const local = path.join(workDir, name);
        if (!fs.existsSync(local)) continue;
        await deps.upload(local, `${prefix}/${name}`, type);
        extras[key] = `${prefix}/${name}`;
    }
    const drive = await deps.saveToDrive(out, `${safeName(episode.title)} (Editor Light).mp4`);
    // The files for other editors (item 4.1), in the render's folder and beside it in Drive.
    const exports: NonNullable<EpisodeEditRender['exports']> = [];
    const exportWarnings: string[] = [];
    if (deps.exportEdit) {
        try {
            const clips = sequenceOf(plan.edit, Math.round(report.inputSeconds * 1000), words).clips;
            const made = await deps.exportEdit({
                video, name: episode.drive?.fileName || path.basename(plan.video), title: safeName(episode.title), clips, words, workDir,
                // Spec 021 M5: each highlight as a marker where it sits; the drawn graphic clips as files.
                ...(plan.highlights.length ? { markers: plan.highlights.map(h => ({
                    srcMs: h.anchor.srcMs,
                    name: `${HIGHLIGHT_LABELS[h.layout]}: ${h.words.length > 60 ? `${h.words.slice(0, 57)}…` : h.words}`,
                })) } : {}),
                ...(exportClips.size ? { graphics: [...exportClips].map(([name, local]) => ({ local, name })) } : {}),
            });
            exportWarnings.push(...made.warnings);
            for (const f of made.files) {
                const storagePath = f.kind === 'graphicClip'
                    ? `${prefix}/edit-files/${path.basename(f.local)}`
                    : `${prefix}/edit-files/${f.kind}${path.extname(f.name)}`;
                await deps.upload(f.local, storagePath, f.contentType);
                const saved = await deps.saveToDrive(f.local, f.name, f.contentType, `${safeName(episode.title)} (for other editors)`);
                exports.push({ kind: f.kind, name: f.name, path: storagePath, driveUrl: saved ? `https://drive.google.com/file/d/${saved.fileId}/view` : null });
            }
        } catch (error) {
            exportWarnings.push(`The files for Resolve, Premiere and Final Cut were not made: ${(error as Error).message}`);
        }
    }
    const result: EditRenderResult = {
        videoPath, ...extras as Pick<EditRenderResult, 'wordsPath' | 'captionsPath' | 'chaptersPath'>,
        driveFileId: drive?.fileId ?? null,
        driveUrl: drive ? `https://drive.google.com/file/d/${drive.fileId}/view` : null,
        folderUrl: drive ? `https://drive.google.com/drive/folders/${drive.folderId}` : null,
        durationSeconds: report.outputSeconds,
        cuts: report.cuts,
        timeSavedSeconds: report.timeSavedSeconds,
        renderSeconds: report.renderSeconds,
        graphicsSeconds: Math.round(graphicsMs / 1000),
        editVersion: plan.edit.version,
        warnings: [...plan.warnings, ...soundWarnings, ...graphicWarnings, ...(report.warnings ?? []), ...exportWarnings],
        qc: report.qc,
        credits,
        exports,
    };
    await deps.update({
        ...Object.fromEntries(Object.entries(result).map(([k, v]) => [`editRender.${k}`, v])),
        'editRender.status': 'ready', 'editRender.finishedAt': deps.now(), 'editRender.error': null,
        'editRender.voice': plan.voice,
        'editRender.tracks': tracks.length,
        updatedAt: deps.now(),
        ...(settings.finalSource === 'editorLight' ? await asFinalCut(prefix, episode, plan, result, workDir, deps, usedLibrary) : {}),
    });
    // The kept windows are no longer needed, nor any an earlier failed run left.
    if (deps.exists && deps.removeFolder) {
        await deps.removeFolder(`episodes/${episodeId}/editRender/work`).catch(error => console.warn(`⚠️ Could not remove the kept windows: ${(error as Error).message}`));
    }
    // Every use of a library file is noted on its entry, so a Content ID claim can be traced to its licence.
    if (usedLibrary.length && deps.logUses) {
        await deps.logUses(usedLibrary, { episodeId, kind: 'episode', ref: videoPath, at: new Date().toISOString() })
            .catch(error => console.warn(`⚠️ Could not log the library's uses: ${(error as Error).message}`));
    }
    // The previous render is no longer used, unless it is still the final cut (the settings
    // changed back to Descript since). Only folders of their own are removed.
    const previous = episode.editRender?.videoPath ? path.posix.dirname(episode.editRender.videoPath) : null;
    const finalNow = settings.finalSource === 'editorLight' ? prefix
        : episode.final?.videoPath ? path.posix.dirname(episode.final.videoPath) : null;
    if (deps.removeFolder && previous && previous !== prefix && previous !== finalNow && previous.startsWith(`${base}/`)) {
        await deps.removeFolder(previous).catch(error => console.warn(`⚠️ Could not remove the previous render: ${(error as Error).message}`));
    }
    return result;
}

// Chapters as YouTube wants them, the same rule final.ts applies (lib/retime.ts retimeChapters):
// the first at 0:00, the rest in order and at least 10 seconds apart. The teasers and intro come
// before the first chapter's time, so it is moved to the start; one that a cut or a neighbour
// left too close is dropped with a warning.
export function tidyChapters(chapters: { title: string; originalMs: number; startMs: number }[]) {
    const out: typeof chapters = [];
    const warnings: string[] = [];
    for (const [i, c] of chapters.entries()) {
        const startMs = i === 0 ? 0 : c.startMs;
        const prev = out[out.length - 1];
        if (prev && startMs - prev.startMs < MIN_CHAPTER_MS) {
            warnings.push(`Chapter "${c.title}" would start within 10 seconds of "${prev.title}" in the render, so it was left out.`);
            continue;
        }
        out.push({ ...c, startMs });
    }
    if (out.length && out.length < 3) warnings.push('YouTube needs at least three chapters to show them.');
    return { chapters: out, warnings };
}

// With the Editor Light render chosen as the final cut (Studio settings), it stands in for the
// one from Descript: the same `final` record, with the words, chapter and quote times on the
// rendered video, so the thumbnails, Shorts and YouTube steps work from it unchanged. Its words
// go in the render's own folder; the record is written with the render's, after every upload.
async function asFinalCut(prefix: string, episode: Episode, plan: EditRenderPlan, result: EditRenderResult,
    workDir: string, deps: EditRenderDeps, library: string[] = []): Promise<Record<string, unknown>> {
    let wordsPath: string | null = null;
    const wordsFile = path.join(workDir, 'episode.words.json');
    if (fs.existsSync(wordsFile)) {
        // The final cut's words are kept as { words } with text, start and end, as final.ts saves them.
        const words = (JSON.parse(fs.readFileSync(wordsFile, 'utf8')) as TimedWord[]).map(w => ({ text: w.text, start: w.start, end: w.end }));
        const local = path.join(workDir, 'final-words.json');
        fs.writeFileSync(local, JSON.stringify({ words }));
        wordsPath = `${prefix}/final-words.json`;
        await deps.upload(local, wordsPath, 'application/json');
    }
    const moved = path.join(workDir, 'episode.chapters.json');
    const timed = fs.existsSync(moved)
        ? JSON.parse(fs.readFileSync(moved, 'utf8')) as { chapters: { startMs: number }[]; quotes: { startMs: number; endMs: number }[] }
        : { chapters: [], quotes: [] };
    // In the order they are heard: moved sections (spec 020 item E9) can bring a later chapter earlier.
    const tidy = tidyChapters(plan.chapters.map((c, i) => ({ title: c.title, originalMs: c.startMs, startMs: timed.chapters[i]?.startMs ?? c.startMs }))
        .sort((a, b) => a.startMs - b.startMs));
    return {
        final: {
            status: 'ready',
            source: 'editorLight',
            editVersion: result.editVersion,
            videoPath: result.videoPath,
            ...(wordsPath ? { wordsPath } : {}),
            ...(result.driveFileId ? { driveFileId: result.driveFileId, driveUrl: result.driveUrl, folderUrl: result.folderUrl } : {}),
            durationSeconds: result.durationSeconds,
            qc: result.qc,
            credits: result.credits,
            library,
            chapters: tidy.chapters,
            quotes: plan.quotes.map((q, i) => ({
                text: q.text, speaker: q.speaker, originalMs: q.startMs,
                startMs: timed.quotes[i]?.startMs ?? q.startMs, endMs: timed.quotes[i]?.endMs ?? q.endMs,
            })),
            notesVersion: episode.notes?.status === 'approved' ? episode.notes.approvedVersion ?? 0 : null,
            warnings: [...result.warnings, ...tidy.warnings],
            startedAt: deps.now(),
            finishedAt: deps.now(),
            error: null,
        },
    };
}

export type EditRenderResult = Required<Pick<EpisodeEditRender,
    'videoPath' | 'wordsPath' | 'captionsPath' | 'chaptersPath' | 'driveFileId' | 'driveUrl' | 'folderUrl'
    | 'durationSeconds' | 'cuts' | 'timeSavedSeconds' | 'renderSeconds' | 'graphicsSeconds' | 'editVersion' | 'warnings' | 'qc' | 'credits' | 'exports'>>;
