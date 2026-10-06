// The show library (spec 020 item E7, lib/server/library.ts). GET lists it for everyone in the Studio;
// POST { action } changes it, admins only: 'add' { path, kind, name, durationMs, licence } once the file is
// uploaded, 'update' { id, kind?, name?, licence? }, 'check' { id, checked } and 'remove' { id }.
import { addEntry, checkEntry, listLibrary, removeEntry, updateEntry } from '@/lib/server/library';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

export const GET = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json({ entries: await listLibrary() });
});

export const POST = handle(async request => {
    const { uid } = await requireRole(request, ['admin']);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = String(body.id ?? '');
    switch (body.action) {
        case 'add': return Response.json({ entry: await addEntry(body, uid) });
        case 'update': return Response.json({ entry: await updateEntry(id, body) });
        case 'check': return Response.json({ entry: await checkEntry(id, uid, body.checked === true) });
        case 'remove': await removeEntry(id); return Response.json({ ok: true });
        default: throw new HttpError(400, 'Unknown action');
    }
});
