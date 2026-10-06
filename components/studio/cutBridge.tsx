"use client";

// Why: a smoother preview over cuts (docs/specs/019-editor-light-v2.md item 4.3). The editor plays the edit by
// seeking one <video> past each cut, and a seek can take a moment, so the picture froze or stuttered at a cut.
// Now a second video waits, already seeked to the start of the next kept stretch. At the cut it plays on top
// while the main video jumps a little ahead, finds its frame behind it and waits; when the second one gets there,
// the main video plays on and the second one hides. The main video stays the one everything follows (the timeline, the script, layers and
// captions), so nothing else changes.
//
// The sound hands over at the cut with a short ramp on each video's volume, close to the render's 15 ms fades.
// The plan said Web Audio, but the Storage bucket's CORS refuses the browser, and a video Web Audio cannot read
// plays silent; the volume ramps need no CORS.

import { useEffect, useRef } from 'react';
import type { KeptRange } from '@/lib/edit';

// How far ahead of the next stretch's start the main video jumps, so it is ready behind the second one by the
// time that one gets there (it waits there, nearly still); how close to the cut the hand-over starts; and the shortest stretch it is used for
// (a cut under a second after the last, it seeks as before: the second video could not be ready again).
export const BRIDGE = { leadMs: 300, earlyMs: 40, minStretchMs: 1000, rampMs: 15 };

// The cut ahead of `t` that the second video should cover: the end of the kept stretch `t` is in, and the start
// of the next one, when that next stretch is long enough and no transition plays there (TransitionPreview does).
export function cutAhead(ranges: KeptRange[], t: number, transitionsAt: number[]): { endMs: number; nextMs: number; nextEndMs: number } | null {
    const i = ranges.findIndex(r => t >= r.startMs && t < r.endMs);
    if (i < 0 || i === ranges.length - 1) return null;
    const r = ranges[i], next = ranges[i + 1];
    if (next.endMs - next.startMs < BRIDGE.minStretchMs) return null;
    if (transitionsAt.some(at => Math.abs(at - r.endMs) < 1)) return null;
    return { endMs: r.endMs, nextMs: next.startMs, nextEndMs: next.endMs };
}

// The slowest rate browsers allow; the main video waits at it, nearly still, for the second one.
const SLOWEST = 0.0625;

// Ramps a video's volume from where it is to `to` over `ms`, a step a frame.
function ramp(v: HTMLVideoElement, to: number, ms: number) {
    const from = v.volume, start = performance.now();
    const step = () => {
        const p = Math.min(1, (performance.now() - start) / ms);
        v.volume = Math.max(0, Math.min(1, from + (to - from) * p));
        if (p < 1) requestAnimationFrame(step);
    };
    step();
}

export function CutBridge({ video, src, ranges, transitionsAt, hold, active }: {
    video: React.RefObject<HTMLVideoElement | null>;
    src: string;
    ranges: KeptRange[];             // what the preview plays, in the recording's time
    transitionsAt: number[];         // where a stretch ends into a transition at a split (TransitionPreview plays those)
    hold: React.RefObject<unknown>;  // set while a Hear it preview plays the recording as it is: leave it alone
    active: boolean;                 // playing the edit (not Original, nor reverse play)
}) {
    const nextRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const main = video.current, next = nextRef.current;
        if (!main || !next) return;
        let raf = 0;
        // The cut being prepared or covered, and while covering, the user's volume to hand back.
        let ready: { endMs: number; nextMs: number } | null = null;
        let covering: { nextMs: number; volume: number; rate: number; at: number } | null = null;
        const hide = () => {
            next.pause();
            next.muted = true;
            next.style.opacity = '0';
        };
        const finish = () => {
            if (!covering) return;
            main.playbackRate = covering.rate;
            main.volume = 0;
            ramp(main, covering.volume, BRIDGE.rampMs);
            ramp(next, 0, BRIDGE.rampMs);
            // The picture hands back at once (the second video is a moment ahead by now); its sound fades out.
            next.style.opacity = '0';
            setTimeout(hide, BRIDGE.rampMs + 20);
            covering = null;
            ready = null;
        };
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const t = main.currentTime * 1000;
            if (covering) {
                // The main video has found its frame and the second one has reached it: hand back. Too long (a slow
                // seek), or the user moved on: hand back anyway.
                const caught = !main.seeking && main.readyState >= 3 && next.currentTime * 1000 >= t - 20;
                if (caught || main.paused || performance.now() - covering.at > 3000) finish();
                return;
            }
            if (!active || main.paused || hold.current) { if (ready) hide(); ready = null; return; }
            const cut = cutAhead(ranges, t, transitionsAt);
            if (!cut) return;
            // Within three seconds of a cut: the second video waits at the next stretch's start.
            if (!ready || ready.nextMs !== cut.nextMs) {
                if (cut.endMs - t > 3000) return;
                ready = { endMs: cut.endMs, nextMs: cut.nextMs };
                next.pause();
                next.currentTime = cut.nextMs / 1000;
                return;
            }
            // At the cut, if the second video is ready there: it plays on top, the main video jumps ahead.
            if (t < cut.endMs - BRIDGE.earlyMs) return;
            if (next.seeking || next.readyState < 2 || Math.abs(next.currentTime * 1000 - cut.nextMs) > 60) return;
            covering = { nextMs: cut.nextMs, volume: main.volume, rate: main.playbackRate, at: performance.now() };
            next.playbackRate = main.playbackRate;
            next.muted = main.muted;
            next.volume = 0;
            next.style.opacity = '1';
            void next.play().catch(() => {});
            ramp(next, covering.volume, BRIDGE.rampMs);
            ramp(main, 0, BRIDGE.rampMs);
            main.currentTime = Math.min(cut.nextEndMs - 50, cut.nextMs + BRIDGE.leadMs) / 1000;
            // It waits there, barely moving, until the second video reaches it (pausing would flash the Play button).
            main.playbackRate = SLOWEST;
        };
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            if (covering) { main.volume = covering.volume; main.playbackRate = covering.rate; }
            hide();
        };
    }, [video, ranges, transitionsAt, hold, active]);
    return (
        <video ref={nextRef} src={src} muted playsInline preload="auto" aria-hidden tabIndex={-1} data-cut-bridge=""
            className="pointer-events-none absolute inset-0 w-full h-full rounded-lg bg-black object-contain" style={{ opacity: 0 }} />
    );
}
