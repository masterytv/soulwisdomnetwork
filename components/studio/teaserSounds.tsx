"use client";

// Why: the teasers' music and whoosh in the Studio editor's preview (Studio settings teaserMusic and teaserWhoosh,
// lib/audio.ts teaserSoundPlan). The teasers play on the programme player (components/studio/programme.tsx), before
// the episode, so no sound on the edit reaches them; this follows that player's clock frame by frame and plays the
// bed under them at the render's level, fades and ducking (always ducked: a teaser is all speech), and the whoosh as
// the playhead crosses each change, the same moments the render mixes them at. A sketch of the render's mix, not a
// second mixer: the compressor's ducking is a fixed drop here.

import { useEffect, useRef } from 'react';
import { dbToGain, fileTimeAt, soundGainAt, TEASER_MUSIC_FADE_IN_MS, TEASER_MUSIC_FADE_OUT_MS, teaserSoundPlan } from '@/lib/audio';
import type { ProgrammeView, ProgrammeSetup } from '@/components/studio/programme';

export function TeaserSoundsPreview({ prog, sounds }: { prog: ProgrammeView; sounds: NonNullable<ProgrammeSetup['teaserSounds']> }) {
    const music = useRef<HTMLAudioElement>(null);
    const whoosh = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        const plan = teaserSoundPlan(prog.pieces);
        let raf = 0, last: number | null = null;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const pos = prog.control.position();
            const piece = pos ? prog.pieces[pos.piece] : null;
            const now = piece && pos ? piece.atMs + pos.ms : null;
            // Playing while the programme's clock moves; a jump (a seek, a click on the timeline) fires no whoosh.
            const playing = now !== null && last !== null && now > last && now - last < 500;
            const m = music.current, w = whoosh.current;
            if (m && sounds.music && plan.music) {
                const gain = now === null ? null : soundGainAt(
                    { gainDb: sounds.music.gainDb, fadeInMs: TEASER_MUSIC_FADE_IN_MS, fadeOutMs: TEASER_MUSIC_FADE_OUT_MS, duck: true }, plan.music, now, true);
                if (gain === null || !playing) {
                    if (!m.paused) m.pause();
                } else {
                    m.volume = Math.min(1, gain);
                    const want = fileTimeAt({ inMs: 0, loop: true }, plan.music, now, Number.isFinite(m.duration) ? m.duration * 1000 : null) / 1000;
                    if (Math.abs(m.currentTime - want) > 0.3) m.currentTime = want;
                    if (m.paused) void m.play().catch(() => {});
                }
            }
            if (w && sounds.whoosh && playing && last !== null && now !== null && plan.whooshes.some(at => last! < at && at <= now)) {
                w.volume = Math.min(1, dbToGain(sounds.whoosh.gainDb));
                w.currentTime = 0;
                void w.play().catch(() => {});
            }
            last = now;
        };
        raf = requestAnimationFrame(tick);
        const m = music.current;
        return () => { cancelAnimationFrame(raf); m?.pause(); };
    }, [prog, sounds]);
    return (
        <>
            {sounds.music && <audio ref={music} src={sounds.music.url} preload="auto" loop aria-hidden />}
            {sounds.whoosh && <audio ref={whoosh} src={sounds.whoosh.url} preload="auto" aria-hidden />}
        </>
    );
}
