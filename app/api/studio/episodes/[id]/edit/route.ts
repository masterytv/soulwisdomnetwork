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
// is one of lib/voice.ts's choices, or null for the Studio's.
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { handle, requireRole, STUDIO_ROLES, HttpError } from '@/lib/server/staff';
import { adminBucket, adminDb } from '@/lib/server/firebaseAdmin';
import { checkUploaded } from '@/lib/server/uploads';
import { CutsSchema, SilencesFileSchema, SplitsSchema, type EpisodeEdit, type Silence } from '@/lib/edit';
import { CaptionChoiceSchema, OverlaysSchema, type CaptionChoice, type Overlay } from '@/lib/onScreen';
import { JoinsSchema, type Join } from '@/lib/transitions';
import { layersOf, LayersSchema, SITE_LOGO, SITE_LOGO_URL, type BinItem, type Layer } from '@/lib/layers';
import { binItems, binPaths } from '@/lib/server/mediaBin';
import { libraryEntries } from '@/lib/server/library';
import { getSettings } from '@/lib/server/studioSettings';
import { SoundsSchema, type Sound } from '@/lib/audio';
import { VOICE_CLEANUPS, type VoiceCleanup } from '@/lib/voice';
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
    const data = doc.data() as { edit?: EpisodeEdit; media?: { silencesPath?: string } };
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
    let silences: Silence[] | null = null;
    if (data.media?.silencesPath) {
        const raw = await adminBucket().file(data.media.silencesPath).download().then(([b]) => JSON.parse(b.toString('utf8'))).catch(() => null);
        const parsed = SilencesFileSchema.safeParse(raw);
        if (parsed.success) silences = parsed.data.silences;
    }
    return Response.json({ edit, overlayUrls, silences });
});

export const PUT = handle<Context>(async (request, { params }) => {
    const { uid } = await requireRole(request, STUDIO_ROLES);
    const ref = episodeRef((await params).id);
    const body = await request.json().catch(() => ({})) as { edit?: { cuts?: unknown; overlays?: unknown; captions?: unknown; splits?: unknown; joins?: unknown; layers?: unknown; audio?: unknown; voice?: unknown }; version?: unknown };
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
