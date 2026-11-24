// "Soul Wisdom Video of the Week" (marketing plan step 4; Tom, 2026-11-19): Soul Wisdom's own weekly email, to the
// people who signed up on this site (Firestore newsletter_subscribers, sent from Resend's Soul Wisdom segment). It
// sends itself every Tuesday at 9:00 am Eastern: agent/src/newsletter/run.ts (mode weekly, .github/workflows/
// newsletter.yml) schedules it that morning and emails Tom the link to cancel it before then.
// What goes in it: the week's most-watched video on the Soul Wisdom YouTube channel (a Short, clip or episode), the
// newest podcast episode, and one line about Project Profound. Pure, so the tests need no network. No AI: titles and
// descriptions are the ones already published.

export const SWC_CHANNEL_ID = 'UC-W6WwHWh_hEOasLNryyAhQ';
export const channelFeedUrl = (channelId = SWC_CHANNEL_ID) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
export const PODCAST_FEED_URL = 'https://soulwisdomcollective.com/podcast/feed.xml';
export const SITE = 'https://soulwisdomcollective.com';
export const LOGO = `${SITE}/logo-trimmed.png`;
export const PODCAST_LINKS = {
    apple: 'https://podcasts.apple.com/us/podcast/soul-wisdom-collective/id6836432434',
    spotify: 'https://open.spotify.com/show/7lgFLbmk8pLg7b83b3OrbK',
};
export const NEWSLETTER_FROM = 'Soul Wisdom Collective <newsletter@soulwisdomcollective.com>';
export const NEWSLETTER_REPLY_TO = 'soulwisdomcollective@gmail.com';

export interface ChannelVideo { videoId: string; title: string; url: string; published: Date; views: number; description: string }
export interface PodcastEpisode { title: string; description: string; published: Date | null }

const decode = (s: string) => s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();

const tag = (xml: string, name: string) => {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
    return m ? decode(m[1]) : '';
};

// A channel's public YouTube feed (its 15 newest videos), with their view counts.
export function parseChannelFeed(xml: string): ChannelVideo[] {
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, e]) => {
        const videoId = tag(e, 'yt:videoId');
        const published = new Date(tag(e, 'published'));
        if (!videoId || Number.isNaN(published.getTime())) return [];
        return [{
            videoId,
            title: tag(e, 'title'),
            url: /<link rel="alternate" href="([^"]+)"/.exec(e)?.[1] ?? `https://www.youtube.com/watch?v=${videoId}`,
            published,
            views: Number(/<media:statistics views="(\d+)"/.exec(e)?.[1] ?? 0),
            description: tag(e, 'media:description'),
        }];
    });
}

// The most-viewed video published in the 7 days before `now`; null when none went out.
export function videoOfWeek(videos: ChannelVideo[], now: Date): ChannelVideo | null {
    const since = now.getTime() - 7 * 86_400_000;
    return videos
        .filter(v => v.published.getTime() > since && v.published.getTime() <= now.getTime())
        .sort((a, b) => b.views - a.views || b.published.getTime() - a.published.getTime())[0] ?? null;
}

// The newest episode in the podcast's RSS feed.
export function newestEpisode(xml: string): PodcastEpisode | null {
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, i]) => {
        const d = new Date(tag(i, 'pubDate'));
        return { title: tag(i, 'title'), description: tag(i, 'description'), published: Number.isNaN(d.getTime()) ? null : d };
    });
    return items.filter(i => i.title).sort((a, b) => (b.published?.getTime() ?? 0) - (a.published?.getTime() ?? 0))[0] ?? null;
}

