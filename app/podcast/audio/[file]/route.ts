// A published episode's MP3 for podcast apps (spec 019 item 5.1): public like the feed (no requireRole), and only
// for an episode in the feed. The file stays in the private bucket; this sends the app on to a short-lived link.
import { podcastAudioLink } from '@/lib/server/podcast';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
    const id = (await params).file.replace(/\.mp3$/, '');
    const url = await podcastAudioLink(id);
    if (!url) return new Response('Not found', { status: 404 });
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}
