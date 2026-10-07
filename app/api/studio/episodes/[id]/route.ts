import { deleteEpisode } from '@/lib/server/episodeReset';
import { getReview } from '@/lib/server/review';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// The transcript, detected voices, saved corrections and a video link for the review page.
export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getReview((await params).id));
});

// Deletes the episode: its record, its files in Storage and its transcript Doc (lib/server/episodeReset.ts).
// The original in Drive and anything on YouTube stay. Anyone in the Studio.
export const DELETE = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await deleteEpisode((await params).id));
});
