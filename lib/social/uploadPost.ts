// Upload-Post (upload-post.com), the service that posts to Instagram and Facebook for us (docs/specs/026-social-publishing.md).
// The only file that knows its API, so another service would replace this file alone. Copied from Project Profound's
// Short Maker (masterytv/short-maker, src/lib/social/uploadPost.ts), not imported.
//
// Docs: https://docs.upload-post.com/api/upload-video, /api/upload-photos, /api/upload-status, /api/schedule-posts. Every
// upload is multipart form data with `Authorization: Apikey <key>`. Each post sends its own ID as both the request ID
// and the Idempotency-Key, so a retry after a timeout never posts twice. A post with `scheduled_date` comes back with a
// `job_id`; Upload-Post stores its media with the job, so the links we send only need to last until it has them.
//
// Settings: UPLOAD_POST_API_KEY (repo secret, and Secret Manager for the Studio), UPLOAD_POST_PROFILE and
// FACEBOOK_PAGE_ID (repo variables, and plain values in apphosting.yaml).

import { facebookMediaType, type PlatformResult } from './plan';

const BASE = 'https://api.upload-post.com';
const TIMEOUT_MS = 120_000;

export class UploadPostError extends Error {
    constructor(message: string, readonly status?: number, readonly code?: string) {
        super(message);
    }
}

export interface UploadPostConfig { apiKey: string; profile: string; facebookPageId: string }

export const POSTING_SETTINGS = ['UPLOAD_POST_API_KEY', 'UPLOAD_POST_PROFILE', 'FACEBOOK_PAGE_ID'] as const;
// Cancelling or changing a post set for later needs the key alone (the Studio has no Page ID).
export const CHANGING_SETTINGS = ['UPLOAD_POST_API_KEY'] as const;

// What is missing before anything can post (or, given CHANGING_SETTINGS, be changed), by setting name; empty when ready.
export function missingSettings(env: Record<string, string | undefined> = process.env, need: readonly string[] = POSTING_SETTINGS): string[] {
    return need.filter(k => !env[k]?.trim());
}

export function configFrom(env: Record<string, string | undefined> = process.env, need: readonly string[] = POSTING_SETTINGS): UploadPostConfig {
    const missing = missingSettings(env, need);
    if (missing.length) throw new UploadPostError(`Posting is not set up yet: ${missing.join(', ')} missing`);
    return { apiKey: env.UPLOAD_POST_API_KEY!.trim(), profile: env.UPLOAD_POST_PROFILE?.trim() ?? '', facebookPageId: env.FACEBOOK_PAGE_ID?.trim() ?? '' };
}

// Upload-Post's own words for a refusal: `message` on 4xx, `error` on 5xx.
export function reason(status: number, body: Record<string, unknown>): string {
    const said = [body.message, body.error].find(v => typeof v === 'string' && v) as string | undefined;
    if (status === 401) return 'Upload-Post refused the API key (401): check UPLOAD_POST_API_KEY';
    if (status === 429) return `Upload-Post's limit is reached (429)${said ? `: ${said}` : ''}`;
    return `Upload-Post refused it (${status})${said ? `: ${said}` : ''}`;
}

