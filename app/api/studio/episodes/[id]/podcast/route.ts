// The audio podcast feed for one episode (spec 019 item 5.1, lib/server/podcast.ts): GET where it stands; POST makes
// the MP3 from the final cut; PATCH { published } puts it in the feed or takes it out.
import { getPodcast, requestPodcastAudio, setPublished } from '@/lib/server/podcast';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getPodcast((await params).id));
});

export const POST = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    await requestPodcastAudio((await params).id);
    return Response.json({ started: true });
});

export const PATCH = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as { published?: unknown };
    if (typeof body.published !== 'boolean') throw new HttpError(400, 'Say published: true or false');
    await setPublished((await params).id, body.published);
    return Response.json({ published: body.published });
});
