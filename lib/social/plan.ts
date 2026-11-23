// Social publishing's rules (docs/specs/026-social-publishing.md; D-2026-11-23-swc-autopost in DECISIONS.md). Pure, so
// the job (agent/src/social/run.ts), the Studio's server code and the tests share them. Copied in spirit from Project
// Profound's Short Maker (masterytv/short-maker, src/lib/social/plan.ts), not imported.
//
// Every Short approved at Checkpoint E and scheduled on YouTube becomes a Reel 3 hours after YouTube publishes it, an
// image post and a story carousel, each queued at one a day at 7 pm ET (Tom, 2026-11-23). Each is handed to
// Upload-Post with its own time as soon as it is planned, because GitHub's scheduled runs start hours late.

import { renderInputs, sameRender, DEFAULT_ASPECT, type ShortAspect } from '../shorts';
import type { ShortItem } from '../../types/episode';

export const PLATFORMS = ['instagram', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_NAMES: Record<Platform, string> = { instagram: 'Instagram', facebook: 'Facebook' };

export const POST_KINDS = ['reel', 'image', 'carousel'] as const;
export type PostKind = (typeof POST_KINDS)[number];
export const KIND_LABELS: Record<PostKind, string> = { reel: 'Reel', image: 'Image post', carousel: 'Story carousel' };

export type PostStatus = 'waiting' | 'sent' | 'posted' | 'partial' | 'failed' | 'held' | 'cancelled' | 'missed';
export const STATUS_LABELS: Record<PostStatus, string> = {
    waiting: 'Waiting for Post',
    sent: 'Set to post',
    posted: 'Posted',
    partial: 'Partly posted',
    failed: 'Failed',
    held: 'Held',
    cancelled: 'Cancelled',
    missed: 'Missed',
};

// Tom, 2026-11-23: each Reel 3 hours after its Short goes public on YouTube.
export const REEL_DELAY_HOURS = 3;
// Tom, 2026-11-23: feed posts at 7 pm ET, one a day of each kind; the second of a day 30 minutes later.
export const FEED_TIME = '19:00';
export const FEED_SECOND_OFFSET_MINUTES = 30;
// Which kind of feed post goes first on a day both fall on.
export const FEED_ORDER: PostKind[] = ['carousel', 'image'];
// A post whose time passed by more than this is never sent late (a missed run never posts stale content).
export const LATE_LIMIT_HOURS = 6;
// Handed over with a time only when it is this far ahead; nearer, it goes now.
export const SCHEDULE_MIN_LEAD_MS = 3 * 60_000;
// Upload-Post refuses changes in the last minute before a post goes.
export const CHANGE_CUTOFF_MS = 90_000;

// Shorts released on YouTube before this are never posted, so switching it on never floods the accounts with old
// Shorts. The repo variable SOCIAL_START (an ISO time) can move it.
export const SOCIAL_START = '2026-11-24T05:00:00Z';
export function socialStart(setting: string | undefined): number {
    const t = Date.parse(setting ?? '');
    return Number.isNaN(t) ? Date.parse(SOCIAL_START) : t;
}

// Posting by itself is on unless SOCIAL_AUTOPOST says off/no/false/0.
export const autopostOn = (setting: string | undefined) => !['off', 'no', 'false', '0'].includes((setting ?? '').trim().toLowerCase());

// One document per post: a second plan of the same Short never makes a second post.
export const postId = (episodeId: string, shortId: string, kind: PostKind) => `${episodeId}_${shortId}_${kind}`;

// ─── Eastern Time ───────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60_000;

// The New York offset from UTC at an instant, in minutes (−300 in EST, −240 in EDT).
function offsetAt(t: number): number {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
        .formatToParts(new Date(t)).find(p => p.type === 'timeZoneName')?.value ?? 'GMT-5';
    const o = /GMT([+-]\d+)(?::(\d+))?/.exec(name);
    return o ? Number(o[1]) * 60 + Math.sign(Number(o[1])) * Number(o[2] ?? 0) : -300;
}

// The instant of a wall-clock time in New York: day YYYY-MM-DD, time HH:MM.
export function easternToUtc(day: string, time: string): number {
    const [y, mo, d] = day.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    const asUtc = Date.UTC(y, mo - 1, d, h, mi);
    // Checked twice, for times near a change.
    let t = asUtc - offsetAt(asUtc) * 60_000;
    t = asUtc - offsetAt(t) * 60_000;
    return t;
}

// The Eastern calendar day of an instant, as YYYY-MM-DD.
export function easternDay(t: number): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

// The day after a YYYY-MM-DD day.
export function nextDay(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) + DAY_MS).toISOString().slice(0, 10);
}

