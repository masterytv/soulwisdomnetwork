// What Shorts and clips share when they go to YouTube (docs/specs/025-clips.md, stage 4): where their description
// sends viewers for the full conversation, the publish slots of a batch, and the first slot the page suggests.

export const DAY_MS = 24 * 60 * 60_000;

// The episode once it is on YouTube; before that, the podcast playlist, then the website. No URL: no link line.
export function episodeLink(o: { episodeUrl?: string | null; playlistId?: string | null; siteUrl?: string | null }) {
    if (o.episodeUrl) return { url: o.episodeUrl, linkText: 'Watch the full conversation' };
    const playlist = o.playlistId?.trim();
    if (playlist) return { url: `https://www.youtube.com/playlist?list=${playlist}`, linkText: 'Full episodes' };
    return { url: o.siteUrl ?? '', linkText: 'Full episodes' };
}

// Which Short or clip a visit to the website came from (marketing plan step 2, 2026-11-18): utm tags on links to the
// site only. YouTube drops them from its own links and reports where its viewers came from itself.
export function withUtm(url: string, medium: 'shorts' | 'clips', id: string) {
    let u: URL;
    try {
        u = new URL(url);
    } catch {
        return url;
    }
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)) return url;
    u.searchParams.set('utm_source', 'youtube');
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', id);
    return u.toString();
}

// The n-th item of a batch goes out `everyDays` days after the one before.
export const slotAt = (firstAt: number, n: number, everyDays = 1) => firstAt + n * everyDays * DAY_MS;

// The first slot the page suggests, in the browser's time zone: `everyDays` after the last one already taken (at the
// same time of day) when that is still ahead; otherwise tomorrow, at the last one's time of day, or at `hour`.
export function suggestedFirstSlot(lastSlot: number | null, everyDays: number, hour: number, now = Date.now()) {
    if (lastSlot && lastSlot + everyDays * DAY_MS > now + DAY_MS / 2) return lastSlot + everyDays * DAY_MS;
    const d = new Date(now + DAY_MS);
    if (lastSlot) {
        const t = new Date(lastSlot);
        d.setHours(t.getHours(), t.getMinutes(), 0, 0);
    } else {
        d.setHours(hour, 0, 0, 0);
    }
    return d.getTime();
}
