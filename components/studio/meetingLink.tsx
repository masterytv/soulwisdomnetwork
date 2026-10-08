"use client";

// The hosts' Zoom room for recording (Studio settings `meetingUrl`), with Join and Copy. It comes from the
// settings route, which only the Studio's staff can read, so members never see it. Shows nothing until set.

import { useEffect, useState } from "react";
import Link from "next/link";
import { studioFetch } from "@/lib/studioClient";
import type { StudioSettings } from "@/lib/studioSettings";
import { secondary } from "@/components/studio/ui";

export function MeetingLink({ showChecklist = false }: { showChecklist?: boolean }) {
    const [url, setUrl] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        studioFetch<{ settings: StudioSettings }>("/api/studio/settings")
            .then(v => setUrl(v.settings.meetingUrl))
            .catch(() => { /* no link shown */ });
    }, []);

    if (!url) return null;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            document.getElementById("meeting-url")?.focus();   // copying refused: select it to copy by hand
        }
    };

    return (
        <section aria-label="Zoom room" className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-amber-300 mr-1">Zoom room</span>
            <input id="meeting-url" readOnly value={url} onFocus={e => e.target.select()} aria-label="Zoom meeting link"
                className="flex-1 min-w-[12rem] bg-transparent text-xs text-gray-300 font-mono truncate focus:outline-none" />
            <button onClick={() => void copy()} className={secondary}>{copied ? "Copied" : "Copy link"}</button>
            <a href={url} target="_blank" rel="noreferrer" className={secondary}>Join</a>
            {showChecklist && <Link href="/admin/podcast/recording" className={secondary}>Recording checklist</Link>}
        </section>
    );
}