// A time for people: "Tue, Nov 24, 7:00 PM ET".
export function etLabel(t: number): string {
    return `${new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET`;
}

// ─── When each post goes ────────────────────────────────────────────────────────

export const reelPostAt = (youtubePublishAt: number) => youtubePublishAt + REEL_DELAY_HOURS * 3_600_000;

// A feed post's time on a day: 7 pm ET, or 7:30 pm for the second kind of the day.
export function feedSlot(kind: PostKind, day: string): number {
    const at = easternToUtc(day, FEED_TIME);
    return kind === FEED_ORDER[0] ? at : at + FEED_SECOND_OFFSET_MINUTES * 60_000;
}

// A Short's posts, made in this order: the Reel first (the feed posts wait for it), then the feed posts.
export const PLANNED_KINDS: PostKind[] = ['reel', 'image'];

// The next day for a feed post of one kind: the day after the last day that kind already took, never before its Short's
// Reel has gone (its own Short must be out first), and never in the past. One a day per kind (Tom, 2026-11-23).
export function feedPostAt(kind: PostKind, o: { lastTaken: number | null; reelAt: number; now: number }): number {
    let day = easternDay(Math.max(o.reelAt, o.now));
    if (o.lastTaken !== null) {
        const after = nextDay(easternDay(o.lastTaken));
        if (after > day) day = after;
    }
    while (feedSlot(kind, day) < Math.max(o.reelAt, o.now)) day = nextDay(day);
    return feedSlot(kind, day);
}

// Hand a post over with a time when it is far enough ahead; nearer than that, now.
export const scheduleFor = (postAt: number, now: number): number | null => (postAt - now >= SCHEDULE_MIN_LEAD_MS ? postAt : null);

// Too late to post at all.
export const tooLate = (postAt: number, now: number) => now - postAt > LATE_LIMIT_HOURS * 3_600_000;

// ─── Which Shorts ───────────────────────────────────────────────────────────────

// Why a Short gets no posts (null: it qualifies). Tom, 2026-11-23: every Short approved at Checkpoint E. Its approval
// must be of the render it has now, and it must be scheduled on YouTube no earlier than SOCIAL_START.
export function whyNot(item: ShortItem, o: { aspect?: ShortAspect; finalAt: number; start: number }): string | null {
    if (!item.render || !item.approved) return 'Not approved at Checkpoint E';
    if (item.approved.renderedAt !== item.render.renderedAt || !sameRender(item.render, renderInputs(item, o.aspect ?? DEFAULT_ASPECT, o.finalAt)))
        return 'Changed since it was approved';
    if (!item.youtube?.videoId) return 'Not on YouTube yet';
    if (item.youtube.publishAt < o.start) return 'Released on YouTube before social posting began';
    return null;
}

// ─── YouTube's word on a Short ──────────────────────────────────────────────────

export interface YoutubeState { privacyStatus: string; publishAt: number | null }

// What to do with a Short's posts, from what YouTube says now. Public: keep. Private with a publish time: still
// scheduled, so keep, or move the Reel if the time changed. Anything else (unscheduled, set private, deleted): cancel.
export function youtubeVerdict(state: YoutubeState | undefined, plannedPublishAt: number): { verdict: 'keep' } | { verdict: 'move'; publishAt: number } | { verdict: 'cancel'; reason: string } {
    if (!state) return { verdict: 'cancel', reason: 'Deleted from YouTube' };
    if (state.privacyStatus === 'public') return { verdict: 'keep' };
    if (state.privacyStatus === 'private' && state.publishAt) {
        return Math.abs(state.publishAt - plannedPublishAt) < 60_000 ? { verdict: 'keep' } : { verdict: 'move', publishAt: state.publishAt };
    }
    return { verdict: 'cancel', reason: state.privacyStatus === 'unlisted' ? 'Set to unlisted on YouTube' : 'Unscheduled on YouTube' };
}

// Statuses a post can still change from, and the ones done with.
export const LIVE_STATUSES: PostStatus[] = ['waiting', 'sent', 'held', 'failed'];

// ─── Results ────────────────────────────────────────────────────────────────────

export interface PlatformResult { ok: boolean; url: string | null; postId: string | null; error: string | null }

