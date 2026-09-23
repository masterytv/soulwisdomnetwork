import { saveBacklogOrder } from '@/lib/server/pipeline';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

export const POST = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    const { order } = await request.json() as { order?: unknown };
    if (!Array.isArray(order) || !order.every(id => typeof id === 'string') || order.length > 500) {
        throw new HttpError(400, 'Expected a list of file IDs');
    }
    await saveBacklogOrder(order);
    return Response.json({ ok: true });
});