async function call(config: UploadPostConfig, path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { Authorization: `Apikey ${config.apiKey}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.success === false) {
        throw new UploadPostError(reason(res.status, body), res.status, typeof body.error_code === 'string' ? body.error_code : undefined);
    }
    return body;
}

export interface SendResult {
    jobId: string | null;           // a post set for later
    requestId: string;              // the request ID we sent, to look the post up by
    scheduled: boolean;
}

// The time, or an answer at once, and the post's own request ID.
function timing(f: FormData, requestId: string, at: number | null) {
    f.set('request_id', requestId);
    f.set('external_id', requestId);
    if (at) {
        f.set('scheduled_date', new Date(at).toISOString());
        f.set('timezone', 'UTC');
    } else {
        f.set('async_upload', 'true');
    }
}

export interface ReelSend {
    requestId: string;
    platforms: readonly string[];
    videoUrl: string;
    coverUrl: string | null;
    seconds: number;
    synthetic: boolean;
    title: string;
    instagramCaption: string;
    facebookTitle: string;
    facebookDescription: string;
    at: number | null;
}

// The form for a Reel to Instagram and Facebook. Pure, for the tests.
export function reelForm(o: ReelSend & { profile: string; facebookPageId: string; facebookCover?: Blob | null }): FormData {
    const f = new FormData();
    f.set('user', o.profile);
    for (const p of o.platforms) f.append('platform[]', p);
    f.set('video', o.videoUrl);
    f.set('title', o.title);
    f.set('instagram_title', o.instagramCaption);
    f.set('media_type', 'REELS');
    f.set('share_to_feed', 'true');
    f.set('facebook_page_id', o.facebookPageId);
    f.set('facebook_media_type', facebookMediaType(o.seconds));
    f.set('facebook_title', o.facebookTitle);
    f.set('facebook_description', o.facebookDescription);
    // A cover, or Instagram and Facebook show the first frame (Short Maker's first test, 2026-11-23). Facebook takes a
    // Reel's cover only as an upload, a Page video's as a link.
    if (o.coverUrl) {
        f.set('cover_url', o.coverUrl);
        if (facebookMediaType(o.seconds) === 'VIDEO') f.set('thumbnail_url', o.coverUrl);
        else if (o.facebookCover) f.set('facebook_thumbnail', o.facebookCover, 'cover.jpg');
    }
    // The platforms' own "made with AI" labels, whenever the Short shows AI b-roll (as its YouTube upload says).
    if (o.synthetic) {
        f.set('is_ai_generated', 'true');
        f.set('facebook_is_ai_generated', 'true');
    }
    timing(f, o.requestId, o.at);
    return f;
}

export interface PhotoSend {
    requestId: string;
    platforms: readonly string[];
    imageUrls: string[];            // one picture, or several as a carousel
    title: string;
    instagramCaption: string;
    facebookCaption: string;
    aiPicture?: boolean;            // an AI picture on the card: the platforms' "made with AI" label
    at: number | null;
}

// The form for a picture post: one picture, or several as an Instagram carousel and a Facebook multi-photo post.
// Instagram's caption is instagram_title, Facebook's text facebook_title. Pure, for the tests.
export function photoForm(o: PhotoSend & { profile: string; facebookPageId: string }): FormData {
    const f = new FormData();
    f.set('user', o.profile);
    for (const p of o.platforms) f.append('platform[]', p);
    for (const url of o.imageUrls) f.append('photos[]', url);
    f.set('title', o.title);
    f.set('instagram_title', o.instagramCaption);
    f.set('facebook_title', o.facebookCaption);
    f.set('facebook_page_id', o.facebookPageId);
    if (o.aiPicture) {
        f.set('is_ai_generated', 'true');
        f.set('facebook_is_ai_generated', 'true');
    }
    timing(f, o.requestId, o.at);
    return f;
}

async function send(config: UploadPostConfig, path: string, requestId: string, form: FormData, at: number | null): Promise<SendResult> {
    const out = await call(config, path, { method: 'POST', body: form, headers: { 'Idempotency-Key': requestId } });
    const jobId = typeof out.job_id === 'string' && out.job_id ? out.job_id : null;
    // Set for later only when we asked for a time and got a job back: a post going now is looked up by its request ID.
    return { jobId, requestId: (typeof out.request_id === 'string' && out.request_id) || requestId, scheduled: !!at && !!jobId };
}

// The cover as a file, or null when it can't be read (the Reel then goes without one on Facebook).
async function coverFile(url: string | null): Promise<Blob | null> {
    if (!url) return null;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        return res.ok ? await res.blob() : null;
    } catch {
        return null;
    }
}

export async function sendReel(config: UploadPostConfig, o: ReelSend): Promise<SendResult> {
    const facebookCover = o.platforms.includes('facebook') && facebookMediaType(o.seconds) === 'REELS' ? await coverFile(o.coverUrl) : null;
    return send(config, '/api/upload', o.requestId, reelForm({ ...o, profile: config.profile, facebookPageId: config.facebookPageId, facebookCover }), o.at);
}

export async function sendPhotos(config: UploadPostConfig, o: PhotoSend): Promise<SendResult> {
    return send(config, '/api/upload_photos', o.requestId, photoForm({ ...o, profile: config.profile, facebookPageId: config.facebookPageId }), o.at);
}

export interface PostState { done: boolean; results: Record<string, PlatformResult>; message: string | null }

// Each platform's result from a status or upload answer, whichever shape it uses. Pure, for the tests.
export function parseResults(raw: unknown): Record<string, PlatformResult> {
    const out: Record<string, PlatformResult> = {};
    const one = (platform: string, r: Record<string, unknown>) => {
        const str = (...keys: string[]) => keys.map(k => r[k]).find((v): v is string => typeof v === 'string' && !!v) ?? null;
        out[platform] = {
            ok: r.success === true,
            url: str('url', 'post_url'),
            postId: str('post_id', 'platform_post_id', 'video_id', 'publish_id'),
            error: r.success === true ? null : str('error', 'message', 'skip_reason'),
        };
    };
    if (Array.isArray(raw)) {
        for (const r of raw) {
            if (r && typeof r === 'object' && typeof (r as { platform?: unknown }).platform === 'string') one((r as { platform: string }).platform, r as Record<string, unknown>);
        }
    } else if (raw && typeof raw === 'object') {
        for (const [platform, r] of Object.entries(raw)) if (r && typeof r === 'object') one(platform, r as Record<string, unknown>);
    }
    return out;
}

const FINISHED = new Set(['completed', 'failed', 'not_found']);

// A post's state at Upload-Post (GET /api/uploadposts/status), by its job ID or the request ID we sent.
export async function postState(config: UploadPostConfig, ref: { jobId: string | null; requestId: string }): Promise<PostState> {
    const ask = (q: Record<string, string>) => call(config, `/api/uploadposts/status?${new URLSearchParams(q)}`, { method: 'GET' });
    let out: Record<string, unknown>;
    try {
        out = await ask(ref.jobId ? { job_id: ref.jobId } : { request_id: ref.requestId });
    } catch (e) {
        if (!(e instanceof UploadPostError && e.status === 404)) throw e;
        try {
            if (!ref.jobId) throw e;
            out = await ask({ request_id: ref.requestId });
        } catch (e2) {
            if (e2 instanceof UploadPostError && e2.status === 404) return { done: true, results: {}, message: 'Upload-Post does not know this post' };
            throw e2;
        }
    }
    const status = typeof out.status === 'string' ? out.status : '';
    return { done: FINISHED.has(status), results: parseResults(out.results), message: typeof out.message === 'string' ? out.message : null };
}

// Cancels a post set for later (DELETE /api/uploadposts/schedule/{job_id}). A job already gone counts as cancelled.
export async function cancelScheduled(config: UploadPostConfig, jobId: string): Promise<void> {
    try {
        await call(config, `/api/uploadposts/schedule/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
    } catch (e) {
        if (e instanceof UploadPostError && e.status === 404) return;
        throw e;
    }
}

// Changes a post set for later (PATCH /api/uploadposts/schedule/{job_id}): its time, or its words by their upload form
// field names (instagram_title, facebook_title, facebook_description). Upload-Post refuses in the last minute (409).
export function patchBody(o: { at?: number; fields?: Record<string, string> }): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (o.at) {
        body.scheduled_date = new Date(o.at).toISOString().replace(/\.\d{3}Z$/, '');
        body.timezone = 'UTC';
    }
    if (o.fields && Object.keys(o.fields).length) body.fields = o.fields;
    return body;
}

export async function patchScheduled(config: UploadPostConfig, jobId: string, o: { at?: number; fields?: Record<string, string> }): Promise<void> {
    await call(config, `/api/uploadposts/schedule/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody(o)),
        headers: { 'Content-Type': 'application/json' },
    });
}

// The upload form's field name for each word a producer can change.
export const FIELD_NAMES = { instagramCaption: 'instagram_title', facebookTitle: 'facebook_title', facebookDescription: 'facebook_description', facebookCaption: 'facebook_title' } as const;
