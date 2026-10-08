// Editor Light (spec 015): GET and PUT the episode edit (the editor shows only when
// NEXT_PUBLIC_EDITOR_LIGHT is set; these routes answer either way, to producers and admins).
// Matches the notes route pattern: requireRole, version check on PUT (409 on mismatch).
// Part I: on-screen items are checked before saving, and GET adds hour-long links to the overlay images.
// GET also gives the audio's measured silences, for the pause suggestions (spec 019 item 1.1).
// Transitions (spec 020 item E4) are checked too, and one at a split that is no longer there is dropped.
// Layers (spec 020 item E5, lib/layers.ts) replace the overlays once saved: each picture's file must be in the
// episode's media bin (lib/server/mediaBin.ts) or be an overlay upload, and GET links every file they use.
// Sounds (spec 020 item E7, lib/audio.ts): a show library file must have its licence checked, and an
// episode's own sound its uploader's word on the rights; GET links them too. The voice clean-up (spec 019 item 3.2)
// is one of lib/voice.ts's choices, or null for the Studio's. Editing waits for the b-roll images, or for b-roll
// to be skipped (lib/brollGate.ts): GET says why, and PUT refuses. Spec 020 item E10: GET also says whether the episode
// has a saved edit yet (`fresh`: the editor then sets one up), the teasers to place from the approved notes, and where the
// Studio's intro (also its outro) is, so the editor can play it; PUT checks the edit's teasers (lib/programme.ts).
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { handle, requireRole, STUDIO_ROLES, HttpError } from '@/lib/server/staff';
import { adminBucket, adminDb } from '@/lib/server/firebaseAdmin';
import { checkUploaded } from '@/lib/server/uploads';
import { CutsSchema, isReordered, MAX_SPLITS, SplitsSchema, validOrder, type EpisodeEdit } from '@/lib/edit';
import { CaptionChoiceSchema, OverlaysSchema, type CaptionChoice, type Overlay } from '@/lib/onScreen';
import { JoinsSchema, type Join } from '@/lib/transitions';
import { layersOf, LayersSchema, SITE_LOGO, SITE_LOGO_URL, type BinItem, type Layer } from '@/lib/layers';
import { binItems, binPaths } from '@/lib/server/mediaBin';
import { libraryEntries } from '@/lib/server/library';
import { getSettings } from '@/lib/server/studioSettings';
import { SoundsSchema, type Sound } from '@/lib/audio';
import { VOICE_CLEANUPS, type VoiceCleanup } from '@/lib/voice';
import { brollBlock } from '@/lib/brollGate';
import { loadSilences } from '@/lib/server/buildEdit';
import { SHOW_INTRO_URL, studioIntro, teasersFromNotes, TeasersSchema, type Teaser } from '@/lib/programme';