export function statusFromResults(platforms: readonly string[], results: Record<string, PlatformResult>): 'posted' | 'partial' | 'failed' {
    const ok = platforms.filter(p => results[p]?.ok).length;
    if (ok === platforms.length && ok > 0) return 'posted';
    return ok > 0 ? 'partial' : 'failed';
}

// Facebook's Reels API takes 3 to 90 seconds; a longer Short goes up as a Page video, which Facebook shows as a Reel.
export const FACEBOOK_REEL_MAX_SECONDS = 90;
export const facebookMediaType = (seconds: number): 'REELS' | 'VIDEO' => (seconds >= 3 && seconds <= FACEBOOK_REEL_MAX_SECONDS ? 'REELS' : 'VIDEO');

// ─── What a post holds ──────────────────────────────────────────────────────────

export interface ReelContent {
    title: string;
    videoPath: string;              // the Short's render in Storage
    coverPath: string | null;       // a still of it, as the Reel's cover
    seconds: number;
    synthetic: boolean;             // AI b-roll: the platforms' "made with AI" labels
    instagramCaption: string;
    facebookTitle: string;
    facebookDescription: string;
}

export interface ImageContent {
    title: string;
    cardPath: string;               // the quote card, JPEG 1080 × 1350, in Storage
    picture: 'speaker' | 'host' | 'broll' | 'none';   // what it was drawn on (lib/social/picture.ts: a host one post in five)
    picturePath: string | null;     // the frame or b-roll picture it was drawn on
    aiPicture: boolean;             // an AI b-roll image: the platforms' "made with AI" label
    quote: string;                  // the speaker's own words, copied from the Short
    gold: string;                   // the phrase in gold, copied exactly from the quote
    instagramCaption: string;
    facebookCaption: string;
}

export type PostContent = ReelContent | ImageContent;

export interface UploadPostRef { jobId: string | null; requestId: string; scheduled: boolean; sentAt: number; sends: number }

export interface SocialPost {
    kind: PostKind;
    episodeId: string;
    shortId: string;
    shortTitle: string;
    speaker: string;
    youtube: { videoId: string; url: string; publishAt: number };
    postAt: number;
    platforms: Platform[];
    status: PostStatus;
    reason: string | null;
    content: PostContent | null;    // by kind: ReelContent, ImageContent (stage 4 adds the carousel's); null when not made
    notMade?: boolean;              // could not be made (kept as cancelled so it is never tried, or paid for, again)
    uploadPost: UploadPostRef | null;
    results: Record<string, PlatformResult>;
    createdAt: number;
    updatedAt: number;
}

// The words a producer can change on a post: what each platform shows.
export type EditableField = 'instagramCaption' | 'facebookTitle' | 'facebookDescription' | 'facebookCaption';
export function editableFields(kind: PostKind): { key: EditableField; label: string }[] {
    if (kind === 'reel') {
        return [
            { key: 'instagramCaption', label: 'Instagram caption' },
            { key: 'facebookTitle', label: 'Facebook title' },
            { key: 'facebookDescription', label: 'Facebook description' },
        ];
    }
    return [
        { key: 'instagramCaption', label: 'Instagram caption' },
        { key: 'facebookCaption', label: 'Facebook text' },
    ];
}

export type SocialAction = 'post' | 'hold' | 'cancel';

// Which buttons a post shows on the Social page.
export function actionsFor(post: Pick<SocialPost, 'status' | 'postAt' | 'uploadPost'>, now: number): SocialAction[] {
    const changeable = post.postAt - now > CHANGE_CUTOFF_MS;
    switch (post.status) {
        case 'waiting':
            return ['post', 'hold', 'cancel'];
        case 'sent':
            return post.uploadPost?.scheduled && changeable ? ['hold', 'cancel'] : [];
        case 'held':
            return ['post', 'cancel'];
        case 'failed':
        case 'partial':
            return tooLate(post.postAt, now) ? ['cancel'] : ['post', 'cancel'];
        default:
            return [];
    }
}

// Whether a post's words can still change: before it goes (a post handed over is changed at Upload-Post too).
export const canEdit = (post: Pick<SocialPost, 'status' | 'postAt' | 'uploadPost'>, now: number) =>
    ['waiting', 'held', 'failed'].includes(post.status) || (post.status === 'sent' && !!post.uploadPost?.scheduled && post.postAt - now > CHANGE_CUTOFF_MS);
