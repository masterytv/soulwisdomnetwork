"use client";

// Clips on the show notes page (docs/specs/025-clips.md), stage 1: 5 to 15 minute stretches of the final cut,
// each about one topic, for posting on YouTube beside the Shorts. The chapters are offered as clips (one, or
// joined with the next); the producer can also mark their own on the player. Each clip's ends move by clicking
// a word near them; its title, description and thumbnail title are typed here. Edits save as they go.
// Claude's picks and titles, making the clips, their thumbnails and scheduling come in later stages.

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { useAutosave } from "@/components/studio/useAutosave";
import { secondary } from "@/components/studio/ui";
import {
    chapterClip, CLIP_DESCRIPTION_MAX, CLIP_MIN_MS, CLIP_TITLE_MAX, clipLength, hasChapterClip, MAX_CLIPS, THUMB_TEXT_MAX,
    type ClipEdit, type ClipLength,
} from "@/lib/clips";
import { mmss } from "@/lib/showNotes";
import { wordBounds } from "@/lib/shorts";
import { studioFetch } from "@/lib/studioClient";
import type { TimedWord } from "@/lib/retime";
import type { ClipItemView, ClipsView } from "@/types/studio";

const input = "bg-black/30 border border-studio-line rounded-lg px-3 py-1.5 text-sm text-white w-full";

const pick = (i: ClipEdit): ClipEdit => ({
    id: i.id, source: i.source, startMs: i.startMs, endMs: i.endMs, title: i.title, description: i.description,
    thumbText: i.thumbText, synthetic: i.synthetic,
});

