// The audio podcast feed (docs/specs/019-editor-light-v2.md item 5.1, lib/podcastFeed.ts). For the Studio: make an
// episode's MP3 from its final cut (GitHub Actions, podcast_audio.yml), put it in the feed or take it out, and say
// where it stands. For everyone: the feed itself, and links to each published episode's audio and the artwork,
// served by the site's public /podcast routes. The MP3s stay in the private bucket (storage.rules closed): a request
// for one is sent on to a short-lived signed link, which podcast apps follow.

import { FieldValue } from 'firebase-admin/firestore';
import type { Episode, EpisodePodcast } from '@/types/episode';
import { feedShow, feedXml, podcastText, type FeedItem } from '@/lib/podcastFeed';
import { adminBucket, adminDb } from './firebaseAdmin';
import { startPodcastAudio } from './github';
import { HttpError } from './staff';
import { getSettings } from './studioSettings';

const STALE_MS = 70 * 60_000;          // the workflow's own limit is 60 minutes
const WORKING: EpisodePodcast['status'][] = ['queued', 'making'];

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

function millis(t: unknown): number | null {
    return t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;
}

function busy(p: EpisodePodcast | undefined) {
    if (!p || !WORKING.includes(p.status)) return false;
    return Date.now() - Math.max(millis(p.requestedAt) ?? 0, millis(p.startedAt) ?? 0) < STALE_MS;
}

export interface PodcastView {
    status: EpisodePodcast['status'] | null;
    error: string | null;
    blocker: string | null;              // why it cannot be made yet
    published: boolean;
    outdated: boolean;                   // the final cut changed after this MP3 was made
    audioUrl: string | null;             // an hour-long link to listen
    durationSeconds: number | null;
    loudness: EpisodePodcast['loudness'] | null;
    feedOn: boolean;                     // the Studio settings' feed is on
}

const blocker = (e: Episode) => e.final?.status !== 'ready' || !e.final.videoPath ? 'Get the final cut first (from Descript or the Editor Light render)' : null;

export async function getPodcast(id: string): Promise<PodcastView> {
    const [snap, settings] = await Promise.all([episodeRef(id).get(), getSettings()]);
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    const p = episode.podcast;
    const lost = !!p && WORKING.includes(p.status) && !busy(p);
    const ready = p?.status === 'ready' && !!p.audioPath;
    return {
        status: lost ? 'failed' : p?.status ?? null,
        error: p?.error ?? (lost ? 'The MP3 was not made. Check the Podcast Audio run in GitHub Actions, then try again.' : null),
        blocker: blocker(episode),
        published: !!p?.published,
        outdated: ready && (p.finalAt ?? 0) !== (millis(episode.final?.finishedAt) ?? 0),
        audioUrl: ready ? await adminBucket().file(p.audioPath!).getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60_000 }).then(([u]) => u).catch(() => null) : null,
        durationSeconds: ready ? p.durationSeconds ?? null : null,
        loudness: ready ? p.loudness ?? null : null,
        feedOn: settings.podcastFeed,
    };
}

// Makes the MP3 from the final cut as it is now; again replaces it (and keeps it in the feed if it was).
export async function requestPodcastAudio(id: string) {
    const ref = episodeRef(id);
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        const problem = blocker(episode);
        if (problem) throw new HttpError(409, problem);
        if (busy(episode.podcast)) throw new HttpError(409, 'The MP3 is already being made');
        tx.update(ref, { 'podcast.status': 'queued', 'podcast.requestedAt': FieldValue.serverTimestamp(), 'podcast.error': null, updatedAt: FieldValue.serverTimestamp() });
    });
    try {
        await startPodcastAudio(id);
    } catch (error) {
        const message = `Could not start: ${(error as Error).message}`;
        await ref.update({ 'podcast.status': 'failed', 'podcast.error': message });
        throw new HttpError(502, message);
    }
}

// Puts the episode in the feed, or takes it out. Its date in the feed is when it first went in.
export async function setPublished(id: string, published: boolean) {
    const ref = episodeRef(id);
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        const p = episode.podcast;
        if (published && (p?.status !== 'ready' || !p.audioPath)) throw new HttpError(409, 'Make the MP3 first');
        tx.update(ref, {
            'podcast.published': published,
            ...(published && !p?.publishedAt ? { 'podcast.publishedAt': Date.now() } : {}),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

// ─── Public (the site's /podcast routes) ─────────────────────────────────────

// The episodes in the feed: published, with an MP3.
async function published(): Promise<{ id: string; episode: Episode }[]> {
    const snap = await adminDb().collection('episodes').where('podcast.published', '==', true).get();
    return snap.docs.map(d => ({ id: d.id, episode: d.data() as Episode })).filter(x => x.episode.podcast?.status === 'ready' && !!x.episode.podcast.audioPath);
}

// The feed, or null when the Studio settings have it off. `origin`: the site's address as the request reached it.
export async function podcastFeed(origin: string): Promise<string | null> {
    const settings = await getSettings();
    if (!settings.podcastFeed) return null;
    const items: FeedItem[] = (await published()).map(({ id, episode }) => {
        const text = podcastText(episode, settings);
        const p = episode.podcast!;
        return {
            id, title: text.title, description: text.description, audioUrl: `${origin}/podcast/audio/${id}.mp3`,
            bytes: p.bytes ?? 0, durationSeconds: p.durationSeconds ?? 0, publishedAt: p.publishedAt ?? 0,
        };
    });
    return feedXml(feedShow(settings, origin), items);
}

// A short-lived link to a published episode's MP3, or null.
export async function podcastAudioLink(id: string): Promise<string | null> {
    if (!/^[\w-]{10,}$/.test(id) || !(await getSettings()).podcastFeed) return null;
    const p = ((await episodeRef(id).get()).data() as Episode | undefined)?.podcast;
    if (!p?.published || p.status !== 'ready' || !p.audioPath) return null;
    const [url] = await adminBucket().file(p.audioPath).getSignedUrl({ action: 'read', expires: Date.now() + 6 * 3600_000 });
    return url;
}

// A short-lived link to the feed's artwork (the Studio settings'), or null for the site's logo.
export async function podcastArtLink(): Promise<string | null> {
    const s = await getSettings();
    const path = s.podcastArtPath ?? s.logoPath;
    if (!s.podcastFeed || !path) return null;
    const [url] = await adminBucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + 6 * 3600_000 });
    return url;
}
