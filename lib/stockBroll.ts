// Why: b-roll from real footage and photos first (docs/specs/023-stock-broll.md). For each approved b-roll idea the
// b-roll job (agent/src/podcast/broll.ts, mode "stock") searches Pexels and Pixabay for landscape video and photos,
// Claude picks the candidate that best shows the moment (footage before photos), and the file is copied into Storage
// as the idea's b-roll. An idea nothing fits is left for an AI image, which the producer makes from the show notes
// page. Both sites are free for commercial use without attribution; the description credits them anyway.
//
// This file is pure: the provider answers read into candidates, the picker's prompt and rules, and the credits. The
// network calls are in the job.

import { z } from 'zod';

export const STOCK_SOURCES = ['pexels', 'pixabay'] as const;
export type StockSource = typeof STOCK_SOURCES[number];
export const STOCK_LABELS: Record<StockSource, string> = { pexels: 'Pexels', pixabay: 'Pixabay' };

export interface StockCandidate {
    id: string;                   // "pexels-video-123": unique across sources and kinds
    source: StockSource;
    kind: 'video' | 'image';
    url: string;                  // the file to download
    thumb: string;
    width: number;
    height: number;
    alt: string;                  // what it shows, as the site describes it
    credit: { name: string; url: string | null };
    pageUrl: string;
    seconds: number | null;       // footage's length
}

// The episode is 1920x1080: footage at least 1280 wide looks sharp enough, and nothing over 1920 is needed.
const MIN_W = 1280, MAX_W = 1920;
// Landscape close enough to 16:9 to fill the frame with little cropped (4:3 to 2.4:1).
export const landscape = (w: number, h: number) => w > 0 && h > 0 && w / h >= 1.3 && w / h <= 2.4;

// ─── search addresses ───────────────────────────────────────────────────────

export function stockQuery(idea: { idea: string; search?: string }): string {
    const words = (idea.search ?? '').trim() || idea.idea;
    return words.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ');
}

export function pexelsUrl(kind: 'video' | 'image', query: string, perPage: number) {
    const q = new URLSearchParams({ query, orientation: 'landscape', per_page: String(perPage), size: 'medium' });
    return kind === 'video' ? `https://api.pexels.com/videos/search?${q}` : `https://api.pexels.com/v1/search?${q}`;
}

export function pixabayUrl(kind: 'video' | 'image', query: string, perPage: number, key: string) {
    const q = new URLSearchParams({ key, q: query.slice(0, 100), safesearch: 'true', per_page: String(Math.max(3, Math.min(200, perPage))) });
    if (kind === 'image') { q.set('image_type', 'photo'); q.set('orientation', 'horizontal'); }
    return kind === 'video' ? `https://pixabay.com/api/videos/?${q}` : `https://pixabay.com/api/?${q}`;
}

// ─── reading the answers ────────────────────────────────────────────────────

// The alt text Pexels has only in the page address ("…/video/waves-on-a-beach-12345/").
export const slugText = (url: string) =>
    decodeURIComponent(url.replace(/\/+$/, '').split('/').pop() ?? '').replace(/-\d+$/, '').replace(/-/g, ' ').trim();

interface PexelsFile { link: string; width: number | null; height: number | null; file_type: string }

