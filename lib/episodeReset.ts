// Why: an episode can be deleted, or started over from its recording (the Studio's "Delete episode" and
// "Start over"). Both are refused while a job is working on the episode, so nothing writes back to a
// record that is gone or reset. This file decides that, and what a started-over episode keeps, without
// touching Firestore or Storage (lib/server/episodeReset.ts does that).

import type { Episode } from '../types/episode';

// Each job's record on the episode and the states it is working in.
const JOBS: { key: keyof Episode; label: string; working: string[] }[] = [
    { key: 'notes', label: 'Show notes', working: ['queued', 'generating'] },
    { key: 'broll', label: 'B-roll images', working: ['queued', 'generating'] },
    { key: 'package', label: 'Edit package', working: ['queued', 'building'] },
    { key: 'descript', label: 'Descript', working: ['queued', 'importing', 'cleaning'] },
    { key: 'final', label: 'Final cut', working: ['queued', 'publishing', 'mastering', 'retiming'] },
    { key: 'editRender', label: 'Render', working: ['queued', 'downloading', 'rendering', 'saving'] },
    { key: 'podcast', label: 'Podcast audio', working: ['queued', 'making'] },
    { key: 'thumbnails', label: 'Thumbnails', working: ['queued', 'working'] },
    { key: 'youtube', label: 'YouTube upload', working: ['queued', 'uploading', 'processing'] },
    { key: 'shorts', label: 'Shorts', working: ['queued', 'working'] },
    { key: 'extras', label: 'Social posts', working: ['queued', 'working'] },
    { key: 'translations', label: 'Translations', working: ['queued', 'working'] },
    { key: 'retakes', label: 'Retakes', working: ['queued', 'working'] },
];

// A job that says it is working but has not moved for this long has died (the longest job's time limit
// in GitHub Actions is under six hours), so it no longer holds the episode.
export const STALE_MS = 6 * 3600_000;

// A Firestore Timestamp, Date or number as milliseconds; 0 when there is none.
export function toMs(v: unknown): number {
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    if (v && typeof v === 'object') {
        const t = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
        if (typeof t.toMillis === 'function') return t.toMillis();
        const s = t._seconds ?? t.seconds;
        if (typeof s === 'number') return s * 1000;
    }
    return 0;
}

// The jobs working on the episode now, by name ("Processing" for ingest itself).
export function runningJobs(e: Episode, now = Date.now()): string[] {
    const fresh = (...times: unknown[]) => now - Math.max(...times.map(toMs)) < STALE_MS;
    const out: string[] = [];
    if ((e.status === 'ingesting' || e.status === 'transcribing') && fresh(e.updatedAt)) out.push('Processing');
    for (const job of JOBS) {
        const j = e[job.key] as { status?: string; requestedAt?: unknown; startedAt?: unknown } | undefined | null;
        if (j?.status && job.working.includes(j.status) && fresh(j.requestedAt, j.startedAt, e.updatedAt)) out.push(job.label);
    }
    return out;
}

// What a started-over episode is: the same recording (and its speaker tracks) with everything since
// cleared, waiting for ingest to make its preview and transcript again. It is marked as already in Storage
// ('upload'), so ingest reads the copy there and the Drive original is left where it is.
export function startedOver(e: Episode, hosts: string[]): Omit<Episode, 'updatedAt'> {
    return {
        title: e.title,
        recordedAt: e.recordedAt,
        status: 'ingesting',
        stage: 'copy',
        source: 'upload',
        drive: e.drive,
        media: { sourcePath: e.media!.sourcePath, ...(e.media?.speakerTracks?.length ? { speakerTracks: e.media.speakerTracks } : {}) },
        candidateSpeakers: hosts.length ? hosts : e.candidateSpeakers,
        costs: { items: [], totalUsd: 0 },
        error: null,
        createdAt: e.createdAt,
    };
}

// The Storage files a start-over keeps: the recording and its speaker tracks.
export const keptOnStartOver = (id: string, path: string) => path.startsWith(`episodes/${id}/source/`);

// The Google Doc's ID in a Docs link, or null.
export function docIdOf(url: string | undefined): string | null {
    return url?.match(/\/document\/d\/([\w-]+)/)?.[1] ?? null;
}
