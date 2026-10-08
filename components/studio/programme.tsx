"use client";

// Why: the whole video in the Studio editor (spec 020 item E10): the "In this episode" teasers, the intro, the edited
// episode and the outro, played in the preview in that order, and (item E14) clips on the timeline's V1
// (components/studio/timeline.tsx), where the playhead follows the second video through them. The teasers are
// stretches of the recording and the intro and outro are files of their own, so they play on a second video laid over
// the editor's (ProgrammePlayer); the editor's own video plays only the episode, as before, and the outro follows its
// last kept stretch. What plays is what the render makes (lib/programme.ts): the same teasers, intro and outro, in the
// same order. Transitions between them are drawn as the render joins them, and (item E16) play here too: the next piece
// starts on a third video over the end of the one before, drawn for its kind as at the splits (transitionPreview.tsx
// `draw`), the sound crossfading, and the video fades in from black at its start and out at its end when the Studio
// settings or the edit choose a transition there.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { EpisodeEdit, KeptRange } from '@/lib/edit';
import { pieceLabel, playedAt, programmeOf, recordingAt, type Programme, type ProgrammePiece, type Teaser } from '@/lib/programme';
import { sectionJoins, type SectionJoins, type Transition } from '@/lib/transitions';
import { draw } from '@/components/studio/transitionPreview';
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
    ends: { start: Transition; end: Transition };   // the fade in at the video's start and out at its end (item E16)
    episodeSrc: string;                              // the recording, for a transition into the episode
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
        return { pieces, programme, teasers, control, ends: { start: sections.start, end: sections.end }, episodeSrc: src };
    }, [setup, teasers, intro, outro, introMs, outroMs, editedMs, sections, src, control]);
}

