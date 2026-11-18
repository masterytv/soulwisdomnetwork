// Links to the Soul Wisdom Collective elsewhere.
export const YOUTUBE_CHANNEL_HANDLE = "SoulWisdomCollective";
export const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/@${YOUTUBE_CHANNEL_HANDLE}`;

// The audio podcast in the apps, both reading the site's own feed (/podcast/feed.xml). Listed 18 Nov 2026.
export const APPLE_PODCASTS_URL = "https://podcasts.apple.com/us/podcast/soul-wisdom-collective/id6836432434";
export const SPOTIFY_URL = "https://open.spotify.com/show/7lgFLbmk8pLg7b83b3OrbK";
export const LISTEN_LINKS = [
    { label: "Apple Podcasts", href: APPLE_PODCASTS_URL },
    { label: "Spotify", href: SPOTIFY_URL },
] as const;