const LENGTH_NOTE: Record<ClipLength, string> = {
    "too short": "under 2 minutes: too short to make",
    short: "under 5 minutes: fine, but 5 to 15 is the aim",
    good: "",
    long: "over 15 minutes: fine, but 5 to 15 is the aim",
    "too long": "over 20 minutes: too long to make",
};
const lengthClass = (l: ClipLength) => (l === "good" ? "text-gray-300" : l === "too short" || l === "too long" ? "text-red-300" : "text-amber-300");
const minutesOf = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}`;
const newId = () => crypto.randomUUID().slice(0, 8);

export function Clips({ episodeId, enabled }: { episodeId: string; enabled: boolean }) {
    const [view, setView] = useState<ClipsView | null>(null);
    const [items, setItems] = useState<ClipEdit[]>([]);
    const [error, setError] = useState("");
    // Signed links change on every load; keep the first so a playing video is not reset.
    const [finalUrl, setFinalUrl] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState<string | null>(null);
    // The start of a clip being marked on the player, until its end is marked.
    const [marking, setMarking] = useState<number | null>(null);
    const player = useRef<HTMLVideoElement | null>(null);
    const stopAt = useRef<number | null>(null);
    const base = `/api/studio/episodes/${episodeId}/clips`;

    const save = useCallback(async (value: ClipEdit[], version: number) => {
        const res = await studioFetch<{ version: number }>(base, { method: "PATCH", body: JSON.stringify({ version, items: value.map(pick) }) });
        return res.version;
    }, [base]);
    const { saveState, saveError, change, flush, reset } = useAutosave<ClipEdit[]>(save);
    const saveStateRef = useRef(saveState);
    useEffect(() => { saveStateRef.current = saveState; }, [saveState]);

    // Takes what the server has. Unsaved edits on this page win over it, until they are saved.
    const apply = useCallback((next: ClipsView, force: boolean) => {
        setView(next);
        setError("");
        if (force || saveStateRef.current === "saved") {
            setItems(next.items.map(pick));
            reset(next.version);
        }
        setFinalUrl(url => url ?? next.finalUrl);
    }, [reset]);
    const load = useCallback(async (force = false) => {
        try {
            apply(await studioFetch<ClipsView>(base), force);
        } catch (e) {
            setError((e as Error).message);
        }
    }, [base, apply]);

    useEffect(() => {
        if (!enabled) return;
        studioFetch<ClipsView>(base).then(next => apply(next, true), e => setError((e as Error).message));
    }, [enabled, base, apply]);

    function update(next: ClipEdit[]) {
        setItems(next);
        change(next);
    }
    // Saved at once and loaded again: the server snaps a new clip's ends, and sends the words around them.
    async function commit(next: ClipEdit[]) {
        update(next);
        if (await flush()) await load(true);
    }
    const setItem = (id: string, patch: Partial<ClipEdit>) => update(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

    function move(id: string, by: number) {
        const next = [...items];
        const at = next.findIndex(i => i.id === id);
        const to = at + by;
        if (at < 0 || to < 0 || to >= next.length) return;
        [next[at], next[to]] = [next[to], next[at]];
        update(next);
    }

    function remove(item: ClipEdit) {
        if ((item.title || item.description || item.thumbText) && !confirm("Remove this clip, with its title and description?")) return;
        update(items.filter(i => i.id !== item.id));
    }

    function addChapters(index: number, count: number) {
        if (!view) return;
        const clip = chapterClip(view.chapters, index, count, newId());
        if (clip) void commit([...items, clip]);
    }

    // Marking a clip of one's own on the player: Start here, then End here.
    function markEnd() {
        const video = player.current;
        if (!video || marking === null) return;
        const endMs = Math.round(video.currentTime * 1000);
        if (endMs - marking < CLIP_MIN_MS) {
            setError("A clip must be at least 2 minutes long; play on further, then mark its end.");
            return;
        }
        setMarking(null);
        setError("");
        void commit([...items, { id: newId(), source: { kind: "own" }, startMs: marking, endMs, title: "", description: "", thumbText: "", synthetic: false }]);
    }

    // Plays a stretch of the final cut.
    function preview(id: string, startMs: number, endMs: number) {
        const video = player.current;
        if (!video) return;
        setPreviewing(id);
        stopAt.current = endMs / 1000;
        video.currentTime = startMs / 1000;
        void video.play();
        video.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    function onTime() {
        const video = player.current;
        if (video && stopAt.current !== null && video.currentTime >= stopAt.current) {
            video.pause();
            stopAt.current = null;
        }
    }

    const byId = new Map((view?.items ?? []).map(i => [i.id, i]));
    const full = items.length >= MAX_CLIPS;

    if (!view) return <ErrorNote message={error} />;
    if (view.blocker) return <p className="text-xs text-gray-400">{view.blocker}</p>;

    return (
        <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-400">
                Add a chapter as a clip, join it with the next, or mark your own on the player. 5 to 15 minutes about one topic
                is the aim. Click a word near either end to move that end there. Titles and descriptions can be typed now;
                Claude writing them, making the clips and scheduling them on YouTube come next.
                <span className="ml-2">
                    {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved" : saveState === "error" ? "" : items.length ? "Saved" : ""}
                </span>
            </p>
            <ErrorNote title="Your changes were not saved" message={saveError} />

            {finalUrl && (
                <div className="flex flex-col gap-2">
                    <video ref={player} src={finalUrl} controls preload="metadata" onTimeUpdate={onTime} onPause={() => setPreviewing(null)}
                        className="w-full max-w-3xl rounded-xl bg-black aspect-video" />
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                        {marking === null ? (
                            <button onClick={() => player.current && setMarking(Math.round(player.current.currentTime * 1000))} disabled={full} className={secondary}>
                                Start a clip here
                            </button>
                        ) : (
                            <>
                                <span className="text-amber-300">Clip starting at {mmss(marking)}: play to where it should end</span>
                                <button onClick={markEnd} className={secondary}>End the clip here</button>
                                <button onClick={() => setMarking(null)} className={secondary}>Cancel</button>
                            </>
                        )}
                        {previewing && <span className="text-amber-300">Previewing on the final cut</span>}
                    </div>
                </div>
            )}

            {view.chapters.length > 0 && (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-gray-300">Chapters <span className="text-xs text-gray-400">(each one a topic; join a short one with the next)</span></p>
                    <ul className="flex flex-col gap-1 max-h-96 overflow-y-auto pr-1">
                        {view.chapters.map((c, i) => {
                            const length = clipLength(c.endMs - c.startMs);
                            const next = view.chapters[i + 1];
                            const joined = next ? clipLength(next.endMs - c.startMs) : null;
                            const added = hasChapterClip(items, i, 1);
                            const addedJoined = !!next && hasChapterClip(items, i, 2);
                            return (
                                <li key={i} className={`flex flex-wrap items-center gap-2 text-xs rounded-lg px-2 py-1.5 ${added || addedJoined ? "bg-amber-500/10" : "hover:bg-white/5"}`}>
                                    <div className="flex-1 min-w-[12rem]">
                                        <p className="text-gray-200">{c.title}</p>
                                        <p className="text-gray-400">
                                            {mmss(c.startMs)} · <span className={lengthClass(length)}>{minutesOf(c.endMs - c.startMs)}</span>
                                            {length === "short" || length === "too short" ? <span className="text-amber-300"> · short; join it with the next</span> : null}
                                        </p>
                                    </div>
                                    <button onClick={() => preview(`chapter-${i}`, c.startMs, c.endMs)} className={secondary} aria-label={`Preview the chapter ${c.title}`}>▶</button>
                                    <button onClick={() => addChapters(i, 1)} disabled={added || full || length === "too short" || length === "too long"} className={secondary}>
                                        {added ? "Added" : "Add"}
                                    </button>
                                    {next && (
                                        <button onClick={() => addChapters(i, 2)} disabled={addedJoined || full || joined === "too long"} className={secondary}
                                            title={`With "${next.title}": ${minutesOf(next.endMs - c.startMs)}`}>
                                            {addedJoined ? "Joined" : `Join with next (${minutesOf(next.endMs - c.startMs)})`}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {items.map((item, n) => (
                <ClipCard key={item.id} n={n} count={items.length} item={item} view={byId.get(item.id)}
                    chapterTitles={item.source.kind === "chapter"
                        ? view.chapters.slice(item.source.index, item.source.index + item.source.count).map(c => c.title) : []}
                    onChange={patch => setItem(item.id, patch)} onEnds={patch => void commit(items.map(i => (i.id === item.id ? { ...i, ...patch } : i)))}
                    onMove={by => move(item.id, by)} onRemove={() => remove(item)} onPreview={() => preview(item.id, item.startMs, item.endMs)} />
            ))}
            {full && <p className="text-xs text-amber-300">{MAX_CLIPS} clips is the most an episode can have.</p>}

            <ErrorNote message={error} />
        </div>
    );
}

function ClipCard({ n, count, item, view, chapterTitles, onChange, onEnds, onMove, onRemove, onPreview }: {
    n: number; count: number; item: ClipEdit; view: ClipItemView | undefined; chapterTitles: string[];
    onChange: (patch: Partial<ClipEdit>) => void; onEnds: (patch: Partial<ClipEdit>) => void;
    onMove: (by: number) => void; onRemove: () => void; onPreview: () => void;
}) {
    const duration = item.endMs - item.startMs;
    const length = clipLength(duration);
    const from = item.source.kind === "chapter" ? `From ${chapterTitles.map(t => `“${t}”`).join(" and ")}`
        : item.source.kind === "pick" ? "Claude's pick" : "Marked by hand";

    return (
        <div className="flex flex-col gap-2 bg-black/20 border border-studio-hairline rounded-xl p-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span className="text-gray-200 font-medium">#{n + 1}</span>
                <span>{from}</span>
                <span>{mmss(item.startMs)}–{mmss(item.endMs)}</span>
                <span className={lengthClass(length)}>{minutesOf(duration)}{LENGTH_NOTE[length] ? ` (${LENGTH_NOTE[length]})` : ""}</span>
                <span className="grow" />
                <button onClick={onPreview} className={secondary}>▶ Preview</button>
                <button onClick={() => onMove(-1)} disabled={n === 0} className={secondary} title="Earlier in the schedule" aria-label="Move earlier">↑</button>
                <button onClick={() => onMove(1)} disabled={n === count - 1} className={secondary} title="Later in the schedule" aria-label="Move later">↓</button>
                <button onClick={onRemove} className={secondary}>Remove</button>
            </div>
            <label className="text-xs text-gray-400 flex flex-col gap-1">
                <span>YouTube title <span className="text-gray-500">({item.title.length}/{CLIP_TITLE_MAX})</span></span>
                <input value={item.title} maxLength={CLIP_TITLE_MAX} onChange={e => onChange({ title: e.target.value.replace(/[<>]/g, "") })} className={input} />
            </label>
            <label className="text-xs text-gray-400 flex flex-col gap-1">
                <span>Description <span className="text-gray-500">(two or three sentences; the link to the full episode is added)</span></span>
                <textarea value={item.description} maxLength={CLIP_DESCRIPTION_MAX} rows={3}
                    onChange={e => onChange({ description: e.target.value.replace(/[<>]/g, "") })} className={input} />
            </label>
            <label className="text-xs text-gray-400 flex flex-col gap-1">
                <span>Thumbnail title <span className="text-gray-500">(two to six words; *asterisks* make words gold)</span></span>
                <input value={item.thumbText} maxLength={THUMB_TEXT_MAX} onChange={e => onChange({ thumbText: e.target.value })} className={input} />
            </label>
            <label className="text-xs text-gray-400 flex items-center gap-2">
                <input type="checkbox" checked={item.synthetic} onChange={e => onChange({ synthetic: e.target.checked })} />
                Shows AI imagery (YouTube&rsquo;s &ldquo;altered or synthetic content&rdquo;)
            </label>
            {view && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <EndWords label="Start" words={view.startWords} item={item} edge="start" onEnds={onEnds} />
                    <EndWords label="End" words={view.endWords} item={item} edge="end" onEnds={onEnds} />
                </div>
            )}
        </div>
    );
}

// The words within 30 seconds of one end; clicking one moves that end there.
function EndWords({ label, words, item, edge, onEnds }: {
    label: string; words: TimedWord[]; item: ClipEdit; edge: "start" | "end"; onEnds: (patch: Partial<ClipEdit>) => void;
}) {
    if (!words.length) return null;
    function click(k: number) {
        const b = wordBounds(words, k, k);
        if (edge === "start" && b.startMs < item.endMs - CLIP_MIN_MS) onEnds({ startMs: b.startMs });
        if (edge === "end" && b.endMs > item.startMs + CLIP_MIN_MS) onEnds({ endMs: b.endMs });
    }
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">{label}: click a word to move the clip&apos;s {edge} there</span>
            <div className="text-sm leading-relaxed max-h-40 overflow-y-auto bg-black/30 border border-studio-hairline rounded-lg p-2">
                {words.map((w, k) => {
                    const inside = w.start >= item.startMs - 50 && w.start < item.endMs;
                    return (
                        <span key={k}>
                            <button onClick={() => click(k)} className={`rounded px-0.5 hover:bg-amber-500/30 ${inside ? "text-gray-100 bg-amber-500/10" : "text-gray-500"}`}>
                                {w.text}
                            </button>{" "}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
