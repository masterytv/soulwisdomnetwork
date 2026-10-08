// Why: the audio podcast feed (docs/specs/019-editor-light-v2.md item 5.1, decision D2: yes, on our own site). The
// pipeline published to YouTube only; this makes each finished episode an MP3 for podcast apps (Apple Podcasts,
// Spotify and the rest read an RSS feed) and serves that feed from the site. Shared by the job that makes the MP3
// (agent/src/podcast/podcastAudio.ts), the Studio's routes and the public feed route.

import type { Episode } from '../types/episode';
import type { StudioSettings } from './studioSettings';
import { youtubeMetadata } from './youtube';

// Podcast apps play at about −16 LUFS (spec 010 notes it); YouTube's −14 is louder than they like.
export const PODCAST_LOUDNESS = { integrated: -16, truePeak: -1.5, range: 11 };
// Apple's artwork: square, 1400 to 3000 pixels.
export const ART_SIZE = 1400;
export const PODCAST_BITRATE = '128k';

// Apple Podcasts' categories that fit the shows the Studio makes (the top-level names Apple lists).
export const PODCAST_CATEGORIES = [
    'Religion & Spirituality', 'Society & Culture', 'Health & Fitness', 'Education', 'Science', 'Arts', 'Business',
    'Technology', 'News', 'History', 'Kids & Family', 'Leisure',
] as const;
export type PodcastCategory = typeof PODCAST_CATEGORIES[number];

// Apple's subcategories under each of those (Apple Podcasts' category list); a show may name one, which helps it be found.
export const PODCAST_SUBCATEGORIES: Record<PodcastCategory, readonly string[]> = {
    'Religion & Spirituality': ['Buddhism', 'Christianity', 'Hinduism', 'Islam', 'Judaism', 'Religion', 'Spirituality'],
    'Society & Culture': ['Documentary', 'Personal Journals', 'Philosophy', 'Places & Travel', 'Relationships'],
    'Health & Fitness': ['Alternative Health', 'Fitness', 'Medicine', 'Mental Health', 'Nutrition', 'Sexuality'],
    'Education': ['Courses', 'How To', 'Language Learning', 'Self-Improvement'],
    'Science': ['Astronomy', 'Chemistry', 'Earth Sciences', 'Life Sciences', 'Mathematics', 'Natural Sciences', 'Nature', 'Physics', 'Social Sciences'],
    'Arts': ['Books', 'Design', 'Fashion & Beauty', 'Food', 'Performing Arts', 'Visual Arts'],
    'Business': ['Careers', 'Entrepreneurship', 'Investing', 'Management', 'Marketing', 'Non-Profit'],
    'Technology': [],
    'News': ['Business News', 'Daily News', 'Entertainment News', 'News Commentary', 'Politics', 'Sports News', 'Tech News'],
    'History': [],
    'Kids & Family': ['Education for Kids', 'Parenting', 'Pets & Animals', 'Stories for Kids'],
    'Leisure': ['Animation & Manga', 'Automotive', 'Aviation', 'Crafts', 'Games', 'Hobbies', 'Home & Garden', 'Video Games'],
};

// The subcategory the feed names: the one chosen when it belongs to the category, else none.
export const subcategoryOf = (category: PodcastCategory, sub: string) => (PODCAST_SUBCATEGORIES[category].includes(sub) ? sub : '');