// The second video, over the editor's: it plays the teasers, intro and outro, then hands the episode to the editor's
// video, which hands back for the outro once it plays past its last kept stretch (`ranges`, in play order). `hold`:
// a Hear it preview is playing, which plays on. `active`: the preview plays the edit (not the original).
// Item E16: two videos take turns, so a transition into the next piece plays the next one over the end of this one
// (into the episode, the recording plays on the other video until the editor's takes over where the transition ends;
// into the outro, the outro plays over the editor's video); a veil fades the video in from black at its start and out at
// its end. A transition longer than what it joins plays as a cut (lib/programme.ts programmeOf).
export function ProgrammePlayer({ view, video, ranges, hold, active }: {
    view: ProgrammeView;
    video: React.RefObject<HTMLVideoElement | null>;
    ranges: KeptRange[];
    hold: React.RefObject<{ endMs: number } | null>;
    active: boolean;
}) {
    const { control, pieces, ends, episodeSrc } = view;
    const current = useSyncExternalStore(control.subscribe, control.get, () => null);
    const boxRef = useRef<HTMLDivElement>(null);
    const aRef = useRef<HTMLVideoElement>(null);
    const bRef = useRef<HTMLVideoElement>(null);
    const veilRef = useRef<HTMLDivElement>(null);
    // Which of the two videos shows the piece (0: a), kept across changes to the edit so a piece playing plays on.
    const frontRef = useRef<0 | 1>(0);
    const [paused, setPaused] = useState(true);

    useEffect(() => {
        const box = boxRef.current, a = aRef.current, b = bRef.current, veil = veilRef.current, main = video.current;
        if (!box || !a || !b || !veil || !main) return;
        // `cur` plays the piece shown; `other` loads the next one and plays it during a transition into it.
        let cur = frontRef.current ? b : a, other = frontRef.current ? a : b;
        let run = 0, raf = 0, mainRaf = 0;
        let vol = main.volume;
        // A transition under way: out of piece `from` (-1: the editor's video) into piece `to` (the episode: the
        // recording on `other`, then the editor's video).
        let tr: { from: number; to: number; kind: Exclude<ShownPiece['transition'], 'cut'>; dur: number; outStart: number; held: boolean } | null = null;
        let fadeIn: { k: number; dur: number } | null = null;
        const color = (t: Transition) => (t.transition === 'fadeWhite' ? '#fff' : '#000');
        const totalMs = ranges.reduce((n, r) => n + r.endMs - r.startMs, 0);
        const sync = () => setPaused(cur.paused);

        const clean = (el: HTMLVideoElement) => {
            const st = el.style;
            st.opacity = ''; st.clipPath = ''; st.transform = ''; st.filter = ''; st.maskImage = ''; st.webkitMaskImage = ''; st.zIndex = '';
        };
        // Back to one piece showing, no transition drawn.
        const settle = () => {
            clean(a); clean(b);
            main.style.filter = '';
            veil.style.opacity = '0';
            box.style.background = '';
            cur.style.visibility = 'visible';
            other.style.visibility = 'hidden';
            cur.volume = vol; cur.muted = main.muted;
            other.pause();
        };
        const stop = () => {
            run++;
            cancelAnimationFrame(raf);
            if (tr?.from === -1) main.volume = vol;
            tr = null;
            fadeIn = null;
            a.pause(); b.pause();
            settle();
            control.set(null);
        };
        const endOf = (k: number, el: HTMLVideoElement) => {
            const p = pieces[k];
            return Number.isFinite(p.toMs) ? p.toMs : (Number.isFinite(el.duration) ? el.duration * 1000 : Infinity);
        };
        // The piece after k, when a transition plays into it.
        const joinInto = (k: number) => {
            const n = pieces[k + 1];
            if (!n || n.transition === 'cut' || n.joinMs <= 0) return null;
            if (n.kind !== 'episode' && !n.src) return null;
            if (n.kind === 'episode' && !ranges.length) return null;
            return n;
        };
        // Sets `el` to `src` at `ms`, then calls `ready` (with false when it cannot be played).
        const load = (el: HTMLVideoElement, src: string, ms: number, ready: (ok: boolean) => void) => {
            const seek = () => { el.currentTime = ms / 1000; ready(true); };
            if (el.getAttribute('src') !== src) {
                const failed = () => ready(false);
                el.addEventListener('loadedmetadata', () => { el.removeEventListener('error', failed); seek(); }, { once: true });
                el.addEventListener('error', failed, { once: true });
                el.src = src;
                el.load();
            } else if (el.readyState >= 1) seek();
            else el.addEventListener('loadedmetadata', seek, { once: true });
        };
        // The next piece's file loads on the other video while this one plays, so the transition starts without a stall.
        const prepare = (k: number) => {
            const n = joinInto(k);
            const src = n ? (n.kind === 'episode' ? episodeSrc : n.src) : null;
            if (src && other.getAttribute('src') !== src) { other.src = src; other.preload = 'auto'; other.load(); }
        };

        // Draws a transition under way, from how far its outgoing side has played.
        const step = () => {
            if (!tr) return;
            const out = tr.from === -1 ? main : cur;
            const into = tr.from === -1 ? cur : other;
            const at = tr.from === -1 ? playedAt(ranges, main.currentTime * 1000) ?? totalMs : cur.currentTime * 1000;
            const p = Math.min(1, Math.max(0, (at - tr.outStart) / tr.dur));
            draw(tr.kind, p, out, into, veil);
            out.volume = vol * (1 - p);
            into.volume = vol * p;
            const over = p >= 1 || (!tr.held && (tr.from === -1 ? main.paused || main.ended : cur.ended));
            if (over) finish();
        };
        const finish = () => {
            const t = tr;
            if (!t) return;
            tr = null;
            cancelAnimationFrame(raf);
            if (t.from === -1) {
                // Into the outro: the editor's video stops; the outro plays on.
                main.pause();
                main.volume = vol;
                settle();
                const mine = ++run;
                follow(t.to, mine);
                prepare(t.to);
                return;
            }
            cur.pause();
            if (pieces[t.to].kind === 'episode') {
                // The editor's video carries on from where the transition ends.
                const was = other;
                stop();
                was.pause();
                main.volume = vol;
                if (active) void main.play().catch(() => {});
                return;
            }
            [cur, other] = [other, cur];
            frontRef.current = cur === a ? 0 : 1;
            settle();
            control.set(t.to);
            sync();
            const mine = ++run;
            follow(t.to, mine);
            prepare(t.to);
        };
        // Starts the transition out of piece k (on the videos) into the next.
        const beginOut = (k: number) => {
            const n = joinInto(k)!;
            const end = endOf(k, cur);
            const outStart = end - n.joinMs;
            const into = Math.max(0, cur.currentTime * 1000 - outStart);
            vol = cur.volume || vol;
            tr = { from: k, to: k + 1, kind: n.transition as Exclude<ShownPiece['transition'], 'cut'>, dur: n.joinMs, outStart, held: false };
            other.style.visibility = 'visible';
            other.style.opacity = '0';
            cur.style.zIndex = '0'; veil.style.zIndex = '1'; other.style.zIndex = '2';
            other.volume = 0; other.muted = main.muted;
            other.playbackRate = cur.playbackRate;
            const src = n.kind === 'episode' ? episodeSrc : n.src!;
            const from = n.kind === 'episode' ? recordingAt(ranges, into) : n.fromMs + into;
            if (n.kind === 'episode') {
                // The editor's video waits, paused under this one, where the transition will end.
                main.pause();
                main.currentTime = recordingAt(ranges, n.joinMs) / 1000;
            }
            const mine = run;
            load(other, src, from, ok => {
                if (mine !== run || !tr) return;
                if (!ok) { finish(); return; }
                if (!cur.paused) void other.play().catch(() => {});
            });
        };
        // Starts the transition from the editor's video into piece k (the outro), `left` ms before the episode ends.
        const beginIn = (k: number, left: number) => {
            const piece = pieces[k];
            run++;
            cancelAnimationFrame(raf);
            vol = main.volume;
            tr = { from: -1, to: k, kind: piece.transition as Exclude<ShownPiece['transition'], 'cut'>, dur: piece.joinMs, outStart: totalMs - piece.joinMs, held: false };
            control.set(k);
            settle();
            // The editor's video shows through until the outro is drawn over it.
            box.style.background = 'transparent';
            veil.style.zIndex = '1'; cur.style.zIndex = '2';
            cur.style.opacity = '0';
            cur.volume = 0;
            const mine = run;
            load(cur, piece.src!, piece.fromMs + Math.max(0, piece.joinMs - left), ok => {
                if (mine !== run) return;
                if (!ok) { stop(); return; }
                cur.playbackRate = main.playbackRate;
                void cur.play().catch(() => {});
                const tick = () => {
                    if (mine !== run || !tr) return;
                    raf = requestAnimationFrame(tick);
                    step();
                };
                raf = requestAnimationFrame(tick);
            });
        };

        // On through piece k: the fade in at the start, the fade out at the end, a transition into the next piece, or
        // on to it at its end.
        const follow = (k: number, mine: number) => {
            const tick = () => {
                if (mine !== run) return;
                raf = requestAnimationFrame(tick);
                if (tr) { step(); return; }
                const piece = pieces[k];
                if (!piece) return;
                const t = cur.currentTime * 1000;
                const end = endOf(k, cur);
                if (fadeIn && fadeIn.k === k) {
                    const p = (t - piece.fromMs) / fadeIn.dur;
                    if (p >= 1 || p < 0) { veil.style.opacity = '0'; fadeIn = null; }
                    else { veil.style.zIndex = '1'; veil.style.background = color(ends.start); veil.style.opacity = String(1 - p); cur.volume = vol * p; }
                }
                if (k === pieces.length - 1 && ends.end.transition !== 'cut' && Number.isFinite(end)) {
                    const d = Math.min(ends.end.durationMs, end - piece.fromMs);
                    const p = (t - (end - d)) / d;
                    if (p > 0) { veil.style.zIndex = '3'; veil.style.background = color(ends.end); veil.style.opacity = String(Math.min(1, p)); cur.volume = vol * Math.max(0, 1 - p); }
                }
                if (!cur.paused && joinInto(k) && t >= end - joinInto(k)!.joinMs) { beginOut(k); return; }
                if (!cur.paused && t >= end) { cancelAnimationFrame(raf); play(k + 1); }
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
                if (ranges[0]) { main.currentTime = recordingAt(ranges, ms) / 1000; if (playing) void main.play().catch(() => {}); }
                return;
            }
            const mine = ++run;
            cancelAnimationFrame(raf);
            if (tr?.from === -1) main.volume = vol;
            tr = null;
            main.pause();
            vol = main.volume;
            settle();
            // The whole video from its very start fades in, when the Studio or the edit chooses a transition there.
            fadeIn = k === 0 && ms === 0 && playing && ends.start.transition !== 'cut' ? { k, dur: ends.start.durationMs } : null;
            if (fadeIn) { veil.style.zIndex = '1'; veil.style.background = color(ends.start); veil.style.opacity = '1'; }
            control.set(k);
            const end = Number.isFinite(piece.toMs) ? piece.toMs : Infinity;
            load(cur, piece.src!, Math.max(piece.fromMs, Math.min(end - 1, piece.fromMs + ms)), ok => {
                if (mine !== run) return;
                // A file that cannot be played (an expired link, a format this browser lacks) is passed over.
                if (!ok) { play(k + 1, 0, playing); return; }
                if (playing) void cur.play().catch(() => {}); else cur.pause();
                follow(k, mine);
                prepare(k);
            });
        };
        const onEnded = (e: Event) => {
            if (e.target !== cur || tr) return;
            const k = control.get();
            if (k !== null) play(k + 1);
        };
        const last = ranges[ranges.length - 1];
        const outro = pieces.findIndex(p => p.kind === 'outro');
        const watch = () => {
            if (!main.paused && control.get() === null && active && !hold.current && last && outro >= 0) {
                const t = main.currentTime * 1000;
                const o = pieces[outro];
                const join = o.src && o.transition !== 'cut' ? o.joinMs : 0;
                const at = join ? playedAt(ranges, t) : null;
                if (at !== null && at >= totalMs - join) { beginIn(outro, totalMs - at); return; }
                if (t >= last.endMs && t < last.endMs + 500) { play(outro); return; }
            }
            mainRaf = requestAnimationFrame(watch);
        };
        const onMainPlay = () => {
            if (tr) return;
            if (control.get() !== null) stop();
            cancelAnimationFrame(mainRaf);
            mainRaf = requestAnimationFrame(watch);
        };
        const onMainPause = () => cancelAnimationFrame(mainRaf);
        // The editor moves its own video during a transition (to where the episode carries on); anything else closes the piece.
        const onMainSeek = () => { if (!tr && control.get() !== null) stop(); };
        // The recording's own end can be the episode's: the video stops there before the watch sees it.
        const onMainEnded = () => {
            if (control.get() === null && active && !hold.current && last && outro >= 0 && main.currentTime * 1000 >= last.endMs - 50) play(outro);
        };
        settle();
        if (!main.paused) mainRaf = requestAnimationFrame(watch);
        for (const el of [a, b]) {
            el.addEventListener('ended', onEnded);
            el.addEventListener('play', sync);
            el.addEventListener('pause', sync);
        }
        main.addEventListener('play', onMainPlay);
        main.addEventListener('pause', onMainPause);
        main.addEventListener('seeking', onMainSeek);
        main.addEventListener('ended', onMainEnded);
        const detach = control.attach({
            play,
            stop,
            position: () => {
                const k = control.get();
                return k === null || !pieces[k] ? null : { piece: k, ms: Math.max(0, cur.currentTime * 1000 - pieces[k].fromMs) };
            },
            toggle: () => {
                if (control.get() === null) return false;
                // During a transition both sides pause and play together.
                const playing = !cur.paused || (tr?.from === -1 && !main.paused);
                const sides = tr ? [cur, tr.from === -1 ? main : other] : [cur];
                if (tr) tr.held = playing;
                for (const el of sides) { if (playing) el.pause(); else void el.play().catch(() => {}); }
                return true;
            },
        });
        // A piece playing while the edit changed plays on.
        const playing = control.get();
        if (playing !== null) { const mine = ++run; follow(playing, mine); prepare(playing); }
        return () => {
            detach();
            run++;
            cancelAnimationFrame(raf);
            cancelAnimationFrame(mainRaf);
            if (tr?.from === -1) main.volume = vol;
            tr = null;
            for (const el of [a, b]) {
                el.removeEventListener('ended', onEnded);
                el.removeEventListener('play', sync);
                el.removeEventListener('pause', sync);
            }
            main.removeEventListener('play', onMainPlay);
            main.removeEventListener('pause', onMainPause);
            main.removeEventListener('seeking', onMainSeek);
            main.removeEventListener('ended', onMainEnded);
        };
    }, [control, pieces, ends, episodeSrc, video, ranges, active, hold]);

    const piece = current !== null ? pieces[current] : null;
    const teasers = pieces.filter(p => p.kind === 'teaser').length;
    return (
        <div ref={boxRef} className={`absolute inset-0 z-20 rounded-lg bg-black ${piece ? '' : 'hidden'}`}>
            <video ref={aRef} playsInline preload="auto" className="absolute inset-0 w-full h-full rounded-lg" aria-label="The teasers, intro and outro" />
            <video ref={bRef} playsInline preload="auto" className="absolute inset-0 w-full h-full rounded-lg" aria-hidden tabIndex={-1} />
            <div ref={veilRef} aria-hidden className="pointer-events-none absolute inset-0 rounded-lg" style={{ opacity: 0, background: '#000' }} />
            {/* The "In this episode" tag the render burns into each teaser (agent/src/podcast/teaserBanner.ts), drawn here. */}
            {piece?.kind === 'teaser' && piece.tag !== false && (
                <div aria-hidden className="absolute z-10 pointer-events-none" style={{ left: '4.2cqw', bottom: '4.7cqw' }}>
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
                <div className="absolute z-10 top-2 left-2 right-2 flex items-center gap-2 text-xs">
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
