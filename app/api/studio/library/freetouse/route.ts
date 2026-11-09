// Free To Use music for the show library (lib/server/freeToUse.ts). GET ?q=&offset=&order= searches it, for
// everyone in the Studio; POST { id, kind } brings a track into the library, admins only.
import { importTrack, searchTracks } from '@/lib/server/freeToUse';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

export const GET = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    const p = new URL(request.url).searchParams;
    return Response.json(await searchTracks({ q: p.get('q'), offset: p.get('offset'), order: p.get('order') }));
});

export const POST = handle(async request => {
    const { uid } = await requireRole(request, ['admin']);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Response.json({ entry: await importTrack(body, uid) });
});
