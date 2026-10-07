"use client";

// Why: the whole video in the Studio editor (spec 020 item E10): the "In this episode" teasers, the intro, the edited
// episode and the outro, played in the preview in that order, and (item E14) clips on the timeline's V1
// (components/studio/timeline.tsx), where the playhead follows the second video through them. The teasers are
// stretches of the recording and the intro and outro are files of their own, so they play on a second video laid over
// the editor's (ProgrammePlayer); the editor's own video plays only the episode, as before, and the outro follows its
// last kept stretch. What plays is what the render makes (lib/programme.ts): the same teasers, intro and outro, in the
// same order. Transitions between them are drawn as the render joins them but play as straight cuts here.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { EpisodeEdit, KeptRange } from '@/lib/edit';
import { pieceLabel, programmeOf, type Programme, type ProgrammePiece, type Teaser } from '@/lib/programme';
import { sectionJoins, type SectionJoins } from '@/lib/transitions';
import { secondary } from '@/components/studio/ui';

// What the editor's page loaded for the programme: the teasers a new edit gets, and the Studio's intro (also its outro).
export interface ProgrammeSetup { teasers: Teaser[]; studioIntro: { name: string; url: string } | null }

// Which piece the second video is playing (null: none; the editor's video has the episode), shared by the player and
// the timeline (its V1 clips and playhead, item E14) without redrawing the editor. The player puts its play and pause in.
interface Handlers {
    play: (piece: number, ms: number, playing: boolean) => void;
    toggle: () => boolean;
    stop: () => void;
    position: () => { piece: number; ms: number } | null;
}

export class ProgrammeControl {
    private current: number | null = null;
    private listeners = new Set<() => void>();
    private handlers: Handlers | null = null;
    subscribe = (f: () => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
    get = () => this.current;
    set(piece: number | null) {
        if (piece === this.current) return;
        this.current = piece;
        this.listeners.forEach(f => f());
    }
    // The player's own play, pause and stop; returns the call that takes them away again.
    attach(h: Handlers) {
        this.handlers = h;
        return () => { if (this.handlers === h) this.handlers = null; };
    }
    // Plays the programme from a piece (its index in the pieces).
    play(piece: number) { this.handlers?.play(piece, 0, true); }
    // Item E14: shows a piece `ms` into it, paused (a click or a scrub on the timeline), or playing from there.
    cue(piece: number, ms: number, playing = false) { this.handlers?.play(piece, ms, playing); }
    // Which piece the second video shows and how far into it it is; null when it shows none.
    position(): { piece: number; ms: number } | null { return this.handlers?.position() ?? null; }
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
    tag?: boolean;               // a teaser's "In this episode" tag (item E14: it can be taken off)
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
    // The episode's own, none (false, item E14), or the Studio's.
    const intro = useMemo(() => edit.intro === false ? null : edit.intro ? { name: edit.intro.name, url: urls[edit.intro.path] ?? null } : setup?.studioIntro ?? null,
        [edit.intro, urls, setup?.studioIntro]);
    const outro = useMemo(() => edit.outro === false ? null : edit.outro ? { name: edit.outro.name, url: urls[edit.outro.path] ?? null } : setup?.studioIntro ?? null,
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
                return { ...p, label, name: t.speaker, src, fromMs: t.startMs, toMs: t.endMs, speaker: t.speaker, tag: t.tag !== false };
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
        // From `ms` into piece `from`, playing or paused there (item E14: a click on the timeline).
        const play = (from: number, ms = 0, playing = true) => {
            // A file with no link (its link expired, or it was removed) is passed over.
            let k = from;
            while (pieces[k] && pieces[k].kind !== 'episode' && !pieces[k].src) { k++; ms = 0; }
            const piece = pieces[k];
            if (!piece) { stop(); return; }
            if (piece.kind === 'episode') {
                stop();
                if (ranges[0]) { main.currentTime = ranges[0].startMs / 1000; if (playing) void main.play().catch(() => {}); }
                return;
            }
            const mine = ++run;
            cancelAnimationFrame(raf);
            main.pause();
            control.set(k);
            const start = () => {
                if (mine !== run) return;
                const end = Number.isFinite(piece.toMs) ? piece.toMs : (Number.isFinite(o.duration) ? o.duration * 1000 : Infinity);
                o.currentTime = Math.max(piece.fromMs, Math.min(end - 1, piece.fromMs + ms)) / 1000;
                if (playing) void o.play().catch(() => {}); else o.pause();
                follow(k, mine);
            };
            if (o.getAttribute('src') !== piece.src) {
                // A file that cannot be played (an expired link, a format this browser lacks) is passed over.
                const failed = () => { if (mine === run) play(k + 1, 0, playing); };
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
            position: () => {
                const k = control.get();
                return k === null || !pieces[k] ? null : { piece: k, ms: Math.max(0, o.currentTime * 1000 - pieces[k].fromMs) };
            },
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
            {piece?.kind === 'teaser' && piece.tag !== false && (
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
