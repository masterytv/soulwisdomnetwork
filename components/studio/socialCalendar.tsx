"use client";

// The Social calendar's body (docs/specs/026-social-publishing.md, stage 5; app/admin/podcast/social/calendar/page.tsx):
// a month at a time, Sunday first, Eastern Time, each day listing what goes (or went) out where. A posted one links to
// the live post on each platform; any post opens on the Social page by its anchor while that page lists it. A busy day
// shows its first few and "+N more"; "Links" (or "+N more") lists the whole day below the month with each live post. On a phone, a list of the days with posts.
// Copied in spirit from Short Maker's /social/calendar.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { hint, secondary } from "@/components/studio/ui";
import { studioFetch } from "@/lib/studioClient";
import {
    byDay, dayLabel, DAY_ROWS, monthName, monthOf, monthTotals, monthWeeks, shiftMonth, type CalendarEntry, type CalendarPost,
} from "@/lib/social/calendar";
import { easternDay, type PostStatus } from "@/lib/social/plan";

// Each status's dot: posted green, handed over sky, planned amber, failed red, held and cancelled grey.
const DOT: Record<PostStatus, string> = {
    posted: "bg-emerald-400",
    partial: "bg-orange-400",
    sent: "bg-sky-400",
    waiting: "bg-amber-300",
    failed: "bg-red-400",
    missed: "bg-red-300",
    held: "bg-gray-400",
    cancelled: "bg-gray-600",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const link = "text-amber-300 no-underline hover:underline";

// One post: its time and kind (opening it on the Social page), and where it goes, linked once posted.
function Entry({ e, wide = false }: { e: CalendarEntry; wide?: boolean }) {
    const label = (
        <>
            <span className="tabular-nums text-gray-400">{e.time}</span>{" "}
            <span className={e.status === "cancelled" ? "line-through text-gray-500" : "font-medium text-gray-100"}>{e.kind}</span>
            {wide && e.title && <span className="text-gray-300"> · {e.title} <span className="text-gray-400">— {e.speaker}</span></span>}
        </>
    );
    return (
        <li className="flex min-w-0 items-center gap-1.5 text-xs leading-5" title={`${e.kindLabel}: ${e.title} — ${e.speaker} (${e.status})`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[e.status]}`} />
            <span className={`min-w-0 ${wide ? "" : "truncate"}`}>
                {e.href ? <Link href={e.href} className="no-underline hover:underline">{label}</Link> : label}
            </span>
            {wide && <span className="ml-auto flex shrink-0 gap-2">
                {e.platforms.map(p => p.url ? (
                    <a key={p.name} href={p.url} target="_blank" rel="noreferrer" className={link} title={`Open on ${p.full}`}>{p.name}↗</a>
                ) : (
                    <span key={p.name} className={p.ok === false ? "text-red-400" : "text-gray-500"} title={p.ok === false ? `Failed on ${p.full}` : p.full}>{p.name}</span>
                ))}
            </span>}
        </li>
    );
}

export function SocialCalendar() {
    const params = useSearchParams();
    // Read once: "today" and which posts the Social page still lists.
    const [now] = useState(() => Date.now());
    const month = monthOf(params.get("month"), now);
    const dayParam = params.get("day");
    const [loaded, setLoaded] = useState<{ month: string; posts: CalendarPost[] } | null>(null);
    const [error, setError] = useState<{ month: string; message: string } | null>(null);

    useEffect(() => {
        let live = true;
        studioFetch<{ month: string; posts: CalendarPost[] }>(`/api/studio/social/calendar?month=${month}`).then(
            r => { if (live) setLoaded(r); },
            (e: Error) => { if (live) setError({ month, message: e.message }); },
        );
        return () => { live = false; };
    }, [month]);

    return (
        <CalendarMonth month={month} now={now} posts={loaded?.month === month ? loaded.posts : null}
            error={error?.month === month ? error.message : null}
            showCancelled={params.get("cancelled") === "1"} openDay={dayParam && dayParam.startsWith(month) ? dayParam : null} />
    );
}

// The month as drawn, from its posts (null while loading).
export function CalendarMonth({ month, now, posts, error, showCancelled, openDay }: {
    month: string; now: number; posts: CalendarPost[] | null; error: string | null; showCancelled: boolean; openDay: string | null;
}) {
    const days = useMemo(() => byDay(posts ?? [], now, showCancelled), [posts, now, showCancelled]);
    const totals = monthTotals(days);
    const today = easternDay(now);
    const href = (o: { month?: string; day?: string | null; cancelled?: boolean }) => {
        const p = new URLSearchParams();
        p.set("month", o.month ?? month);
        if (o.day) p.set("day", o.day);
        if (o.cancelled ?? showCancelled) p.set("cancelled", "1");
        return `/admin/podcast/social/calendar?${p}`;
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <Link href={href({ month: shiftMonth(month, -1) })} className={secondary} aria-label="Previous month">←</Link>
                <h2 className="min-w-44 text-center text-lg font-semibold text-gray-100">{monthName(month)}</h2>
                <Link href={href({ month: shiftMonth(month, 1) })} className={secondary} aria-label="Next month">→</Link>
                {month !== today.slice(0, 7) && <Link href={href({ month: today.slice(0, 7) })} className={`text-sm ${link}`}>This month</Link>}
                {posts && (
                    <span className="text-sm text-gray-400">
                        {totals.posted} posted · {totals.planned} to go{totals.failed ? ` · ${totals.failed} failed or missed` : ""}
                    </span>
                )}
                <Link href={href({ cancelled: !showCancelled })} className={`ml-auto text-sm ${link}`}>
                    {showCancelled ? "Hide cancelled" : "Show cancelled"}
                </Link>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                {([["posted", "Posted"], ["sent", "With Upload-Post"], ["waiting", "Planned"], ["held", "Held"], ["failed", "Failed"]] as [PostStatus, string][])
                    .map(([s, l]) => (
                        <span key={s} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${DOT[s]}`} />{l}</span>
                    ))}
                <span>Times in ET · a post opens on the Social page · &ldquo;Links&rdquo; lists the day with each live post (IG Instagram, FB Facebook)</span>
            </div>

            {error && <ErrorNote title="The month could not be loaded" message={error} />}
            {!posts && !error && <p className={hint}>Loading {monthName(month)}…</p>}

            {posts && (
                <>
                    {/* The month as a grid on a wide screen. */}
                    <div className="hidden overflow-hidden rounded-xl border border-studio-line md:block">
                        <div className="grid grid-cols-7 border-b border-studio-line bg-studio-panel text-xs font-medium text-gray-400">
                            {WEEKDAYS.map(d => <div key={d} className="px-2 py-1.5">{d}</div>)}
                        </div>
                        {monthWeeks(month).map(week => (
                            <div key={week[0].day} className="grid grid-cols-7 border-b border-studio-hairline last:border-b-0">
                                {week.map(({ day, inMonth }) => {
                                    const list = inMonth ? (days.get(day) ?? []) : [];
                                    const more = list.length - DAY_ROWS;
                                    return (
                                        <div key={day} id={`day-${day}`}
                                            className={`min-h-28 min-w-0 border-r border-studio-hairline p-1.5 last:border-r-0 ${inMonth ? "bg-studio-card" : "bg-studio-sunk"} ${day === openDay ? "ring-2 ring-inset ring-amber-400" : ""}`}>
                                            <div className={`mb-1 text-xs ${day === today ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 font-semibold text-black" : inMonth ? "text-gray-300" : "text-gray-600"}`}>
                                                {Number(day.slice(8))}
                                            </div>
                                            {list.length > 0 && <ul className="space-y-0.5">{list.slice(0, DAY_ROWS).map(e => <Entry key={e.id} e={e} />)}</ul>}
                                            {list.length > 0 && (
                                                <Link href={`${href({ day })}#day-list`} className={`mt-0.5 block text-xs ${link}`}>
                                                    {more > 0 ? `+${more} more · links` : "Links"}
                                                </Link>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* A busy day in full, opened from "+N more". */}
                    {openDay && (
                        <div id="day-list" className="hidden rounded-xl border border-studio-line bg-studio-card p-4 md:block">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-100">{dayLabel(openDay)}</h3>
                                <Link href={href({ day: null })} className={`text-sm ${link}`}>Close</Link>
                            </div>
                            <ul className="mt-2 space-y-1">{(days.get(openDay) ?? []).map(e => <Entry key={e.id} e={e} wide />)}</ul>
                        </div>
                    )}

                    {/* On a phone: the days with posts, as a list. */}
                    <div className="space-y-4 md:hidden">
                        {days.size === 0 && <p className={hint}>Nothing this month.</p>}
                        {[...days.entries()].map(([day, list]) => (
                            <div key={day}>
                                <h3 className={`mb-1 text-sm font-semibold ${day === today ? "text-amber-300" : "text-gray-100"}`}>{dayLabel(day)}</h3>
                                <ul className="space-y-1">{list.map(e => <Entry key={e.id} e={e} wide />)}</ul>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
