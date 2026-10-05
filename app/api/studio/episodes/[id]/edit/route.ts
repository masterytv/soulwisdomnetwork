// Editor Light (spec 015): GET and PUT the episode edit (the editor shows only when
// NEXT_PUBLIC_EDITOR_LIGHT is set; these routes answer either way, to producers and admins).
// Matches the notes route pattern: requireRole, version check on PUT (409 on mismatch).
// Part I: on-screen items are checked before saving, and GET adds hour-long links to the overlay images.
import { FieldValue } from 'firebase-admin/firestore';
import { handle, requireRole, STUDIO_ROLES, HttpError } from '@/lib/server/staff';
import { adminBucket, adminDb } from '@/lib/server/firebaseAdmin';
import { checkUploaded } from '@/lib/server/uploads';
import { CutsSchema, type EpisodeEdit } from '@/lib/edit';
import { CaptionChoiceSchema, OverlaysSchema, type CaptionChoice, type Overlay } from '@/lib/onScreen';

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
    const edit = (doc.data() as { edit?: EpisodeEdit }).edit ?? { cuts: [], version: 0 };
    // Links to the image overlays, so the editor can show them over the video.
    const overlayUrls: Record<string, string> = {};
    for (const o of edit.overlays ?? []) {
        if (o.type !== 'image' || overlayUrls[o.path]) continue;
        const url = await adminBucket().file(o.path).getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60_000 }).then(([u]) => u).catch(() => null);
        if (url) overlayUrls[o.path] = url;
    }
    return Response.json({ edit, overlayUrls });
});

export const PUT = handle<Context>(async (request, { params }) => {
    const { uid } = await requireRole(request, STUDIO_ROLES);
    const ref = episodeRef((await params).id);
    const body = await request.json().catch(() => ({})) as { edit?: { cuts?: unknown; overlays?: unknown; captions?: unknown }; version?: unknown };
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
        tx.update(ref, {
            edit: {
                cuts: cuts.data, version, updatedAt: new Date().toISOString(), updatedBy: uid,
                overlays: overlays ?? current?.overlays ?? [],
                captions: captions !== undefined ? captions : current?.captions ?? null,
            },
            updatedAt: FieldValue.serverTimestamp(),
        });
        return version;
    });
    return Response.json({ version: newVersion });
});
