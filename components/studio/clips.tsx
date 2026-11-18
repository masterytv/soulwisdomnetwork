"use client";

// Clips on the show notes page (docs/specs/025-clips.md): 5 to 15 minute stretches of the final cut, each about
// one topic, for posting on YouTube beside the Shorts. The chapters are offered as clips (one, or joined with the
// next), and Claude suggests topics on request; the producer can also mark their own on the player. Each clip's
// ends move by clicking a word near them; its title, description, thumbnail title and the feeling its thumbnail
// shows are typed here or written by Claude. Edits save as they go. Make clips cuts them from the final cut; Find
// thumbnail moments finds the main speaker's most expressive moments that fit each title, and the "Soul Wisdom Clips"
// thumbnail is drawn here from one of them (ClipThumb) and saved; each made clip is approved at Checkpoint F.
// Scheduling on YouTube is stage 4.

import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { ago } from "@/components/studio/format";
import { useAutosave } from "@/components/studio/useAutosave";
import { approveButton, chosen, primary, secondary } from "@/components/studio/ui";
import { CLIP_DIRECTION_MAX, isTakenClip, suggestionToClip, type ClipSuggestion } from "@/lib/clipPicks";
import {
    canMake, chapterClip, CLIP_DESCRIPTION_MAX, CLIP_FEELINGS, CLIP_MIN_MS, CLIP_TITLE_MAX, clipLength, clipRenderInputs, hasChapterClip, MAX_CLIPS,
    MAX_FEELINGS, sameClipRender, THUMB_TEXT_MAX, withClipDefaults, CLIP_DEFAULT_HOUR, type ClipEdit, type ClipFeeling, type ClipLength,
} from "@/lib/clips";
import { momentInputs, sameMoments } from "@/lib/clipThumbs";
import { slotAt, suggestedFirstSlot } from "@/lib/publishing";
import { ClipThumb, useBrand } from "@/components/studio/clipThumb";
import { mmss } from "@/lib/showNotes";
import { wordBounds } from "@/lib/shorts";
import { studioFetch } from "@/lib/studioClient";
import type { TimedWord } from "@/lib/retime";
import type { ClipItemView, ClipsView } from "@/types/studio";

const input = "bg-black/30 border border-studio-line rounded-lg px-3 py-1.5 text-sm text-white w-full";

const pick = (i: ClipEdit): ClipEdit => ({
    id: i.id, source: i.source, startMs: i.startMs, endMs: i.endMs, title: i.title, description: i.description,
    thumbText: i.thumbText, thumbFeeling: i.thumbFeeling, thumbSpeaker: i.thumbSpeaker, thumbMoment: i.thumbMoment,
    thumbBackground: i.thumbBackground, synthetic: i.synthetic,
});

const WORKING: Record<string, string> = {
    pick: "Suggesting clips…", titles: "Writing titles and descriptions…", render: "Making the clips…", moments: "Finding thumbnail moments…",
    upload: "Scheduling on YouTube…",
};
const needsTexts = (i: ClipEdit) => !i.title.trim() || !i.description.trim() || !i.thumbText.trim() || !i.thumbFeeling.length;

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