// The episode's own intro or outro (spec 020 item E9): a video from its media bin.
const SectionFileSchema = z.object({ path: z.string().min(1).max(300), name: z.string().max(200) }).strict();
type SectionFile = z.infer<typeof SectionFileSchema>;
import type { Episode } from '@/types/episode';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const doc = await episodeRef((await params).id).get();
    if (!doc.exists) throw new HttpError(404, 'Episode not found');
    const data = doc.data() as Episode;
    const edit = data.edit ?? { cuts: [], version: 0 };
    // Links to every picture the layers (or the overlays they grew from) use, so the editor can show them.
    const overlayUrls: Record<string, string> = {};
    for (const l of layersOf(edit)) {
        if (l.kind === 'text' || overlayUrls[l.media.path]) continue;
        if (l.media.path === SITE_LOGO) { overlayUrls[l.media.path] = SITE_LOGO_URL; continue; }
        const url = await adminBucket().file(l.media.path).getSignedUrl({ action: 'read', expires: Date.now() + 6 * 3600_000 }).then(([u]) => u).catch(() => null);
        if (url) overlayUrls[l.media.path] = url;
    }
    // And to every sound (item E7), so the preview can play them.
    for (const snd of edit.audio ?? []) {
        if (overlayUrls[snd.media.path]) continue;
        const url = await adminBucket().file(snd.media.path).getSignedUrl({ action: 'read', expires: Date.now() + 6 * 3600_000 }).then(([u]) => u).catch(() => null);
        if (url) overlayUrls[snd.media.path] = url;
    }
    // The silences measured at ingest; null for an episode not measured yet, so the editor uses word gaps.
    const silences = await loadSilences(data);
    // Item E10: the teasers an edit set up now would have (from the approved notes, when the Studio plays teasers), and the
    // Studio's intro, which is also the outro unless the episode has its own.
    const settings = await getSettings();
    const notes = data.notes?.status === 'approved' ? data.notes.approved : undefined;
    const teasers = settings.teasers && notes ? teasersFromNotes(notes.teaserClips ?? []) : [];
    const pkg = data.package?.status === 'ready' ? data.package : undefined;
    const intro = studioIntro(settings, pkg);
    const introUrl = intro === 'site' ? SHOW_INTRO_URL
        : intro ? await adminBucket().file(intro.path).getSignedUrl({ action: 'read', expires: Date.now() + 6 * 3600_000 }).then(([u]) => u).catch(() => null) : null;
    const studio = introUrl ? { name: settings.intro === 'custom' ? 'Your intro' : 'The show\'s intro', url: introUrl } : null;
    // Why editing is held, if it is: the b-roll images are neither made nor skipped (lib/brollGate.ts).
    return Response.json({ edit, overlayUrls, silences, brollBlock: brollBlock(data), fresh: !data.edit, teasers, studioIntro: studio });
});

