"use client";

// Why: the whole video in the Studio editor (spec 020 item E10): the "In this episode" teasers, the intro, the edited
// episode and the outro as clips on the timeline's Programme row, played in the preview in that order. The teasers are
// stretches of the recording and the intro and outro are files of their own, so they play on a second video laid over
// the editor's (ProgrammePlayer); the editor's own video plays only the episode, as before, and the outro follows its
// last kept stretch. What plays is what the render makes (lib/programme.ts): the same teasers, intro and outro, in the
// same order. Transitions between them are drawn as the render joins them but play as straight cuts here.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { EpisodeEdit, KeptRange } from '@/lib/edit';
import { moveTeaser, pieceLabel, programmeOf, trimTeaser, type Programme, type ProgrammePiece, type Teaser } from '@/lib/programme';
import { preciseTime } from '@/lib/timeline';
import { sectionJoins, type SectionJoins } from '@/lib/transitions';
import { timelineTime, type Clip } from '@/lib/sequence';
import { mmss } from '@/lib/showNotes';
import { secondary } from '@/components/studio/ui';
import { useVideoTime } from '@/components/studio/useVideoTime';
import { HEADER_W } from '@/components/studio/timeline';

// What the editor's page loaded for the programme: the teasers a new edit gets, and the Studio's intro (also its outro).
export interface ProgrammeSetup { teasers: Teaser[]; studioIntro: { name: string; url: string } | null }

