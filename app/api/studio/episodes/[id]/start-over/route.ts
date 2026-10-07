import { startOver } from '@/lib/server/episodeReset';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// Starts the episode over from its recording: everything done since is cleared and it is transcribed again
// (lib/server/episodeReset.ts). Anyone in the Studio.
export const POST = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await startOver((await params).id));
});