// The landscape MP4 closest to 1920 wide without going over, at least 1280 when there is one.
export function bestPexelsFile(files: PexelsFile[]): PexelsFile | null {
    const ok = files.filter(f => f.file_type === 'video/mp4' && f.width && f.height && landscape(f.width, f.height) && /^https:\/\//.test(f.link));
    const fits = ok.filter(f => f.width! <= MAX_W).sort((a, b) => b.width! - a.width!);
    return fits.find(f => f.width! >= MIN_W) ?? fits[0] ?? ok.sort((a, b) => a.width! - b.width!)[0] ?? null;
}

export function pexelsVideos(data: unknown): StockCandidate[] {
    const videos = ((data as { videos?: unknown[] })?.videos ?? []) as {
        id: number; url: string; image: string; duration: number; user?: { name?: string; url?: string }; video_files?: PexelsFile[];
    }[];
    return videos.flatMap(v => {
        const file = bestPexelsFile(v.video_files ?? []);
        if (!file || !v.id) return [];
        return [{
            id: `pexels-video-${v.id}`, source: 'pexels', kind: 'video', url: file.link, thumb: v.image ?? '', width: file.width!, height: file.height!,
            alt: slugText(v.url ?? ''), credit: { name: v.user?.name ?? 'Pexels', url: v.user?.url ?? null }, pageUrl: v.url ?? 'https://www.pexels.com',
            seconds: typeof v.duration === 'number' ? v.duration : null,
        } satisfies StockCandidate];
    });
}

export function pexelsPhotos(data: unknown): StockCandidate[] {
    const photos = ((data as { photos?: unknown[] })?.photos ?? []) as {
        id: number; width: number; height: number; url: string; alt?: string; photographer?: string; photographer_url?: string; src?: Record<string, string>;
    }[];
    return photos.flatMap(p => {
        // "large2x" is 1880 wide at most, enough for a 1920 frame with a slow zoom; the original as a fallback.
        const url = p.src?.large2x ?? p.src?.original;
        if (!p.id || !url || !landscape(p.width, p.height)) return [];
        return [{
            id: `pexels-photo-${p.id}`, source: 'pexels', kind: 'image', url, thumb: p.src?.medium ?? url, width: p.width, height: p.height,
            alt: p.alt?.trim() || slugText(p.url ?? ''), credit: { name: p.photographer ?? 'Pexels', url: p.photographer_url ?? null },
            pageUrl: p.url ?? 'https://www.pexels.com', seconds: null,
        } satisfies StockCandidate];
    });
}

interface PixabayHit {
    id: number; pageURL: string; tags?: string; user?: string; user_id?: number; userURL?: string;
    isAiGenerated?: boolean; isLowQuality?: boolean;   // Pixabay marks these; stock here means real and good
    webformatURL?: string; largeImageURL?: string; imageWidth?: number; imageHeight?: number;
    duration?: number; videos?: Record<string, { url: string; width: number; height: number; thumbnail?: string }>;
}
const pixabayHits = (data: unknown) => (((data as { hits?: unknown[] })?.hits ?? []) as PixabayHit[]).filter(h => h.id && !h.isAiGenerated && !h.isLowQuality);
const pixabayCredit = (h: PixabayHit) => ({ name: h.user ?? 'Pixabay', url: h.userURL || (h.user && h.user_id ? `https://pixabay.com/users/${encodeURIComponent(h.user)}-${h.user_id}/` : null) });

export function pixabayVideos(data: unknown): StockCandidate[] {
    return pixabayHits(data).flatMap(h => {
        const files = Object.values(h.videos ?? {}).filter(f => f.url && landscape(f.width, f.height));
        const file = files.filter(f => f.width <= MAX_W).sort((a, b) => b.width - a.width)[0] ?? files.sort((a, b) => a.width - b.width)[0];
        if (!file) return [];
        return [{
            id: `pixabay-video-${h.id}`, source: 'pixabay', kind: 'video', url: file.url, thumb: file.thumbnail ?? '', width: file.width, height: file.height,
            alt: h.tags ?? '', credit: pixabayCredit(h), pageUrl: h.pageURL, seconds: typeof h.duration === 'number' ? h.duration : null,
        } satisfies StockCandidate];
    });
}

export function pixabayPhotos(data: unknown): StockCandidate[] {
    return pixabayHits(data).flatMap(h => {
        const url = h.largeImageURL ?? h.webformatURL;
        if (!url || !landscape(h.imageWidth ?? 0, h.imageHeight ?? 0)) return [];
        return [{
            id: `pixabay-photo-${h.id}`, source: 'pixabay', kind: 'image', url, thumb: h.webformatURL ?? url, width: h.imageWidth!, height: h.imageHeight!,
            alt: h.tags ?? '', credit: pixabayCredit(h), pageUrl: h.pageURL, seconds: null,
        } satisfies StockCandidate];
    });
}

// Footage first, then photos; within each, the sources taken in turn so neither fills the list.
export function mergeCandidates(lists: StockCandidate[][], max: number): StockCandidate[] {
    const out: StockCandidate[] = [];
    const seen = new Set<string>();
    for (const kind of ['video', 'image'] as const) {
        const of = lists.map(l => l.filter(c => c.kind === kind));
        for (let i = 0; i < Math.max(0, ...of.map(l => l.length)); i++) {
            for (const l of of) if (l[i] && !seen.has(l[i].id)) { seen.add(l[i].id); out.push(l[i]); }
        }
    }
    return out.slice(0, max);
}

// ─── Claude's pick ──────────────────────────────────────────────────────────

export const PICK_SYSTEM = `You choose stock b-roll for a long-form spiritual podcast on YouTube (near-death experiences,
consciousness, the afterlife). B-roll plays full screen over the person speaking for a few seconds. For each moment you get
what the b-roll should show, what is being said, how many seconds it is on screen, and a list of stock candidates from
Pexels and Pixabay (their descriptions only). Pick the candidate that best shows the moment, or null when none fits well:
a null moment gets an AI image instead, so null is better than a poor match.
Rules:
- Prefer real footage (video). Use a photo only when no footage fits.
- It must match the moment (place, object, action, mood), not just share a word.
- Footage should last at least as long as the moment is on screen.
- Never use the same candidate for two moments.
- Never pick a clearly identifiable person to stand for a real person in the episode (a guest, a host, someone they
  name): a stranger's face would be presented as them. Hands, silhouettes, backs, crowds, places, nature and objects are fine.
- Avoid candidates likely to show text, logos, brands, weapons, gore or anything that would jar with a reverent, hopeful tone.`;

export const PicksSchema = z.object({
    picks: z.array(z.object({
        index: z.number().int().describe('The moment\'s number, as given'),
        candidate: z.string().nullable().describe('The chosen candidate\'s id, or null when none fits well'),
        why: z.string().describe('A few words on why'),
    })),
});
export type Picks = z.infer<typeof PicksSchema>;

export interface PickMoment { index: number; idea: string; why: string; seconds: number; candidates: StockCandidate[] }

export function pickMessage(moments: PickMoment[]): string {
    return moments.map(m => [
        `Moment ${m.index} (${m.seconds} s on screen): ${m.idea}`,
        m.why ? `Being said: ${m.why}` : '',
        'Candidates:',
        ...m.candidates.map(c => `  - ${c.id} (${c.kind}${c.seconds ? `, ${Math.round(c.seconds)} s` : ''}, ${c.width}x${c.height}): ${c.alt || '(no description)'}`),
    ].filter(Boolean).join('\n')).join('\n\n');
}

// Claude's picks, checked: a candidate that was offered for that moment, never used twice (nor already in use
// elsewhere in the episode), and footage no shorter than half its moment (it is shortened to fit, never looped).
export function acceptPicks(picks: Picks['picks'], moments: PickMoment[], inUse: Set<string> = new Set()): Map<number, StockCandidate> {
    const out = new Map<number, StockCandidate>();
    const taken = new Set(inUse);
    const byIndex = new Map(moments.map(m => [m.index, m]));
    for (const p of picks) {
        const m = byIndex.get(p.index);
        if (!m || !p.candidate || out.has(p.index)) continue;
        const c = m.candidates.find(x => x.id === p.candidate);
        if (!c || taken.has(c.id)) continue;
        if (c.kind === 'video' && c.seconds !== null && c.seconds < m.seconds / 2) continue;
        taken.add(c.id);
        out.set(p.index, c);
    }
    return out;
}

// ─── credits ────────────────────────────────────────────────────────────────

// One line per photographer or videographer, by site, for the YouTube description ("B-roll" section). Neither site
// requires it; it is good manners and makes a Content ID dispute easy to answer.
export function stockCredits(images: { source?: string; credit?: { name: string } | null }[]): string[] {
    const by = new Map<StockSource, Set<string>>();
    for (const i of images) {
        if (!STOCK_SOURCES.includes(i.source as StockSource) || !i.credit?.name) continue;
        const s = i.source as StockSource;
        by.set(s, (by.get(s) ?? new Set()).add(i.credit.name.trim()));
    }
    return STOCK_SOURCES.filter(s => by.has(s)).map(s => `${[...by.get(s)!].sort().join(', ')} on ${STOCK_LABELS[s]}`);
}
