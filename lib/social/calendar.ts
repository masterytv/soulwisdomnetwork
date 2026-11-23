// The Social calendar (docs/specs/026-social-publishing.md, stage 5; Short Maker's /social/calendar copied, not imported):
// one month at a time, Sunday first, in Eastern Time, each day listing what goes out where, with live links for past
// posts and each post opening on the Social page. Pure, so the page, the server and the tests share it.

import { easternDay, easternToUtc, KIND_LABELS, PLATFORM_NAMES, type Platform, type PlatformResult, type PostKind, type PostStatus } from './plan';

// At most this many posts show in a day's box; the rest are behind "+N more", which lists the whole day below the month.
export const DAY_ROWS = 4;
// How far back the Social page lists past posts; older ones open only by their live links.
export const PAGE_PAST_DAYS = 14;

export const KIND_SHORT: Record<PostKind, string> = { reel: 'Reel', carousel: 'Carousel', image: 'Quote' };
const PLATFORM_SHORT: Record<string, string> = { instagram: 'IG', facebook: 'FB' };
const DAY_MS = 24 * 60 * 60_000;

// A month as YYYY-MM: the one asked for when valid, else this Eastern month.
export function monthOf(param: string | null | undefined, now: number): string {
    return param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : easternDay(now).slice(0, 7);
}

// The month n months from this one, as YYYY-MM.
export function shiftMonth(month: string, n: number): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// "November 2026".
export const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

// The instants the month starts and ends, Eastern, in ms.
export function monthRange(month: string): { from: number; to: number } {
    return { from: easternToUtc(`${month}-01`, '00:00'), to: easternToUtc(`${shiftMonth(month, 1)}-01`, '00:00') };
}

export function addDays(day: string, n: number): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

// The month's weeks, Sunday first, each day as YYYY-MM-DD with whether it is in the month (the grid's edges aren't).
export function monthWeeks(month: string): { day: string; inMonth: boolean }[][] {
    const first = `${month}-01`;
    const start = addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
    const next = `${shiftMonth(month, 1)}-01`;
    const weeks: { day: string; inMonth: boolean }[][] = [];
    for (let d = start; weeks.length === 0 || d < next; d = addDays(d, 7)) {
        weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)).map(day => ({ day, inMonth: day.startsWith(month) })));
    }
    return weeks;
}

// What the calendar needs of a post (lib/server/social.ts postsBetween).
export interface CalendarPost {
    id: string;
    kind: PostKind;
    status: PostStatus;
    postAt: number;
    platforms: string[];
    results: Record<string, PlatformResult>;
    shortTitle: string;
    speaker: string;
    notMade?: boolean;
}

export interface CalendarEntry {
    id: string;
    day: string;
    time: string;                   // "7pm", "7:30pm", Eastern
    kind: string;
    kindLabel: string;
    title: string;
    speaker: string;
    status: PostStatus;
    platforms: { name: string; full: string; url: string | null; ok: boolean | null }[];
    href: string | null;            // the post on the Social page, while it lists it
}

export function etTime(t: number): string {
    return new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
        .replace(':00', '').replace(/\s/g, '').toLowerCase();
}

// A post as the calendar shows it.
export function calendarEntry(p: CalendarPost, now: number): CalendarEntry {
    const onPage = p.postAt >= now - PAGE_PAST_DAYS * DAY_MS;
    return {
        id: p.id,
        day: easternDay(p.postAt),
        time: etTime(p.postAt),
        kind: KIND_SHORT[p.kind] ?? p.kind,
        kindLabel: KIND_LABELS[p.kind] ?? p.kind,
        title: p.shortTitle,
        speaker: p.speaker,
        status: p.status,
        platforms: p.platforms.map(name => ({
            name: PLATFORM_SHORT[name] ?? name,
            full: PLATFORM_NAMES[name as Platform] ?? name,
            url: p.results[name]?.ok ? (p.results[name]?.url ?? null) : null,
            ok: p.results[name] ? p.results[name].ok : null,
        })),
        href: onPage ? `/admin/podcast/social#post-${p.id}` : null,
    };
}

// The month's posts by day, soonest first within a day. Posts not made never show; cancelled ones only when asked.
export function byDay(posts: CalendarPost[], now: number, showCancelled = false): Map<string, CalendarEntry[]> {
    const out = new Map<string, CalendarEntry[]>();
    for (const p of [...posts].sort((a, b) => a.postAt - b.postAt)) {
        if (p.notMade || (p.status === 'cancelled' && !showCancelled)) continue;
        const e = calendarEntry(p, now);
        out.set(e.day, [...(out.get(e.day) ?? []), e]);
    }
    return out;
}

// The month's totals: posted (or partly), still to go, and failed or missed.
export function monthTotals(days: Map<string, CalendarEntry[]>): { posted: number; planned: number; failed: number } {
    const t = { posted: 0, planned: 0, failed: 0 };
    for (const list of days.values()) {
        for (const e of list) {
            if (e.status === 'posted' || e.status === 'partial') t.posted++;
            else if (e.status === 'failed' || e.status === 'missed') t.failed++;
            else if (e.status !== 'cancelled') t.planned++;
        }
    }
    return t;
}

// "Monday, November 23".
export const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });

