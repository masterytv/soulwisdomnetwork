"use client";

// The Social page's body (docs/specs/026-social-publishing.md; app/admin/podcast/social/page.tsx): the posts ahead and
// the last 14 days, each with its picture, words, time in ET, status and live links, and Edit, Post, Hold and Cancel.

import { useCallback, useEffect, useState } from "react";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { field, hint, primary, secondary } from "@/components/studio/ui";
import { studioFetch, studioFetchBytes } from "@/lib/studioClient";
import { etLabel, KIND_LABELS, PLATFORM_NAMES, STATUS_LABELS, type Platform, type PostStatus, type SocialAction } from "@/lib/social/plan";
import type { PostView } from "@/lib/server/social";

interface Listing { ahead: PostView[]; past: PostView[]; setup: string[] }

const STATUS_TONE: Record<PostStatus, string> = {
    waiting: "text-amber-300 border-amber-400/40",
    sent: "text-sky-300 border-sky-400/40",
    posted: "text-emerald-300 border-emerald-400/40",
    partial: "text-orange-300 border-orange-400/40",
    failed: "text-red-300 border-red-400/40",
    held: "text-gray-300 border-studio-edge",
    cancelled: "text-gray-400 border-studio-hairline",
    missed: "text-gray-400 border-studio-hairline",
};

const ACTION_LABELS: Record<SocialAction, string> = { post: "Post", hold: "Hold", cancel: "Cancel" };
const CONFIRM: Partial<Record<SocialAction, string>> = {
    cancel: "Cancel this post for good? It won't go out.",
    post: "Hand this post to Upload-Post now? It goes at its time, or at once if that has passed.",
};

