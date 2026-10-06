// The episode's media bin (spec 020 item E5, lib/server/mediaBin.ts). GET lists it with links; POST
// { path, name, durationMs, width, height } adds an upload once the browser has sent it; DELETE
// ?mediaId= takes an upload out (refused while the saved edit uses it).
import { addUpload, getBin, removeUpload } from '@/lib/server/mediaBin';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getBin((await params).id));
});

export const POST = handle<Context>(async (request, { params }) => {
    const { uid } = await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Response.json({ item: await addUpload((await params).id, body, uid) });
});

export const DELETE = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    await removeUpload((await params).id, new URL(request.url).searchParams.get('mediaId') ?? '');
    return Response.json({ ok: true });
});