// The chapters as ffmpeg's metadata file, which its MP3 writer turns into ID3 CHAP frames: each ends where the next
// starts, the last at the end of the episode.
export function chapterMetadata(title: string, chapters: { title: string; startMs: number }[], durationMs: number): string {
    const esc = (s: string) => s.replace(/[=;#\\\n]/g, m => (m === '\n' ? ' ' : `\\${m}`));
    const sorted = [...chapters].filter(c => c.startMs < durationMs).sort((a, b) => a.startMs - b.startMs);
    return [
        ';FFMETADATA1', `title=${esc(title)}`, '',
        ...sorted.flatMap((c, i) => ['[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.startMs)}`,
            `END=${Math.round(sorted[i + 1]?.startMs ?? durationMs)}`, `title=${esc(c.title)}`, '']),
    ].join('\n');
}

// An episode's title and show notes for podcast apps: the approved YouTube title and description (chapters,
// links and credits included), so both say the same.
export function podcastText(episode: Episode, settings: StudioSettings): { title: string; description: string } {
    const meta = youtubeMetadata(episode, settings);
    return { title: meta?.title ?? episode.title, description: meta?.description ?? '' };
}

const xml = (s: string) => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
// Text inside CDATA, which only "]]>" can break.
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

export interface FeedItem {
    id: string;
    title: string;
    description: string;
    audioUrl: string;
    bytes: number;
    durationSeconds: number;
    publishedAt: number;          // ms
}

export interface FeedShow {
    title: string;
    description: string;
    link: string;                 // the site
    feedUrl: string;
    artUrl: string;
    author: string;
    email: string;                // empty: no owner email in the feed
    category: string;
    subcategory: string;          // empty: none
    explicit: boolean;
}

// The show and its episodes from the Studio settings.
export function feedShow(s: StudioSettings, origin: string): FeedShow {
    return {
        title: s.showName,
        description: s.about ? `The ${s.showName} podcast ${s.about}${s.audience ? `, for ${s.audience}` : ''}.` : s.showName,
        link: s.siteUrl || origin,
        feedUrl: `${origin}/podcast/feed.xml`,
        artUrl: `${origin}/podcast/art.jpg`,
        author: s.hosts.join(' and ') || s.showName,
        email: s.podcastEmail,
        category: s.podcastCategory,
        subcategory: subcategoryOf(s.podcastCategory, s.podcastSubcategory),
        explicit: s.podcastExplicit,
    };
}

// The RSS 2.0 feed with Apple's podcast tags, newest episode first.
export function feedXml(show: FeedShow, items: FeedItem[]): string {
    const explicit = show.explicit ? 'true' : 'false';
    const episodes = [...items].sort((a, b) => b.publishedAt - a.publishedAt).map(i => [
        '    <item>',
        `      <title>${xml(i.title)}</title>`,
        `      <description>${cdata(i.description)}</description>`,
        `      <enclosure url="${xml(i.audioUrl)}" length="${Math.round(i.bytes)}" type="audio/mpeg"/>`,
        `      <guid isPermaLink="false">${xml(i.id)}</guid>`,
        `      <pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>`,
        `      <itunes:duration>${Math.round(i.durationSeconds)}</itunes:duration>`,
        `      <itunes:explicit>${explicit}</itunes:explicit>`,
        '      <itunes:episodeType>full</itunes:episodeType>',
        '    </item>',
    ].join('\n'));
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        `    <title>${xml(show.title)}</title>`,
        `    <link>${xml(show.link)}</link>`,
        `    <atom:link href="${xml(show.feedUrl)}" rel="self" type="application/rss+xml"/>`,
        `    <description>${cdata(show.description)}</description>`,
        '    <language>en</language>',
        `    <itunes:author>${xml(show.author)}</itunes:author>`,
        `    <itunes:image href="${xml(show.artUrl)}"/>`,
        show.subcategory
            ? `    <itunes:category text="${xml(show.category)}"><itunes:category text="${xml(show.subcategory)}"/></itunes:category>`
            : `    <itunes:category text="${xml(show.category)}"/>`,
        `    <itunes:explicit>${explicit}</itunes:explicit>`,
        '    <itunes:type>episodic</itunes:type>',
        ...(show.email ? [`    <itunes:owner><itunes:name>${xml(show.author)}</itunes:name><itunes:email>${xml(show.email)}</itunes:email></itunes:owner>`] : []),
        ...episodes,
        '  </channel>',
        '</rss>',
        '',
    ].join('\n');
}