function Post({ post, onChange }: { post: PostView; onChange: () => Promise<void> }) {
    const [editing, setEditing] = useState(false);
    const [words, setWords] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const content = (post.content ?? {}) as unknown as Record<string, string>;
    const run = async (init: RequestInit) => {
        setBusy(true);
        try {
            await studioFetch(`/api/studio/social/${post.id}`, init);
            setError("");
            setEditing(false);
            await onChange();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    const act = (action: SocialAction) => {
        if (CONFIRM[action] && !window.confirm(CONFIRM[action])) return;
        void run({ method: "POST", body: JSON.stringify({ action }) });
    };
    const links = post.platforms.map(p => ({ p, r: post.results[p] })).filter(x => x.r?.url);
    return (
        <li id={`post-${post.id}`} className="bg-studio-card border border-studio-line rounded-xl p-4 flex flex-col sm:flex-row gap-4">
            {post.kind !== "carousel" && post.pictures[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.pictures[0]} alt="" className="w-36 shrink-0 rounded-lg border border-studio-hairline self-start" />
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
                {post.kind === "carousel" && post.pictures.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {post.pictures.map((src, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={src} alt={`Slide ${i + 1}`} className="w-28 shrink-0 rounded-lg border border-studio-hairline" />
                        ))}
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-100">{KIND_LABELS[post.kind]}</span>
                    <span className="text-sm text-gray-300">{etLabel(post.postAt)}</span>
                    <span className={`text-2xs px-2 py-0.5 rounded-full border ${STATUS_TONE[post.status]}`}>{STATUS_LABELS[post.status]}</span>
                    <span className="text-2xs text-gray-400">{post.platforms.map(p => PLATFORM_NAMES[p as Platform]).join(" · ")}</span>
                </div>
                <p className="text-sm text-gray-200">
                    {post.shortTitle} <span className="text-gray-400">— {post.speaker}</span>{" "}
                    <a href={post.youtube.url} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline text-xs">Short on YouTube</a>
                    <span className="text-gray-400 text-xs"> ({etLabel(post.youtube.publishAt)})</span>
                </p>
                {post.reason && <p className={hint}>{post.reason}</p>}
                {links.length > 0 && (
                    <p className="text-xs flex flex-wrap gap-3">
                        {links.map(({ p, r }) => (
                            <a key={p} href={r!.url!} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">On {PLATFORM_NAMES[p as Platform]}</a>
                        ))}
                    </p>
                )}
                {editing ? (
                    <div className="flex flex-col gap-2">
                        {post.editable.map(f => (
                            <label key={f.key} className="flex flex-col gap-1">
                                <span className="text-xs text-gray-300">{f.label}</span>
                                <textarea
                                    className={field}
                                    rows={f.key === "facebookTitle" ? 2 : 6}
                                    value={words[f.key] ?? content[f.key] ?? ""}
                                    onChange={e => setWords(w => ({ ...w, [f.key]: e.target.value }))}
                                />
                            </label>
                        ))}
                        <div className="flex gap-2">
                            <button className={primary} disabled={busy || !Object.keys(words).length} onClick={() => void run({ method: "PATCH", body: JSON.stringify(words) })}>Save</button>
                            <button className={secondary} disabled={busy} onClick={() => { setEditing(false); setWords({}); }}>Close</button>
                        </div>
                    </div>
                ) : (
                    <details>
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-200">The words</summary>
                        <div className="mt-2 flex flex-col gap-2">
                            {["quote", "instagramCaption", "facebookTitle", "facebookDescription", "facebookCaption"].filter(k => content[k]).map(k => (
                                <div key={k}>
                                    <p className="text-2xs text-gray-400">{({ quote: "The quote on the card", instagramCaption: "Instagram", facebookTitle: "Facebook title", facebookDescription: "Facebook description", facebookCaption: "Facebook" } as Record<string, string>)[k]}</p>
                                    <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{content[k]}</p>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
                {error && <ErrorNote message={error} />}
                {!editing && (post.actions.length > 0 || post.editable.length > 0 || (post.kind === "carousel" && post.content)) && (
                    <div className="flex flex-wrap gap-2">
                        {post.editable.length > 0 && <button className={secondary} disabled={busy} onClick={() => setEditing(true)}>Edit</button>}
                        {post.kind === "carousel" && post.content && <YoutubePost id={post.id} onError={setError} />}
                        {post.actions.map(a => (
                            <button key={a} className={secondary} disabled={busy} onClick={() => act(a)}>{ACTION_LABELS[a]}</button>
                        ))}
                    </div>
                )}
            </div>
        </li>
    );
}

// Saves bytes as a file in the browser.
function save(bytes: BlobPart, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// "YouTube post" (YouTube's posts API is open only to launch partners until 2027 and can't schedule): downloads the
// carousel's slides (JPEG, 4:5) and youtube-post.txt with the title, the speaker's credit and the episode's link, and
// copies the text, ready to paste into a post in YouTube Studio.
function YoutubePost({ id, onError }: { id: string; onError: (message: string) => void }) {
    const [state, setState] = useState<"idle" | "working" | "done">("idle");
    const run = async () => {
        setState("working");
        try {
            const base = `/api/studio/social/${id}/youtube`;
            const post = await studioFetch<{ text: string; slides: number; title: string }>(base);
            for (let n = 1; n <= post.slides; n++) save(await studioFetchBytes(`${base}?slide=${n}`), `youtube-post-slide-${n}.jpg`, "image/jpeg");
            save(post.text, "youtube-post.txt", "text/plain;charset=utf-8");
            await navigator.clipboard?.writeText(post.text).catch(() => {});
            setState("done");
        } catch (e) {
            onError((e as Error).message);
            setState("idle");
        }
    };
    return (
        <button className={secondary} disabled={state === "working"} onClick={() => void run()}
            title="Downloads the slides and the text for a post on the YouTube channel, and copies the text">
            {state === "working" ? "Downloading…" : state === "done" ? "YouTube post ✓ (text copied)" : "YouTube post"}
        </button>
    );
}

export function SocialView() {
    const [list, setList] = useState<Listing | null>(null);
    const [error, setError] = useState("");
    const load = useCallback(() => studioFetch<Listing>("/api/studio/social").then(
        l => { setList(l); setError(""); },
        (e: Error) => setError(e.message),
    ), []);
    useEffect(() => {
        let live = true;
        studioFetch<Listing>("/api/studio/social").then(l => { if (live) setList(l); }, (e: Error) => { if (live) setError(e.message); });
        return () => { live = false; };
    }, []);
    useEffect(() => {
        // Jump to a post linked from the calendar, once the list is in.
        if (list && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    }, [list]);
    if (error) return <ErrorNote title="The posts could not be loaded" message={error} />;
    if (!list) return <p className={hint}>Loading the posts…</p>;
    return (
        <div className="flex flex-col gap-8">
            {list.setup.length > 0 && (
                <ErrorNote tone="warning" title="Posting is not set up yet"
                    message={`Posts are planned but not handed to Upload-Post until ${list.setup.join(", ")} ${list.setup.length > 1 ? "are" : "is"} set (docs/specs/026-social-publishing.md, "Secrets and settings").`} />
            )}
            <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-gray-100">Coming up <span className="text-sm text-gray-400">({list.ahead.length})</span></h2>
                {list.ahead.length ? (
                    <ul className="flex flex-col gap-3">{list.ahead.map(p => <Post key={p.id} post={p} onChange={load} />)}</ul>
                ) : (
                    <p className={hint}>Nothing planned. Posts appear here once Shorts approved at Checkpoint E are scheduled on YouTube.</p>
                )}
            </section>
            <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-gray-100">The last 14 days <span className="text-sm text-gray-400">({list.past.length})</span></h2>
                {list.past.length ? (
                    <ul className="flex flex-col gap-3">{list.past.map(p => <Post key={p.id} post={p} onChange={load} />)}</ul>
                ) : (
                    <p className={hint}>Nothing posted in the last 14 days.</p>
                )}
            </section>
        </div>
    );
}
