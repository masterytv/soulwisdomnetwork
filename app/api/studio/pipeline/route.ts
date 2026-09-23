import { getPipeline } from '@/lib/server/pipeline';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

export const GET = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getPipeline());
});
