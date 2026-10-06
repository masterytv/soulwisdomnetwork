// Editor Light (spec 015): GET and PUT the episode edit (the editor shows only when
// NEXT_PUBLIC_EDITOR_LIGHT is set; these routes answer either way, to producers and admins).
// Matches the notes route pattern: requireRole, version check on PUT (409 on mismatch).
// Part I: on-screen items are checked before saving, and GET adds hour-long links to the overlay images.
// GET also gives the audio's measured silences, for the pause suggestions (spec 019 item 1.1).
// Transitions (spec 020 item E4) are checked too, and one at a split that is no longer there is dropped.
import { FieldValue } from 'firebase-admin/firestore';
import { handle, requireRole, STUDIO_ROLES, HttpError } from '@/lib/server/staff';
import { adminBucket, adminDb } from '@/lib/server/firebaseAdmin';
import { checkUploaded } from '@/lib/server/uploads';
import { CutsSchema, SilencesFileSchema, SplitsSchema, type EpisodeEdit, type Silence } from '@/lib/edit';
import { CaptionChoiceSchema, OverlaysSchema, type CaptionChoice, type Overlay } from '@/lib/onScreen';
import { JoinsSchema, type Join } from '@/lib/transitions';

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
    // Links to the image overlays, so the editor can show them over the video.
    const overlayUrls: Record<string, string> = {};
    for (const o of edit.overlays ?? []) {
        if (o.type !== 'image' || overlayUrls[o.path]) continue;
        const url = await adminBucket().file(o.path).getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60_000 }).then(([u]) => u).catch(() => null);
        if (url) overlayUrls[o.path] = url;
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
    const body = await request.json().catch(() => ({})) as { edit?: { cuts?: unknown; overlays?: unknown; captions?: unknown; splits?: unknown; joins?: unknown }; version?: unknown };
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
    let captions: CaptionChoice | null | undefined;
    if (body.edit.captions !== undefined) {
        const r = CaptionChoiceSchema.nullable().safeParse(body.edit.captions);
        if (!r.success) throw new HttpError(400, `Captions: ${r.error.issues[0]?.message ?? 'not valid'}`);
        captions = r.data;
    }

    // An image is checked once, when it first appears on the edit: it must be a real PNG or JPEG
    // uploaded through the Studio (lib/server/uploads.ts).
    if (overlays) {
        const saved = new Set(((await ref.get()).data() as { edit?: EpisodeEdit } | undefined)?.edit?.overlays
            ?.flatMap(o => o.type === 'image' ? [o.path] : []) ?? []);
        for (const path of new Set(overlays.flatMap(o => o.type === 'image' ? [o.path] : []))) {
            if (!saved.has(path)) await checkUploaded('overlay', path);
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
                overlays: overlays ?? current?.overlays ?? [],
                captions: captions !== undefined ? captions : current?.captions ?? null,
                splits: keptSplits,
                joins: keptJoins,
            },
            updatedAt: FieldValue.serverTimestamp(),
        });
        return version;
    });
    return Response.json({ version: newVersion });
});
