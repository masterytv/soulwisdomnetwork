"use client";

// Why: keys the Studio editor gained with spec 020 item E8, kept apart from the editor's own key handler.
// - J, K and L: L plays, and again plays faster (up to 2×); J plays backwards, and again faster (up to 4×); K
//   stops. With K held, J and L step one frame back or forward.
// - Ctrl or ⌘ + C, X and V: copy or cut the selected layer or sound, and paste it at the playhead as a new one,
//   anchored as the original was. The clipboard is this page's only: another episode's bin would not have the
//   file. Not while words or a stretch of the timeline are selected (their keys mean something else).
// Playing backwards is a seek a frame at a time (ReversePlay), since a video cannot play in reverse.

import { useEffect, useRef } from 'react';
import { SOUNDS_MAX, type Sound } from '@/lib/audio';
import { LAYERS_MAX, pasteAt, type Layer } from '@/lib/layers';
import { sourceTime, timelineTime, type Clip } from '@/lib/sequence';
import { SPEEDS } from '@/lib/studioUi';

export function useStudioKeys({
    container, video: videoRef, enabled, clips, layers, sounds, layersEditable, selected, busy,
    setLayers, setSounds, pick, remove, setReverse, setSpeed,
}: {
    container: React.RefObject<HTMLElement | null>;
    video: React.RefObject<HTMLVideoElement | null>;
    enabled: boolean;
    clips: Clip[];
    layers: Layer[];
    sounds: Sound[];
    layersEditable: boolean;
    selected: string | null;   // the layer or sound chosen
    busy: boolean;             // words or a stretch of the timeline are selected
    setLayers: (layers: Layer[]) => void;
    setSounds: (sounds: Sound[]) => void;
    pick: (id: string) => void;
    remove: (id: string) => void;
    setReverse: React.Dispatch<React.SetStateAction<number>>;
    setSpeed: (speed: number) => void;
}) {
    const clipboard = useRef<{ layer: Layer } | { sound: Sound } | null>(null);
    const kHeld = useRef(false);

    useEffect(() => {
        const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'k') kHeld.current = false; };
        const blur = () => { kHeld.current = false; };
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        return () => { window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
    }, []);

    useEffect(() => {
        const el = container.current;
        if (!el || !enabled) return;
        const shuttle = (key: 'j' | 'k' | 'l') => {
            const video = videoRef.current;
            if (!video) return;
            if (key === 'k') { setReverse(0); video.pause(); return; }
            if (kHeld.current) {
                setReverse(0);
                video.pause();
                video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + (key === 'l' ? 1 : -1) / 30));
                return;
            }
            if (key === 'j') { setReverse(r => (r ? Math.min(4, r * 2) : 1)); return; }
            setReverse(0);
            if (video.paused) { void video.play(); return; }
            const faster = SPEEDS.find(r => r > video.playbackRate);
            if (faster) setSpeed(faster);
        };
        const paste = () => {
            const clip = clipboard.current;
            if (!clip) return;
            const srcMs = (videoRef.current?.currentTime ?? 0) * 1000;
            const atMs = timelineTime(clips, srcMs, true) ?? 0;
            if ('layer' in clip) {
                if (!layersEditable || layers.length >= LAYERS_MAX) return;
                const layer = pasteAt(clip.layer, srcMs, atMs);
                setLayers([...layers, layer]);
                pick(layer.id);
            } else if (sounds.length < SOUNDS_MAX) {
                const sound = pasteAt(clip.sound, srcMs, atMs);
                setSounds([...sounds, sound]);
                pick(sound.id);
            }
        };
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-word-fix]') || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (key === 'c' || key === 'x' || key === 'v')) {
                if (key === 'v') {
                    if (clipboard.current) { e.preventDefault(); paste(); }
                    return;
                }
                if (!selected || busy) return;
                const layer = layers.find(l => l.id === selected);
                const sound = sounds.find(x => x.id === selected);
                if (!layer && !sound) return;
                e.preventDefault();
                clipboard.current = layer ? { layer: structuredClone(layer) } : { sound: structuredClone(sound!) };
                if (key === 'x' && (sound || layersEditable)) remove(selected);
                return;
            }
            if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === 'j' || key === 'k' || key === 'l')) {
                e.preventDefault();
                if (key === 'k') kHeld.current = true;
                if (!e.repeat || key !== 'k') shuttle(key);
            }
        };
        el.addEventListener('keydown', handler);
        return () => el.removeEventListener('keydown', handler);
    }, [container, videoRef, enabled, clips, layers, sounds, layersEditable, selected, busy, setLayers, setSounds, pick, remove, setReverse, setSpeed]);
}

// A moment the one preview video plays, at or before `ms`: `ms` itself when it is in `ranges`, else the end of
// the range before it.
export function playedBefore(ranges: { startMs: number; endMs: number }[], ms: number): number {
    let before = 0;
    for (const r of ranges) {
        if (ms >= r.startMs && ms < r.endMs) return ms;
        if (r.endMs <= ms) before = r.endMs - 1;
    }
    return before;
}

// J: plays the video backwards at `rate`, a seek a frame at a time. Through the edit (`edited`), cuts are
// skipped as when playing, and the start of a part that a transition's second video plays is passed over. It
// stops at the start, or when the video plays (`onStop`).
export function ReversePlay({ video: videoRef, rate, onStop, clips, ranges, edited }: {
    video: React.RefObject<HTMLVideoElement | null>; rate: number; onStop: () => void;
    clips: Clip[]; ranges: { startMs: number; endMs: number }[]; edited: boolean;
}) {
    // The latest onStop, without starting again whenever the editor draws.
    const stopRef = useRef(onStop);
    useEffect(() => { stopRef.current = onStop; });
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        let raf = 0, last = performance.now();
        const back = (src: number, dt: number): number => {
            if (!edited) return Math.max(0, src - dt);
            const at = (timelineTime(clips, src, true) ?? 0) - dt;
            const next = at <= 0 ? 0 : sourceTime(clips, at);
            return next === null ? 0 : playedBefore(ranges, next);
        };
        // While a seek is under way the time keeps counting, so the next one goes back by all of it.
        const tick = (now: number) => {
            if (!video.seeking) {
                const next = back(video.currentTime * 1000, (now - last) * rate);
                last = now;
                video.currentTime = next / 1000;
                if (next <= 0) { stopRef.current(); return; }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        const stop = () => stopRef.current();
        video.addEventListener('play', stop);
        return () => { cancelAnimationFrame(raf); video.removeEventListener('play', stop); };
    }, [videoRef, rate, clips, ranges, edited]);
    return null;
}