// The first paragraph of a description, without the links and hashtags that follow it on YouTube.
export function firstParagraph(text: string, max = 400): string {
    const para = text.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !/^https?:\/\//.test(p) && !p.startsWith('#')) ?? '';
    return para.length <= max ? para : `${para.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

// UTM tags on links to our own sites, so their analytics see the visit came from this email.
export function tagged(url: string, campaign: string): string {
    const u = new URL(url);
    if (!/(^|\.)soulwisdomcollective\.com$/.test(u.hostname) && !/(^|\.)projectprofound\.org$/.test(u.hostname)) return url;
    u.searchParams.set('utm_source', 'newsletter');
    u.searchParams.set('utm_medium', 'email');
    u.searchParams.set('utm_campaign', campaign);
    return u.toString();
}

// "swc-video-of-the-week-2026-11-24": the broadcast's name (one per Tuesday, named for that Tuesday) and the UTM campaign.
export const weekName = (now: Date) => `swc-video-of-the-week-${now.toISOString().slice(0, 10)}`;

export interface WeeklyEmail { subject: string; previewText: string; video: ChannelVideo | null; episode: PodcastEpisode | null }

// The subject leads with the week's most-watched video, else the newest episode. When the video is the newest
// episode itself, the episode is not shown twice. Null when there is nothing to send.
export function weeklyEmail(parts: { video: ChannelVideo | null; episode: PodcastEpisode | null }): WeeklyEmail | null {
    const episode = parts.episode && parts.video && parts.episode.title === parts.video.title ? null : parts.episode;
    if (!parts.video && !episode) return null;
    const lead = parts.video?.title || episode!.title;
    return {
        video: parts.video,
        episode,
        subject: `Soul Wisdom Video of the Week: ${lead}`.slice(0, 120),
        previewText: episode ? `Plus our newest episode: ${episode.title}`.slice(0, 140) : 'This week’s most-watched conversation.',
    };
}

// Minutes east of UTC for New York at `at` (-240 in summer, -300 in winter).
function newYorkOffsetMinutes(at: Date): number {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
        .formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? 'GMT-5';
    const m = /GMT([+-]\d+)(?::(\d+))?/.exec(name);
    return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : -300;
}

// When the email goes out: 9:00 am Eastern on the New York day `now` falls in (the job runs that morning), right
// across the daylight-saving changes; past 9:00 (a late run), ten minutes from now, so Tom can still cancel.
export function sendTime(now: Date, hour = 9): Date {
    const ny = new Date(now.getTime() + newYorkOffsetMinutes(now) * 60_000);
    const wall = Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth(), ny.getUTCDate(), hour, 0, 0);
    let at = wall - newYorkOffsetMinutes(new Date(wall)) * 60_000;
    at = wall - newYorkOffsetMinutes(new Date(at)) * 60_000;
    return new Date(Math.max(at, now.getTime() + 10 * 60_000));
}

// The email is made ahead (Tom, 2026-11-24): GitHub started Tuesday's job hours late, so a run any time in the 36 hours
// before the send makes it, scheduled in Resend for 9:00 am ET, and Resend sends it on time. Google Cloud Scheduler
// starts the job on Monday evening; the workflow's own schedule (Monday and Tuesday) is the backup.
export const MAKE_AHEAD_HOURS = 36;
// Tuesday (0 is Sunday).
export const SEND_WEEKDAY = 2;

// The next send: its New York day (YYYY-MM-DD) and when it goes, or null while it is more than `aheadHours` away. On
// the send day itself, 9:00 am ET, or ten minutes from now past that (a run that came late still sends that day).
export function nextSend(now: Date, weekday = SEND_WEEKDAY, hour = 9, aheadHours = MAKE_AHEAD_HOURS): { day: string; at: Date } | null {
    const ny = new Date(now.getTime() + newYorkOffsetMinutes(now) * 60_000);
    const days = (weekday - ny.getUTCDay() + 7) % 7;
    const noon = new Date(Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth(), ny.getUTCDate() + days, 12));
    const at = days === 0 ? sendTime(now, hour) : sendTime(noon, hour);
    if (at.getTime() - now.getTime() > aheadHours * 3_600_000) return null;
    return { day: noon.toISOString().slice(0, 10), at };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The email's HTML, in the site's colours (deep purple, amber). Resend fills {{{RESEND_UNSUBSCRIBE_URL}}}.
export function weeklyHtml(email: WeeklyEmail, campaign: string): string {
    const { video, episode } = email;
    const p = (html: string) => `<p style="font-size:16px;line-height:1.65;color:#d6d0e6;margin:0 0 16px">${html}</p>`;
    const a = (href: string, text: string) => `<a href="${esc(href)}" style="color:#fbbf24;text-decoration:underline">${esc(text)}</a>`;
    const videoBlock = video ? `
      <h1 style="font-size:26px;font-weight:700;color:#ffffff;margin:0 0 16px;line-height:1.3">${esc(video.title)}</h1>
      <a href="${esc(video.url)}"><img src="https://i.ytimg.com/vi/${esc(video.videoId)}/hqdefault.jpg" alt="${esc(video.title)}" width="552" style="display:block;width:100%;max-width:552px;height:auto;border-radius:10px;margin:0 0 16px"></a>
      ${firstParagraph(video.description) ? p(esc(firstParagraph(video.description))) : ''}
      <a href="${esc(video.url)}" style="display:inline-block;background:#f59e0b;color:#140c24;font-size:14px;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">Watch it on YouTube</a>
      <div style="height:32px"></div>` : '';
    const episodeBlock = episode ? `
      <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#c4b5fd;margin:0 0 6px">Our newest episode</p>
      <h2 style="font-size:20px;font-weight:700;color:#ffffff;margin:0 0 12px;line-height:1.35">${esc(episode.title)}</h2>
      ${firstParagraph(episode.description) ? p(esc(firstParagraph(episode.description))) : ''}
      ${p(`Listen on ${a(PODCAST_LINKS.apple, 'Apple Podcasts')} or ${a(PODCAST_LINKS.spotify, 'Spotify')}, or watch every episode at ${a(tagged(`${SITE}/videos`, campaign), 'soulwisdomcollective.com')}.`)}
      <div style="height:16px"></div>` : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(email.subject)}</title></head>
<body style="margin:0;padding:0;background:#140c24;font-family:Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">${esc(email.previewText)}</div>
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;background:#140c24">
    <div style="text-align:center;margin-bottom:24px"><a href="${esc(tagged(SITE, campaign))}"><img src="${LOGO}" alt="Soul Wisdom Collective" width="140" height="100" style="display:inline-block"></a></div>
    <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;margin:0 0 8px;text-align:center">Soul Wisdom Video of the Week</p>
    ${videoBlock}${episodeBlock}
    <hr style="border:none;border-top:1px solid #3b2d5c;margin:8px 0 24px">
    ${p(`Curious about other people’s near-death experiences? Search thousands of first-hand accounts at ${a(tagged('https://projectprofound.org', campaign), 'Project Profound')}, our sister site.`)}
    <p style="font-size:12px;color:#9a8fb5;line-height:1.6">You’re receiving this because you signed up at soulwisdomcollective.com. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#9a8fb5">Unsubscribe</a></p>
  </div>
</body></html>`;
}

// The welcome email, sent once by the sync job after someone signs up.
export function welcomeHtml(): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#140c24;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;background:#140c24">
    <div style="text-align:center;margin-bottom:24px"><img src="${LOGO}" alt="Soul Wisdom Collective" width="140" height="100" style="display:inline-block"></div>
    <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin:0 0 16px">Welcome to Soul Wisdom Video of the Week</h1>
    <p style="font-size:16px;line-height:1.65;color:#d6d0e6;margin:0 0 16px">Thank you for signing up. Every Tuesday morning you’ll get one email: the week’s most-watched Soul Wisdom video and our newest podcast episode.</p>
    <p style="font-size:16px;line-height:1.65;color:#d6d0e6;margin:0 0 24px">Until then, every conversation is at <a href="${SITE}/videos?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=welcome" style="color:#fbbf24">soulwisdomcollective.com</a>.</p>
    <p style="font-size:12px;color:#9a8fb5;line-height:1.6">You signed up at soulwisdomcollective.com. Every weekly email has an unsubscribe link, or reply to this one and we’ll take you off.</p>
  </div>
</body></html>`;
}
