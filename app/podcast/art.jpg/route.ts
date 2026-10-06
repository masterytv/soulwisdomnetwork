// The podcast feed's artwork (spec 019 item 5.1): public like the feed. The Studio settings' artwork (or logo) is
// in the private bucket, so this sends apps on to a short-lived link; with none set, the site's own logo.
import { podcastArtLink } from '@/lib/server/podcast';
import { requestOrigin } from '@/lib/server/origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const url = await podcastArtLink() ?? `${requestOrigin(request)}/logo.png`;
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'public, max-age=300' } });
}