// Which piece the second video is playing (null: none; the editor's video has the episode), shared by the player and
// the timeline's Programme row without redrawing the editor. The player puts its play and pause in.
export class ProgrammeControl {
    private current: number | null = null;
    private listeners = new Set<() => void>();
    private handlers: { play: (piece: number) => void; toggle: () => boolean; stop: () => void } | null = null;
    subscribe = (f: () => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
    get = () => this.current;
    set(piece: number | null) {
        if (piece === this.current) return;
        this.current = piece;
        this.listeners.forEach(f => f());
    }
    // The player's own play, pause and stop; returns the call that takes them away again.
    attach(h: { play: (piece: number) => void; toggle: () => boolean; stop: () => void }) {
        this.handlers = h;
        return () => { if (this.handlers === h) this.handlers = null; };
    }
    // Plays the programme from a piece (its index in the pieces).
    play(piece: number) { this.handlers?.play(piece); }
    // Space: pauses or plays the piece playing on the second video; false when there is none.
    toggle(): boolean { return this.handlers?.toggle() ?? false; }
    // Closes the second video, back to the episode.
    stop() { this.handlers?.stop(); }
}

// A piece as the editor plays it: what it shows and from where to where.
export interface ShownPiece extends ProgrammePiece {
    label: string;
    name: string;
    src: string | null;          // null: the episode (the editor's video), or a file with no link
    fromMs: number;
    toMs: number;                // Infinity: to the file's end
    speaker?: string;
}

export interface ProgrammeView {
    pieces: ShownPiece[];
    programme: Programme;
    teasers: Teaser[];
    control: ProgrammeControl;
}

// A media file's length, read from its metadata (null until known, or when it cannot be read).
function useMediaLength(url: string | null): number | null {
    const [known, setKnown] = useState<{ url: string; ms: number | null } | null>(null);
    useEffect(() => {
        if (!url) return;
        const v = document.createElement('video');
        v.preload = 'metadata';
        let gone = false;
        v.onloadedmetadata = () => { if (!gone) setKnown({ url, ms: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : null }); };
        v.onerror = () => { if (!gone) setKnown({ url, ms: null }); };
        v.src = url;
        return () => { gone = true; v.removeAttribute('src'); v.load(); };
    }, [url]);
    return url && known?.url === url ? known.ms : null;
}

// The programme for an edit: its teasers (or, for an edit saved before it had them, the ones the notes give), its own
// intro and outro or the Studio's, and the transitions between them (its own or the Studio's).
export function useProgramme({ setup, edit, urls, studioJoins, src, editedMs }: {
    setup: ProgrammeSetup | null; edit: EpisodeEdit; urls: Record<string, string>; studioJoins: SectionJoins | null; src: string; editedMs: number;
}): ProgrammeView | null {
    const [control] = useState(() => new ProgrammeControl());
    const intro = useMemo(() => edit.intro ? { name: edit.intro.name, url: urls[edit.intro.path] ?? null } : setup?.studioIntro ?? null,
        [edit.intro, urls, setup?.studioIntro]);
    const outro = useMemo(() => edit.outro ? { name: edit.outro.name, url: urls[edit.outro.path] ?? null } : setup?.studioIntro ?? null,
        [edit.outro, urls, setup?.studioIntro]);
    const introMs = useMediaLength(intro?.url ?? null);
    const outroMs = useMediaLength(outro?.url ?? null);
    const teasers = useMemo(() => edit.teasers ?? setup?.teasers ?? [], [edit.teasers, setup?.teasers]);
    const sections = useMemo(() => sectionJoins(edit.joins, studioJoins ?? undefined), [edit.joins, studioJoins]);
    return useMemo(() => {
        if (!setup) return null;
        const programme = programmeOf({
            teasers: teasers.map(t => t.endMs - t.startMs),
            introMs: intro ? introMs ?? 0 : null,
            outroMs: outro ? outroMs ?? 0 : null,
            episodeMs: editedMs,
            sections,
        });
        const pieces = programme.pieces.map((p): ShownPiece => {
            const label = pieceLabel(p);
            if (p.kind === 'teaser') {
                const t = teasers[p.index];
                return { ...p, label, name: t.speaker, src, fromMs: t.startMs, toMs: t.endMs, speaker: t.speaker };
            }
            const file = p.kind === 'intro' ? intro : p.kind === 'outro' ? outro : null;
            return { ...p, label, name: file?.name ?? 'The edited episode', src: file?.url ?? null, fromMs: 0, toMs: Infinity };
        });
        return { pieces, programme, teasers, control };
    }, [setup, teasers, intro, outro, introMs, outroMs, editedMs, sections, src, control]);
}

// The second video, over the editor's: it plays the teasers, intro and outro, then hands the episode to the editor's
// video, which hands back for the outro once it plays past its last kept stretch (`ranges`, in play order). `hold`:
// a Hear it preview is playing, which plays on. `active`: the preview plays the edit (not the original).
export function ProgrammePlayer({ view, video, ranges, hold, active }: {
    view: ProgrammeView;
    video: React.RefObject<HTMLVideoElement | null>;
    ranges: KeptRange[];
    hold: React.RefObject<{ endMs: number } | null>;
    active: boolean;
}) {
    const { control, pieces } = view;
    const current = useSyncExternalStore(control.subscribe, control.get, () => null);
    const overlay = useRef<HTMLVideoElement>(null);
    const [paused, setPaused] = useState(true);

    // Playing a piece, moving on at its end (a teaser's stretch, or the file's end), handing the episode to the
    // editor's video, and taking the outro back from it once it plays past its last kept stretch. Moving the
    // editor's video by hand while a piece shows closes the piece.
    useEffect(() => {
        const o = overlay.current, main = video.current;
        if (!o || !main) return;
        let run = 0, raf = 0, mainRaf = 0;
        const stop = () => {
            run++;
            cancelAnimationFrame(raf);
            o.pause();
            control.set(null);
        };
        // On to the next piece at the end of piece k.
        const follow = (k: number, mine: number) => {
            const tick = () => {
                if (mine !== run) return;
                if (!o.paused && o.currentTime * 1000 >= (pieces[k]?.toMs ?? 0)) { play(k + 1); return; }
                raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
        };
        const play = (from: number) => {
            // A file with no link (its link expired, or it was removed) is passed over.
            let k = from;
            while (pieces[k] && pieces[k].kind !== 'episode' && !pieces[k].src) k++;
            const piece = pieces[k];
            if (!piece) { stop(); return; }
            if (piece.kind === 'episode') {
                stop();
                if (ranges[0]) { main.currentTime = ranges[0].startMs / 1000; void main.play().catch(() => {}); }
                return;
            }
            const mine = ++run;
            cancelAnimationFrame(raf);
            main.pause();
            control.set(k);
            const start = () => {
                if (mine !== run) return;
                o.currentTime = piece.fromMs / 1000;
                void o.play().catch(() => {});
                follow(k, mine);
            };
            if (o.getAttribute('src') !== piece.src) {
                // A file that cannot be played (an expired link, a format this browser lacks) is passed over.
                const failed = () => { if (mine === run) play(k + 1); };
                o.addEventListener('loadedmetadata', () => { o.removeEventListener('error', failed); start(); }, { once: true });
                o.addEventListener('error', failed, { once: true });
                o.src = piece.src!;
                o.load();
            } else start();
        };
        const onEnded = () => { const k = control.get(); if (k !== null) play(k + 1); };
        const last = ranges[ranges.length - 1];
        const outro = pieces.findIndex(p => p.kind === 'outro');
        const watch = () => {
            if (!main.paused && control.get() === null && active && !hold.current && last && outro >= 0) {
                const t = main.currentTime * 1000;
                if (t >= last.endMs && t < last.endMs + 500) { play(outro); return; }
            }
            mainRaf = requestAnimationFrame(watch);
        };
        const onMainPlay = () => {
            if (control.get() !== null) stop();
            cancelAnimationFrame(mainRaf);
            mainRaf = requestAnimationFrame(watch);
        };
        const onMainPause = () => cancelAnimationFrame(mainRaf);
        const onMainSeek = () => { if (control.get() !== null) stop(); };
        // The recording's own end can be the episode's: the video stops there before the watch sees it.
        const onMainEnded = () => {
            if (control.get() === null && active && !hold.current && last && outro >= 0 && main.currentTime * 1000 >= last.endMs - 50) play(outro);
        };
        if (!main.paused) mainRaf = requestAnimationFrame(watch);
        o.addEventListener('ended', onEnded);
        main.addEventListener('play', onMainPlay);
        main.addEventListener('pause', onMainPause);
        main.addEventListener('seeking', onMainSeek);
        main.addEventListener('ended', onMainEnded);
        const detach = control.attach({
            play,
            stop,
            toggle: () => {
                if (control.get() === null) return false;
                if (o.paused) void o.play().catch(() => {}); else o.pause();
                return true;
            },
        });
        // A piece playing while the edit changed plays on.
        const playing = control.get();
        if (playing !== null) follow(playing, ++run);
        return () => {
            detach();
            run++;
            cancelAnimationFrame(raf);
            cancelAnimationFrame(mainRaf);
            o.removeEventListener('ended', onEnded);
            main.removeEventListener('play', onMainPlay);
            main.removeEventListener('pause', onMainPause);
            main.removeEventListener('seeking', onMainSeek);
            main.removeEventListener('ended', onMainEnded);
        };
    }, [control, pieces, video, ranges, active, hold]);

    const piece = current !== null ? pieces[current] : null;
    const teasers = pieces.filter(p => p.kind === 'teaser').length;
    return (
        <div className={`absolute inset-0 z-20 rounded-lg bg-black ${piece ? '' : 'hidden'}`}>
            <video ref={overlay} playsInline preload="auto" className="w-full h-full rounded-lg"
                onPlay={() => setPaused(false)} onPause={() => setPaused(true)} aria-label="The teasers, intro and outro" />
            {/* The "In this episode" tag the render burns into each teaser (agent/src/podcast/teaserBanner.ts), drawn here. */}
            {piece?.kind === 'teaser' && (
                <div aria-hidden className="absolute pointer-events-none" style={{ left: '4.2cqw', bottom: '4.7cqw' }}>
                    <div className="flex" style={{ background: 'rgba(42,21,82,0.8)' }}>
                        <span style={{ width: '0.42cqw', background: '#e9b949' }} />
                        <span className="flex flex-col" style={{ padding: '0.9cqw 2.1cqw' }}>
                            <span style={{ color: '#e9b949', fontWeight: 900, fontSize: '2.3cqw', letterSpacing: '0.3cqw', lineHeight: 1.1 }}>IN THIS EPISODE</span>
                            {piece.speaker && <span style={{ color: 'white', fontWeight: 600, fontSize: '2cqw', lineHeight: 1.3 }}>{piece.speaker}</span>}
                        </span>
                    </div>
                </div>
            )}
            {piece && (
                <div className="absolute top-2 left-2 right-2 flex items-center gap-2 text-xs">
                    <span className="rounded bg-black/70 px-2 py-0.5 text-amber-200">
                        {piece.kind === 'teaser' ? `Teaser ${piece.index + 1} of ${teasers}` : piece.label}{piece.kind !== 'teaser' && piece.name ? `: ${piece.name}` : ''}
                    </span>
                    <span className="grow" />
                    <button type="button" onClick={() => control.toggle()} className={`${secondary} px-2 py-0.5 bg-black/70`}
                        aria-label={paused ? 'Play' : 'Pause'} title="Space">{paused ? '▶' : '❚❚'}</button>
                    <button type="button" onClick={() => control.play(current! + 1)} className={`${secondary} px-2 py-0.5 bg-black/70`}
                        title="Skip to the next part of the video">Skip ›</button>
                    <button type="button" onClick={() => control.stop()} className={`${secondary} px-2 py-0.5 bg-black/70`}
                        aria-label="Close" title="Back to the episode">×</button>
                </div>
            )}
        </div>
    );
}

// The timeline's Programme row: the teasers, the intro, the episode and the outro, in order, each a clip to click and
// play; a teaser can be taken out (× on it). The episode fills the rest of the row, with how far the preview is into it.
export function ProgrammeStrip({ view, video, clips, editedMs, onTeasers, onParts }: {
    view: ProgrammeView;
    video: React.RefObject<HTMLVideoElement | null>;
    clips: Clip[];
    editedMs: number;
    onTeasers?: (teasers: Teaser[]) => void;
    onParts?: () => void;
}) {
    const { pieces, programme, teasers, control } = view;
    const current = useSyncExternalStore(control.subscribe, control.get, () => null);
    const extras = pieces.length > 1;
    // Item E12: the teaser chosen for trimming (its play position), and the one being dragged to a new place.
    const [picked, setPicked] = useState<number | null>(null);
    const [dragFrom, setDragFrom] = useState<number | null>(null);
    const [dropOn, setDropOn] = useState<number | null>(null);
    const chosen = picked !== null && picked < teasers.length ? picked : null;
    return (
        <div className="flex flex-col gap-1 shrink-0">
        <div className="flex items-stretch h-7 text-[11px] shrink-0" aria-label="Programme: the whole video in order">
            <div style={{ width: HEADER_W }} className="shrink-0 flex items-center gap-1 pr-2 text-gray-300">
                <span className="grow truncate" title={`The whole video, ${mmss(programme.lengthMs)}: teasers, intro, episode and outro, as the render makes it`}>Programme</span>
                <button type="button" onClick={() => control.play(0)} title={`Play the whole video from the start (${mmss(programme.lengthMs)})`}
                    aria-label="Play the whole video from the start" className="px-1 rounded text-amber-300 hover:bg-white/10">▶</button>
            </div>
            <div className="flex-1 min-w-0 flex items-stretch gap-0.5">
                {pieces.map((p, k) => {
                    const playing = current === k;
                    const join = p.joinMs ? ` (the transition into it overlaps ${(p.joinMs / 1000).toFixed(1)} s in the render)` : '';
                    if (p.kind === 'episode') {
                        return (
                            <button key="episode" type="button" onClick={() => control.play(k)}
                                title={`The edited episode, ${mmss(editedMs)}: play it from its start${join}`}
                                className="relative flex-1 min-w-[80px] rounded-sm bg-sky-400/25 hover:bg-sky-400/35 text-left px-2 text-sky-100 overflow-hidden">
                                <EpisodeProgress video={video} clips={clips} editedMs={editedMs} />
                                <span className="relative">Episode {mmss(editedMs)}</span>
                                {!extras && <span className="relative ml-2 text-gray-400">No teasers, intro or outro (the Studio settings)</span>}
                            </button>
                        );
                    }
                    const teaser = p.kind === 'teaser' ? teasers[p.index] : null;
                    const color = p.kind === 'teaser' ? 'bg-amber-400/80 text-black' : 'bg-violet-400/80 text-black';
                    return (
                        <div key={`${p.kind}-${p.index}`}
                            className={`relative shrink-0 w-[92px] rounded-sm ${color} ${playing ? 'ring-2 ring-white' : teaser && chosen === p.index ? 'ring-2 ring-amber-200' : ''} ${p.src ? '' : 'opacity-50'} ${teaser && dropOn === p.index && dragFrom !== p.index ? 'outline outline-2 outline-white' : ''}`}
                            // A teaser can be dragged onto another to take its place (item E12).
                            draggable={!!teaser && !!onTeasers}
                            onDragStart={teaser ? e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.index)); setDragFrom(p.index); } : undefined}
                            onDragOver={teaser && dragFrom !== null ? e => { e.preventDefault(); setDropOn(p.index); } : undefined}
                            onDragLeave={teaser ? () => setDropOn(d => (d === p.index ? null : d)) : undefined}
                            onDrop={teaser && dragFrom !== null ? e => {
                                e.preventDefault();
                                onTeasers?.(moveTeaser(teasers, dragFrom, p.index));
                                setPicked(p.index);
                                setDragFrom(null); setDropOn(null);
                            } : undefined}
                            onDragEnd={() => { setDragFrom(null); setDropOn(null); }}>
                            <button type="button" onClick={() => { if (teaser) setPicked(p.index); control.play(k); }} className="w-full h-full text-left px-1.5 truncate"
                                title={teaser
                                    ? `${p.label}: ${teaser.speaker} at ${mmss(teaser.startMs)}–${mmss(teaser.endMs)} of the recording (${((teaser.endMs - teaser.startMs) / 1000).toFixed(1)} s). Click to play and trim it; drag it onto another teaser to swap places${join}`
                                    : `${p.label}: ${p.name}${p.lengthMs ? ` (${(p.lengthMs / 1000).toFixed(1)} s)` : ''}${p.src ? '. Click to play' : '. Its file cannot be played'}${join}. Change it in the Parts panel`}>
                                {p.kind === 'teaser' ? `T${p.index + 1} ${(p.lengthMs / 1000).toFixed(0)}s` : p.label}
                            </button>
                            {teaser && onTeasers && (
                                <button type="button" aria-label={`Take out ${p.label}`} title={`Take ${p.label} out of the video (Undo puts it back)`}
                                    onClick={() => { onTeasers(teasers.filter((_, i) => i !== p.index)); setPicked(null); }}
                                    className="absolute right-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-black/60 text-white text-[9px] leading-[14px] text-center hover:bg-black">×</button>
                            )}
                            {p.kind !== 'teaser' && onParts && (
                                <button type="button" aria-label={`Change the ${p.label.toLowerCase()}`} title="Change it in the Parts panel"
                                    onClick={onParts}
                                    className="absolute right-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-black/60 text-white text-[9px] leading-[14px] text-center hover:bg-black">⋯</button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
        {chosen !== null && onTeasers && (
            <TeaserTrim teasers={teasers} index={chosen} video={video} onTeasers={onTeasers} onClose={() => setPicked(null)}
                onPlay={() => control.play(pieces.findIndex(p => p.kind === 'teaser' && p.index === chosen))} onPicked={setPicked} />
        )}
        </div>
    );
}

// Item E12: the chosen teaser's start and end, moved half a second at a time or to the playhead (the moment of the
// recording the preview is at: find it in the script or on the timeline), and its place among the teasers.
function TeaserTrim({ teasers, index, video, onTeasers, onClose, onPlay, onPicked }: {
    teasers: Teaser[]; index: number; video: React.RefObject<HTMLVideoElement | null>;
    onTeasers: (teasers: Teaser[]) => void; onClose: () => void; onPlay: () => void; onPicked: (i: number) => void;
}) {
    const t = teasers[index];
    const playhead = useVideoTime(video);
    const length = () => (video.current && Number.isFinite(video.current.duration) ? video.current.duration * 1000 : undefined);
    const set = (edge: 'start' | 'end', ms: number) => onTeasers(trimTeaser(teasers, index, edge, ms, length()));
    const move = (to: number) => { onTeasers(moveTeaser(teasers, index, to)); onPicked(to); };
    const btn = `${secondary} px-1.5 py-0.5 shrink-0`;
    return (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-gray-300 rounded bg-amber-400/5 border border-amber-400/20 px-2 py-1" aria-label={`Trim teaser ${index + 1}`}>
            <span className="text-amber-200 shrink-0">Teaser {index + 1} of {teasers.length}{t.speaker ? ` · ${t.speaker}` : ''} · {preciseTime(t.startMs)}–{preciseTime(t.endMs)} ({((t.endMs - t.startMs) / 1000).toFixed(1)} s)</span>
            <span className="ml-2 shrink-0">Start</span>
            <button type="button" className={btn} onClick={() => set('start', t.startMs - 500)} title="Start half a second earlier">−½ s</button>
            <button type="button" className={btn} onClick={() => set('start', t.startMs + 500)} title="Start half a second later">+½ s</button>
            <button type="button" className={btn} onClick={() => set('start', playhead)} title={`Start at the playhead, ${preciseTime(playhead)} of the recording`}>Start here</button>
            <span className="ml-2 shrink-0">End</span>
            <button type="button" className={btn} onClick={() => set('end', t.endMs - 500)} title="End half a second earlier">−½ s</button>
            <button type="button" className={btn} onClick={() => set('end', t.endMs + 500)} title="End half a second later">+½ s</button>
            <button type="button" className={btn} onClick={() => set('end', playhead)} title={`End at the playhead, ${preciseTime(playhead)} of the recording`}>End here</button>
            <span className="ml-2 shrink-0">Place</span>
            <button type="button" className={btn} disabled={index === 0} onClick={() => move(index - 1)} aria-label="Play it earlier" title="Earlier among the teasers">‹</button>
            <button type="button" className={btn} disabled={index === teasers.length - 1} onClick={() => move(index + 1)} aria-label="Play it later" title="Later among the teasers">›</button>
            <button type="button" className={`${btn} ml-2`} onClick={onPlay}>▶ Play it</button>
            <button type="button" className={btn} onClick={onClose} aria-label="Close the teaser's trim" title="Close">×</button>
        </div>
    );
}

// How far the preview is into the edited episode, as a bar along the episode's clip.
function EpisodeProgress({ video, clips, editedMs }: { video: React.RefObject<HTMLVideoElement | null>; clips: Clip[]; editedMs: number }) {
    const ms = useVideoTime(video);
    const at = timelineTime(clips, ms, true) ?? 0;
    const share = editedMs > 0 ? Math.min(1, Math.max(0, at / editedMs)) : 0;
    return <span aria-hidden className="absolute inset-y-0 left-0 bg-sky-400/30 pointer-events-none" style={{ width: `${share * 100}%` }} />;
}