export const PUT = handle<Context>(async (request, { params }) => {
    const { uid } = await requireRole(request, STUDIO_ROLES);
    const ref = episodeRef((await params).id);
    const body = await request.json().catch(() => ({})) as { edit?: { cuts?: unknown; overlays?: unknown; captions?: unknown; splits?: unknown; joins?: unknown; layers?: unknown; audio?: unknown; voice?: unknown; speakerTracks?: unknown; order?: unknown; intro?: unknown; outro?: unknown; teasers?: unknown }; version?: unknown };
    if (!body.edit) throw new HttpError(400, 'Missing edit');
    if (typeof body.version !== 'number') throw new HttpError(400, 'Missing version');
    const cuts = CutsSchema.safeParse(body.edit.cuts);
    if (!cuts.success) throw new HttpError(400, `Not a valid edit: ${cuts.error.issues[0]?.message ?? 'bad cuts'}`);
    // On-screen items (Part I). Left out of the request, they stay as saved.
    let overlays: Overlay[] | undefined;
    if (body.edit.overlays !== undefined) {
        const r = OverlaysSchema.safeParse(body.edit.overlays);
        if (!r.success) throw new HttpError(400, `On-screen items: ${r.error.issues[0]?.message ?? 'not valid'}`);
        overlays = r.data;
    }
    // Split points (full-page editor). Left out of the request, they stay as saved.
    let splits: number[] | undefined;
    if (body.edit.splits !== undefined) {
        const r = SplitsSchema.safeParse(body.edit.splits);
        if (!r.success) throw new HttpError(400, `Splits: ${r.error.issues[0]?.message ?? 'not valid'}`);
        splits = r.data;
    }
    // Transitions (Studio editor). Left out of the request, they stay as saved.
    let joins: Join[] | undefined;
    if (body.edit.joins !== undefined) {
        const r = JoinsSchema.safeParse(body.edit.joins);
        if (!r.success) throw new HttpError(400, `Transitions: ${r.error.issues[0]?.message ?? 'not valid'}`);
        joins = r.data;
    }
    // Layers (Studio editor). Once sent, they replace the overlays for good.
    let layers: Layer[] | undefined;
    if (body.edit.layers !== undefined) {
        const r = LayersSchema.safeParse(body.edit.layers);
        if (!r.success) throw new HttpError(400, `Layers: ${r.error.issues[0]?.message ?? 'not valid'}`);
        layers = r.data;
    }
    // Music and effects (Studio editor, item E7). Left out of the request, they stay as saved.
    let audio: Sound[] | undefined;
    if (body.edit.audio !== undefined) {
        const r = SoundsSchema.safeParse(body.edit.audio);
        if (!r.success) throw new HttpError(400, `Sounds: ${r.error.issues[0]?.message ?? 'not valid'}`);
        audio = r.data;
    }
    let captions: CaptionChoice | null | undefined;
    if (body.edit.captions !== undefined) {
        const r = CaptionChoiceSchema.nullable().safeParse(body.edit.captions);
        if (!r.success) throw new HttpError(400, `Captions: ${r.error.issues[0]?.message ?? 'not valid'}`);
        captions = r.data;
    }
    // The voice clean-up (spec 019 item 3.2). Left out of the request, it stays as saved.
    let voice: VoiceCleanup | null | undefined;
    if (body.edit.voice !== undefined) {
        const r = z.enum(VOICE_CLEANUPS).nullable().safeParse(body.edit.voice);
        if (!r.success) throw new HttpError(400, 'Voice clean-up: not one of the choices');
        voice = r.data;
    }
    // Moved sections and the episode's own intro and outro (spec 020 item E9). Left out of the request, they stay as
    // saved; an order that no longer fits the splits is dropped in the transaction below (the recording's order).
    let order: number[] | null | undefined;
    if (body.edit.order !== undefined) {
        if (body.edit.order !== null && !(Array.isArray(body.edit.order) && body.edit.order.length <= MAX_SPLITS + 1 && body.edit.order.every(n => Number.isInteger(n)))) {
            throw new HttpError(400, 'Order: a list of section numbers');
        }
        order = body.edit.order as number[] | null;
    }
    // false: none in this episode (item E14).
    const ends: { intro?: SectionFile | false | null; outro?: SectionFile | false | null } = {};
    for (const key of ['intro', 'outro'] as const) {
        const v = body.edit[key];
        if (v === undefined) continue;
        if (v === null || v === false) { ends[key] = v; continue; }
        const r = SectionFileSchema.safeParse(v);
        if (!r.success) throw new HttpError(400, `${key === 'intro' ? 'Intro' : 'Outro'}: not valid`);
        ends[key] = r.data;
    }
    if (ends.intro || ends.outro) {
        const episode = (await ref.get()).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        const bin = await binItems(ref.id, episode, await getSettings());
        for (const f of [ends.intro, ends.outro]) {
            if (f && !bin.some(i => i.kind === 'video' && i.path === f.path)) throw new HttpError(400, 'The intro or outro must be a video in this episode\'s media');
        }
    }
    // The teasers (item E10): stretches of the recording. Left out of the request, they stay as saved.
    let teasers: Teaser[] | null | undefined;
    if (body.edit.teasers !== undefined) {
        const r = TeasersSchema.nullable().safeParse(body.edit.teasers);
        if (!r.success) throw new HttpError(400, `Teasers: ${r.error.issues[0]?.message ?? 'not valid'}`);
        teasers = r.data;
    }
    // Whether the render uses the speaker tracks (spec 019 item 3.3). Left out of the request, it stays as saved.
    let speakerTracks: boolean | null | undefined;
    if (body.edit.speakerTracks !== undefined) {
        if (body.edit.speakerTracks !== null && typeof body.edit.speakerTracks !== 'boolean') throw new HttpError(400, 'Speaker tracks: true, false or null');
        speakerTracks = body.edit.speakerTracks;
    }

    // A picture is checked once, when it first appears on the edit: an overlay upload must be a real PNG
    // or JPEG uploaded through the Studio (lib/server/uploads.ts); any other file must be in the episode's
    // media bin.
    const pictures = layers ? layers.flatMap(l => l.kind === 'text' ? [] : [l.media.path])
        : overlays ? overlays.flatMap(o => o.type === 'image' ? [o.path] : []) : [];
    if (pictures.length) {
        const episode = (await ref.get()).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        const saved = new Set(layersOf(episode.edit ?? { cuts: [], version: 0 }).flatMap(l => l.kind === 'text' ? [] : [l.media.path]));
        let bin: Set<string> | null = null;
        for (const path of new Set(pictures)) {
            if (saved.has(path)) continue;
            if (path.startsWith('overlays/')) { await checkUploaded('overlay', path); continue; }
            bin ??= await binPaths(ref.id, episode);
            if (!bin.has(path)) throw new HttpError(400, 'A layer uses a file that is not in this episode\'s media bin');
        }
    }

    // A sound is checked when it first appears on the edit: a show library file must be there with its
    // licence checked, and an episode's own sound must be in its bin with its uploader's word on the rights.
    if (audio?.length) {
        const episode = (await ref.get()).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        const saved = new Set((episode.edit?.audio ?? []).map(s => `${s.library ?? ''}|${s.media.path}`));
        const fresh = audio.filter(s => !saved.has(`${s.library ?? ''}|${s.media.path}`));
        const library = await libraryEntries(fresh.flatMap(s => (s.library ? [s.library] : [])));
        let bin: BinItem[] | null = null;
        for (const s of fresh) {
            if (s.library) {
                const entry = library.get(s.library);
                if (!entry || entry.path !== s.media.path) throw new HttpError(400, `"${s.media.name}" is not in the show library`);
                if (!entry.checked) throw new HttpError(400, `"${s.media.name}": licence not checked, so it cannot be placed yet`);
                continue;
            }
            bin ??= await binItems(ref.id, episode, await getSettings());
            const item = bin.find(i => i.source === 'upload' && i.kind === 'audio' && i.path === s.media.path);
            if (!item) throw new HttpError(400, `"${s.media.name}" is not in this episode's media`);
            if (!item.rights) throw new HttpError(400, `"${s.media.name}": nobody has said it is theirs to use`);
        }
    }

    // In a transaction, so two saves at the same moment cannot both pass the version check.
    const newVersion = await adminDb().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'Episode not found');
        const current = (snap.data() as { edit?: EpisodeEdit }).edit;
        // Editing waits for the b-roll images, or for b-roll to be skipped (lib/brollGate.ts).
        const held = brollBlock(snap.data() as Episode);
        if (held) throw new HttpError(409, held);
        if ((current?.version ?? 0) !== body.version) {
            throw new HttpError(409, 'Version mismatch — someone else edited');
        }
        const version = (current?.version ?? 0) + 1;
        // A transition at a split goes with its split.
        const keptSplits = splits ?? current?.splits ?? [];
        const keptJoins = (joins ?? current?.joins ?? []).filter(j => typeof j.at === 'string' || keptSplits.includes(j.at.atSplit));
        tx.update(ref, {
            edit: {
                cuts: cuts.data, version, updatedAt: new Date().toISOString(), updatedBy: uid,
                // Layers, once sent, replace the overlays; the overlays stay for an edit that has none.
                overlays: (layers ?? current?.layers) ? [] : overlays ?? current?.overlays ?? [],
                ...((layers ?? current?.layers) ? { layers: layers ?? current?.layers } : {}),
                captions: captions !== undefined ? captions : current?.captions ?? null,
                voice: voice !== undefined ? voice : current?.voice ?? null,
                speakerTracks: speakerTracks !== undefined ? speakerTracks : current?.speakerTracks ?? null,
                order: (() => {
                    const o = order !== undefined ? order : current?.order ?? null;
                    return o && validOrder(o, keptSplits.length + 1) && isReordered(o) ? o : null;
                })(),
                intro: ends.intro !== undefined ? ends.intro : current?.intro ?? null,
                outro: ends.outro !== undefined ? ends.outro : current?.outro ?? null,
                teasers: teasers !== undefined ? teasers : current?.teasers ?? null,
                splits: keptSplits,
                joins: keptJoins,
                ...((audio ?? current?.audio) ? { audio: audio ?? current?.audio } : {}),
            },
            updatedAt: FieldValue.serverTimestamp(),
        });
        return version;
    });
    return Response.json({ version: newVersion });
});
