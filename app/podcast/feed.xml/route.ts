// The audio podcast feed (spec 019 item 5.1, lib/server/podcast.ts): public by design, since podcast apps read it
// without signing in, so it is not under /api and has no requireRole. It shows only what the Studio put in the
// feed, and nothing while the Studio settings have the feed off (404).
import { podcastFeed } from '@/lib/server/podcast';
import { requestOrigin } from '@/lib/server/origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const xml = await podcastFeed(requestOrigin(request));
    if (xml === null) return new Response('Not found', { status: 404 });
    return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