// <input type="datetime-local"> works in the browser's own time zone.
function localInput(ms: number) {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const whenLocal = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Clips({ episodeId, enabled }: { episodeId: string; enabled: boolean }) {
    const [view, setView] = useState<ClipsView | null>(null);
    const [items, setItems] = useState<ClipEdit[]>([]);
    const [error, setError] = useState("");
    // Signed links change on every load; keep the first so a playing video is not reset.
    const [finalUrl, setFinalUrl] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState<string | null>(null);
    // The start of a clip being marked on the player, until its end is marked.
    const [marking, setMarking] = useState<number | null>(null);
    const [starting, setStarting] = useState(false);
    // When the first clip of a batch goes out, as the <input type="datetime-local"> holds it.
    const [firstAt, setFirstAt] = useState("");
    // The producer's direction for Claude's suggestions; null until loaded, then set once from the view.
    const [direction, setDirection] = useState<string | null>(null);
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
        setDirection(value => value ?? next.direction);
        setFirstAt(value => value || localInput(suggestedFirstSlot(next.lastSlot, next.everyDays, CLIP_DEFAULT_HOUR)));
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

    // While a job runs, the page asks again every 10 seconds; the last answer brings its results.
    const working = view?.status === "queued" || view?.status === "working";
    useEffect(() => {
        if (!working) return;
        const timer = setInterval(() => void load(), 10_000);
        return () => clearInterval(timer);
    }, [working, load]);

    async function start(mode: "pick" | "titles" | "render" | "moments" | "upload", hand?: { clip: string; atMs: number }) {
        setStarting(true);
        try {
            if (!(await flush())) throw new Error("Your changes could not be saved; fix that first");
            const body = mode === "pick" ? { mode, direction: direction ?? "" } : hand ? { mode, ...hand }
                : mode === "upload" ? { mode, firstAt: new Date(firstAt).getTime(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : { mode };
            await studioFetch(base, { method: "POST", body: JSON.stringify(body) });
            await load();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStarting(false);
        }
    }

    async function approve(id: string, approved: boolean) {
        try {
            await studioFetch(base, { method: "POST", body: JSON.stringify({ approve: id, approved }) });
            await load();
        } catch (e) {
            setError((e as Error).message);
        }
    }

    function addSuggestion(s: ClipSuggestion) {
        void commit([...items, suggestionToClip(s, newId())]);
    }

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
        void commit([...items, { id: newId(), source: { kind: "own" }, startMs: marking, endMs, ...withClipDefaults({ title: "", description: "", thumbText: "" }), synthetic: false }]);
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
    const needText = items.filter(i => needsTexts(i) && !byId.get(i.id)?.youtube).length;
    const finalAt = view?.finalAt ?? 0;
    const made = (i: ClipEdit) => sameClipRender(byId.get(i.id)?.render?.inputs, clipRenderInputs(i, finalAt));
    const onYoutube = (i: ClipEdit) => !!byId.get(i.id)?.youtube;
    const toMake = items.filter(i => !onYoutube(i) && !made(i) && canMake(i.endMs - i.startMs)).length;
    const toFind = items.filter(i => !onYoutube(i) && i.thumbText.trim() && !sameMoments(byId.get(i.id)?.moments?.inputs, momentInputs(i, finalAt))).length;
    const brand = useBrand();
    const waiting = items.filter(i => {
        const v = byId.get(i.id);
        return v && !v.youtube && v.approved && made(i) && v.thumbnail;
    });
    const firstMs = firstAt ? new Date(firstAt).getTime() : NaN;
    const everyDays = view?.everyDays ?? 2;
    // The Shorts going out on the same day as a slot, since both share YouTube's daily upload quota.
    const shortsThatDay = (ms: number) => (view?.shortsSlots ?? []).filter(at => new Date(at).toDateString() === new Date(ms).toDateString()).length;

    if (!view) return <ErrorNote message={error} />;
    if (view.blocker) return <p className="text-xs text-gray-400">{view.blocker}</p>;

    return (
        <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-400">
                Add a chapter as a clip, join it with the next, add one of Claude&apos;s suggestions, or mark your own on the player.
                5 to 15 minutes about one topic is the aim. Click a word near either end to move that end there. Making the clips
                and scheduling them on YouTube come next.
                <span className="ml-2">
                    {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved" : saveState === "error" ? "" : items.length ? "Saved" : ""}
                </span>
            </p>
            <ErrorNote title="Your changes were not saved" message={saveError} />
            {view.status === "failed" && <ErrorNote title="The clips job failed" message={view.error} />}
            {view.warnings.map(w => <p key={w} className="text-xs text-amber-300">{w}</p>)}
            <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => start("titles")} disabled={working || starting || !needText} className={secondary}
                    title="Claude writes the title, description, thumbnail title and feeling of each clip missing any; clear a field to have it rewritten">
                    {working && view.job === "titles" ? WORKING.titles : `Write titles and descriptions${needText ? ` (${needText})` : ""}`}
                </button>
                <button onClick={() => start("render")} disabled={working || starting || !toMake} className={primary}
                    title="Cuts each clip that changed from the final cut, with a half-second fade at each end">
                    {working && view.job === "render" ? WORKING.render : `Make ${toMake || ""} clip${toMake === 1 ? "" : "s"}`.replace("  ", " ")}
                </button>
                <button onClick={() => start("moments")} disabled={working || starting || !toFind} className={secondary}
                    title="For each clip with a thumbnail title: Claude looks at the main speaker's most expressive moments and the best are cut out">
                    {working && view.job === "moments" ? WORKING.moments : `Find thumbnail moments${toFind ? ` (${toFind})` : ""}`}
                </button>
                {working && <span className="text-xs text-sky-300">{WORKING[view.job ?? ""] ?? "Working…"} {view.job === "render" ? "A few minutes a clip; you get an email. " : ""}This page updates by itself.</span>}
                {view.finishedAt && !working && <span className="text-xs text-gray-400">Last job {ago(view.finishedAt)}</span>}
            </div>

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

            <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-300">
                    Claude&apos;s suggestions <span className="text-xs text-gray-400">(topics that stand on their own, best first, each with a score out of 10 and why)</span>
                </p>
                <textarea value={direction ?? ""} maxLength={CLIP_DIRECTION_MAX} rows={2} aria-label="Direction for Claude's suggestions"
                    placeholder="Optional: e.g. favour the personal stories, or keep them under 10 minutes"
                    disabled={working} onChange={e => setDirection(e.target.value)} className={input} />
                <div>
                    <button onClick={() => start("pick")} disabled={working || starting} className={secondary}>
                        {working && view.job === "pick" ? WORKING.pick : view.suggestions.length ? "Suggest clips again" : "Suggest clips"}
                    </button>
                </div>
                {view.suggestions.length > 0 && (
                    <ul className="flex flex-col gap-1 max-h-[32rem] overflow-y-auto pr-1">
                        {view.suggestions.map(s => {
                            const taken = isTakenClip(s, items);
                            const length = clipLength(s.endMs - s.startMs);
                            return (
                                <li key={s.id} className={`flex flex-wrap items-start gap-2 text-xs rounded-lg px-2 py-1.5 ${taken ? "bg-amber-500/10" : "hover:bg-white/5"}`}>
                                    <span className="text-amber-300 font-medium">{s.score}/10</span>
                                    <div className="flex-1 min-w-[12rem]">
                                        <p className="text-gray-200 font-medium">{s.title}</p>
                                        <p className="text-gray-400">
                                            {mmss(s.startMs)}–{mmss(s.endMs)} · <span className={lengthClass(length)}>{minutesOf(s.endMs - s.startMs)}</span>
                                            {!s.standsAlone && <span className="text-amber-300"> · needs what came before</span>}
                                        </p>
                                        <p className="text-gray-300">&ldquo;{s.opening}&rdquo;</p>
                                        <p className="text-gray-400">{s.reason}</p>
                                    </div>
                                    <button onClick={() => preview(s.id, s.startMs, s.endMs)} className={secondary} aria-label={`Preview ${s.title}`}>▶</button>
                                    <button onClick={() => addSuggestion(s)} disabled={taken || full || working} className={secondary}>
                                        {taken ? "Added" : "Add as a clip"}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {items.map((item, n) => (
                <ClipCard key={item.id} n={n} count={items.length} item={item} view={byId.get(item.id)}
                    chapterTitles={item.source.kind === "chapter"
                        ? view.chapters.slice(item.source.index, item.source.index + item.source.count).map(c => c.title) : []}
                    onChange={patch => setItem(item.id, patch)} onEnds={patch => void commit(items.map(i => (i.id === item.id ? { ...i, ...patch } : i)))}
                    onMove={by => move(item.id, by)} onRemove={() => remove(item)} onPreview={() => preview(item.id, item.startMs, item.endMs)}
                    made={made(item)} finalAt={finalAt} working={working || starting} saved={saveState === "saved"}
                    thumb={<ClipThumb episodeId={episodeId} item={item} view={byId.get(item.id)} finalAt={finalAt} brand={brand} working={working || starting}
                        playerMs={() => (player.current ? Math.round(player.current.currentTime * 1000) : null)}
                        onChange={patch => setItem(item.id, patch)} onUseMoment={atMs => start("moments", { clip: item.id, atMs })}
                        onSaved={() => load()} onError={setError} />}
                    onApprove={ok => approve(item.id, ok)} />
            ))}
            {full && <p className="text-xs text-amber-300">{MAX_CLIPS} clips is the most an episode can have.</p>}

            {items.some(i => byId.get(i.id)?.approved || byId.get(i.id)?.youtube) && (
                <div className="border-t border-studio-line pt-4 flex flex-col gap-3">
                    <h4 className="text-sm text-gray-100 font-semibold">Schedule the approved clips on YouTube</h4>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-xs text-gray-400 flex items-center gap-2">
                            First one goes out
                            <input type="datetime-local" value={firstAt} onChange={e => setFirstAt(e.target.value)}
                                className="bg-black/30 border border-studio-line rounded-lg px-2 py-1 text-xs text-gray-200" />
                        </label>
                        <button onClick={() => start("upload")} disabled={working || starting || !waiting.length || !Number.isFinite(firstMs)} className={primary}>
                            {working && view.job === "upload" ? WORKING.upload : `Schedule ${waiting.length || ""} on YouTube`.replace("  ", " ")}
                        </button>
                    </div>
                    {!!waiting.length && Number.isFinite(firstMs) && (
                        <ul className="text-xs text-gray-400 flex flex-col gap-0.5">
                            {waiting.map((i, k) => {
                                const at = slotAt(firstMs, k, everyDays);
                                const shorts = shortsThatDay(at);
                                return (
                                    <li key={i.id}>
                                        {whenLocal(at)}: <span className="text-gray-200">{i.title}</span>
                                        {shorts ? <span className="text-gray-500"> · {shorts} short{shorts === 1 ? "" : "s"} that day</span> : null}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <ul className="text-xs text-gray-400 list-disc pl-5 flex flex-col gap-0.5">
                        <li>
                            {everyDays === 1 ? "One a day" : `One every ${everyDays} days`} (the Studio settings), in the order above, each Private until its time,
                            with its captions, thumbnail and the Clips playlist.{view.lastSlot && view.lastSlot > Date.now() ? ` Clips are already scheduled until ${whenLocal(view.lastSlot)}, so this batch follows on.` : ""}
                        </li>
                        <li>
                            {view.episodeUrl ? "Each links to the full episode in its description."
                                : "The episode is not on YouTube yet, so each clip links to the podcast playlist instead. Upload the episode first to link it directly."}
                        </li>
                        <li>The API cannot set an end screen: add &ldquo;Full episode&rdquo; as each clip&apos;s end screen in YouTube Studio.</li>
                        <li>YouTube allows about six uploads a day, shared with Shorts; if it runs out, the rest keep their slots: press Schedule again the next day.</li>
                    </ul>
                </div>
            )}

            <ErrorNote message={error} />
        </div>
    );
}

function ClipCard({ n, count, item, view, chapterTitles, onChange, onEnds, onMove, onRemove, onPreview, made, working, saved, thumb, onApprove }: {
    n: number; count: number; item: ClipEdit; view: ClipItemView | undefined; chapterTitles: string[];
    onChange: (patch: Partial<ClipEdit>) => void; onEnds: (patch: Partial<ClipEdit>) => void;
    onMove: (by: number) => void; onRemove: () => void; onPreview: () => void;
    made: boolean; finalAt: number; working: boolean; saved: boolean; thumb: React.ReactNode; onApprove: (approved: boolean) => void;
}) {
    const duration = item.endMs - item.startMs;
    const length = clipLength(duration);
    const from = item.source.kind === "chapter" ? `From ${chapterTitles.map(t => `“${t}”`).join(" and ")}`
        : item.source.kind === "pick" ? "Claude's pick" : "Marked by hand";
    // On YouTube: changed or removed in YouTube Studio, not here.
    const locked = !!view?.youtube;

    return (
        <div className="flex flex-col gap-2 bg-black/20 border border-studio-hairline rounded-xl p-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span className="text-gray-200 font-medium">#{n + 1}</span>
                <span>{from}</span>
                <span>{mmss(item.startMs)}–{mmss(item.endMs)}</span>
                <span className={lengthClass(length)}>{minutesOf(duration)}{LENGTH_NOTE[length] ? ` (${LENGTH_NOTE[length]})` : ""}</span>
                <span className="grow" />
                <button onClick={onPreview} className={secondary}>▶ Preview</button>
                {!locked && (
                    <>
                        <button onClick={() => onMove(-1)} disabled={n === 0} className={secondary} title="Earlier in the schedule" aria-label="Move earlier">↑</button>
                        <button onClick={() => onMove(1)} disabled={n === count - 1} className={secondary} title="Later in the schedule" aria-label="Move later">↓</button>
                        <button onClick={onRemove} className={secondary}>Remove</button>
                    </>
                )}
            </div>
            <fieldset disabled={locked} className="contents">
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
            <div className="text-xs text-gray-400 flex flex-col gap-1">
                <span>The thumbnail&apos;s feeling <span className="text-gray-500">(up to {MAX_FEELINGS}: the speaker&apos;s face is chosen to show it)</span></span>
                <div className="flex flex-wrap gap-1.5">
                    {CLIP_FEELINGS.map(f => {
                        const on = item.thumbFeeling.includes(f);
                        const toggle = (): ClipFeeling[] => (on ? item.thumbFeeling.filter(x => x !== f) : [...item.thumbFeeling, f].slice(-MAX_FEELINGS));
                        return (
                            <button key={f} onClick={() => onChange({ thumbFeeling: toggle() })} aria-pressed={on} className={on ? chosen : secondary}>{f}</button>
                        );
                    })}
                </div>
            </div>
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
            <div className="flex flex-col gap-1.5 max-w-xl">
                <span className="text-xs text-gray-400">The clip as made</span>
                {view?.render ? (
                    <video key={view.render.key} src={view.render.url} controls preload="metadata" playsInline
                        className={`w-full aspect-video rounded-lg bg-black ${made ? "" : "opacity-50"}`} />
                ) : (
                    <div className="w-full aspect-video rounded-lg bg-black/40 border border-dashed border-studio-line flex items-center justify-center text-xs text-gray-400">
                        Not made yet: Make clips
                    </div>
                )}
                {view?.render && !made && <p className="text-xs text-amber-300">Changed since it was made; make it again.</p>}
            </div>
            {thumb}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3 text-xs border-t border-studio-hairline pt-2">
                {view?.youtube ? (
                    <div className="flex flex-col gap-1">
                        <p className="text-emerald-300">
                            Scheduled for {whenLocal(view.youtube.publishAt)} · <a href={view.youtube.url} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">On YouTube ↗</a>
                            <span className="text-gray-400"> · change or remove it in YouTube Studio</span>
                        </p>
                        {view.youtube.warnings.map(w => <p key={w} className="text-amber-300">{w}</p>)}
                    </div>
                ) : view?.approved && made ? (
                    <>
                        <p className="text-emerald-300">Approved by {view.approved.by}, {ago(view.approved.at)}</p>
                        <button onClick={() => onApprove(false)} disabled={working} className={secondary}>Withdraw approval</button>
                    </>
                ) : made ? (
                    <button onClick={() => onApprove(true)} disabled={working || !saved || !item.title.trim() || !item.description.trim() || !view?.thumbnail}
                        className={approveButton}>
                        {!item.title.trim() || !item.description.trim() ? "Add a title and description to approve"
                            : !view?.thumbnail ? "Save its thumbnail to approve" : "Approve this clip"}
                    </button>
                ) : (
                    <span className="text-gray-400">Checkpoint F: make the clip, watch it, save its thumbnail, then approve it.</span>
                )}
                {view && !view.youtube && view.publishAt && <span className="text-gray-400">Slot: {whenLocal(view.publishAt)}</span>}
                {view && !view.youtube && <ErrorNote message={view.error} />}
            </div>
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
