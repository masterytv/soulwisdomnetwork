"use client";

// Why: transitions at splits in the Studio editor's preview (spec 020 item E4). While the edited
// video plays into a transition, a second video plays the start of the next section over the end of
// this one, drawn for the kind with CSS (opacity, a black or white veil, clip-path, a mask or a
// slide), and the sound crossfades; the main video then carries on from where the transition ends
// (the editor's play order skips what the second video played). It follows the video itself, so
// only it redraws. An approximation: the render's ffmpeg version can look slightly different.

import { useEffect, useRef } from 'react';
import type { TransitionKind } from '@/lib/transitions';

// A transition between two sections, in the recording's time: the first ends at aEndMs, the second
// starts at bStartMs, and they overlap by durationMs.
export interface PreviewJoin { aEndMs: number; bStartMs: number; durationMs: number; transition: Exclude<TransitionKind, 'cut'> }

// How far into a transition the picture is (0 to 1), for the kind: `next` drawn over `main`. Also used by the teasers,
// intro and outro (components/studio/programme.tsx, spec 020 item E16).
export function draw(kind: PreviewJoin['transition'], p: number, main: HTMLVideoElement, next: HTMLVideoElement, veil: HTMLDivElement) {
    const n = next.style, v = veil.style;
    n.opacity = '1'; n.clipPath = ''; n.transform = ''; n.filter = ''; n.maskImage = ''; n.webkitMaskImage = '';
    v.opacity = '0';
    main.style.filter = '';
    const rest = `${(1 - p) * 100}%`;
    switch (kind) {
        case 'dissolve': case 'grain': n.opacity = String(p); break;
        case 'fade': case 'fadeWhite':
            v.background = kind === 'fade' ? '#000' : '#fff';
            v.opacity = String(p < 0.5 ? p * 2 : (1 - p) * 2);
            n.opacity = p < 0.5 ? '0' : '1';
            break;
        case 'wipeLeft': case 'softLeft': n.clipPath = `inset(0 0 0 ${rest})`; break;
        case 'wipeRight': case 'softRight': n.clipPath = `inset(0 ${rest} 0 0)`; break;
        case 'wipeUp': case 'softUp': n.clipPath = `inset(${rest} 0 0 0)`; break;
        case 'wipeDown': case 'softDown': n.clipPath = `inset(0 0 ${rest} 0)`; break;
        case 'slideLeft': n.transform = `translateX(${rest})`; break;
        case 'slideRight': n.transform = `translateX(-${rest})`; break;
        case 'slideUp': n.transform = `translateY(${rest})`; break;
        case 'slideDown': n.transform = `translateY(-${rest})`; break;
        case 'circleOpen': n.clipPath = `circle(${p * 75}% at 50% 50%)`; break;
        case 'circleClose': {
            const mask = `radial-gradient(circle at 50% 50%, transparent ${(1 - p) * 75}%, black ${(1 - p) * 75}%)`;
            n.maskImage = mask; n.webkitMaskImage = mask;
            break;
        }
        case 'zoomIn': n.opacity = String(p); n.transform = `scale(${1 + 0.15 * (1 - p)})`; break;
        case 'blur': n.opacity = String(p); main.style.filter = `blur(${p * 8}px)`; n.filter = `blur(${(1 - p) * 8}px)`; break;
    }
}

export function TransitionPreview({ video, src, joins, active }: {
    video: React.RefObject<HTMLVideoElement | null>;
    src: string;
    joins: PreviewJoin[];
    active: boolean;                 // playing the edit (not Original, not a Hear it preview)
}) {
    const nextRef = useRef<HTMLVideoElement>(null);
    const veilRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const main = video.current, next = nextRef.current, veil = veilRef.current;
        if (!main || !next || !veil) return;
        let raf = 0;
        let current: PreviewJoin | null = null;
        let volume = main.volume;
        const reset = () => {
            if (current) main.volume = volume;
            current = null;
            next.pause();
            next.muted = true;
            next.style.opacity = '0';
            veil.style.opacity = '0';
            main.style.filter = '';
        };
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const t = main.currentTime * 1000;
            const j = active && !main.paused ? joins.find(x => t >= x.aEndMs - x.durationMs && t < x.aEndMs) : undefined;
            if (!j) {
                if (current) reset();
                // Keep the second video at the next transition's start, so it plays without a stall.
                const coming = joins.find(x => x.aEndMs - x.durationMs > t && x.aEndMs - x.durationMs - t < 3000);
                if (coming && next.paused && Math.abs(next.currentTime * 1000 - coming.bStartMs) > 40) next.currentTime = coming.bStartMs / 1000;
                return;
            }
            const into = t - (j.aEndMs - j.durationMs);
            if (current !== j) {
                current = j;
                volume = main.volume;
                next.currentTime = (j.bStartMs + into) / 1000;
                next.playbackRate = main.playbackRate;
                next.muted = main.muted;
                void next.play().catch(() => {});
            }
            const p = Math.min(1, Math.max(0, into / j.durationMs));
            draw(j.transition, p, main, next, veil);
            main.volume = volume * (1 - p);
            next.volume = volume * p;
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); reset(); };
    }, [video, joins, active]);
    return (
        <>
            <video ref={nextRef} src={src} muted playsInline preload="auto" aria-hidden tabIndex={-1}
                className="pointer-events-none absolute inset-0 w-full h-full rounded-lg bg-black object-contain" style={{ opacity: 0 }} />
            <div ref={veilRef} aria-hidden className="pointer-events-none absolute inset-0 rounded-lg" style={{ opacity: 0, background: '#000' }} />
        </>
    );
}
