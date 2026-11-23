// "YouTube post" on a carousel (docs/specs/026-social-publishing.md): GET gives the ready-to-paste text and how many
// slides there are; GET ?slide=N gives that slide as a JPEG to download.
import { youtubePost, youtubeSlide } from '@/lib/server/social';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const id = (await params).id;
    const slide = new URL(request.url).searchParams.get('slide');
    if (slide === null) return Response.json(await youtubePost(id));
    const n = Number(slide);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw new HttpError(400, 'Not a slide');
    const bytes = await youtubeSlide(id, n);
    return new Response(new Uint8Array(bytes), {
        headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="slide-${n}.jpg"`, 'Cache-Control': 'private, no-store' },
    });
});
