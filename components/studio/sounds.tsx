"use client";

// Why: the Studio editor's music and effects (spec 020 item E7, lib/audio.ts). The preview plays each sound in
// an <audio> kept in step with the video: from its place in its file (round again when it loops), at its level
// with its fades, lowered while anyone speaks when it ducks (the render's compressor does it more smoothly), and
// silent while its track is muted on the timeline. A sketch of the render's mix, not the mix itself. The
// Properties panel shows a selected sound's track, time, level, fades, looping and ducking, and where its
// licence or rights come from.

import { useEffect, useMemo, useRef } from "react";
import {
    fileTimeAt, soundGainAt, soundSpan, SOUND_TRACK, SOUND_TRACK_LABELS, type Sound,
} from "@/lib/audio";
import { isWhole, LAYER_MIN_MS, startAt, WHOLE_EPISODE_MS, type BinItem, type Span } from "@/lib/layers";
import { sourceTime, timelineTime, type Clip } from "@/lib/sequence";
import type { SpokenWord } from "@/lib/showNotes";
import { field, hint, secondary } from "@/components/studio/ui";
import { useFrameTime } from "@/components/studio/layers";
import { useVideoTime } from "@/components/studio/useVideoTime";
import { mmss } from "@/components/studio/onScreen";
import { NumberField, Section } from "@/components/studio/properties";

// Whether someone is speaking at `ms` of the recording (the words are in time order).
function speakingAt(words: SpokenWord[], ms: number): boolean {
    let lo = 0, hi = words.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (words[mid].end <= ms) lo = mid + 1;
        else if (words[mid].start > ms) hi = mid - 1;
        else return true;
    }
    return false;
}

function SoundPlayer({ sound, url, span, nowMs, playing, speaking, muted }: {
    sound: Sound; url: string; span: Span; nowMs: number; playing: boolean; speaking: boolean; muted: boolean;
}) {
    const ref = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const gain = soundGainAt(sound, span, nowMs, speaking);
        const fileMs = Number.isFinite(el.duration) ? el.duration * 1000 : null;
        const at = fileTimeAt(sound, span, nowMs, fileMs);
        const past = !sound.loop && fileMs !== null && at >= fileMs;
        if (gain === null || muted || past) {
            if (!el.paused) el.pause();
            return;
        }
        el.volume = Math.max(0, Math.min(1, gain));
        if (Math.abs(el.currentTime * 1000 - at) > 300) el.currentTime = at / 1000;
        if (playing && el.paused) void el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
    }, [sound, span, nowMs, playing, speaking, muted]);
    return <audio ref={ref} src={url} preload="auto" loop={sound.loop} aria-hidden />;
}

export function SoundsPreview({ sounds, clips, editedMs, video, urls, words, mutedTracks }: {
    sounds: Sound[];
    clips: Clip[];
    editedMs: number;
    video: React.RefObject<HTMLVideoElement | null>;
    urls: Record<string, string>;
    words: SpokenWord[];
    mutedTracks: number[];
}) {
    const { ms: srcMs, playing } = useFrameTime(video);
    const nowMs = timelineTime(clips, srcMs, true) ?? editedMs;
    const speaking = speakingAt(words, srcMs);
    const placed = useMemo(() => sounds.flatMap(s => { const span = soundSpan(s, clips, editedMs); return span && urls[s.media.path] ? [{ s, span }] : []; }),
        [sounds, clips, editedMs, urls]);
    return (
        <div hidden>
            {placed.map(({ s, span }) => (
                <SoundPlayer key={s.id} sound={s} url={urls[s.media.path]} span={span} nowMs={nowMs} playing={playing} speaking={speaking}
                    muted={mutedTracks.includes(s.track)} />
            ))}
        </div>
    );
}

// The selected sound in the Properties panel.
export function SoundProperties({ sound, clips, editedMs, video, bin, onChange, onRemove, onSeek }: {
    sound: Sound;
    clips: Clip[];
    editedMs: number;
    video: React.RefObject<HTMLVideoElement | null>;
    bin: BinItem[] | null;
    onChange: (s: Sound) => void;
    onRemove: (id: string) => void;
    onSeek: (ms: number) => void;
}) {
    const currentMs = useVideoTime(video);
    const s = sound;
    const span = soundSpan(s, clips, editedMs);
    const nowEdited = timelineTime(clips, currentMs, true) ?? 0;
    const set = (part: Partial<Sound>) => onChange({ ...s, ...part });
    const item = bin?.find(i => i.path === s.media.path && (s.library ? i.source === 'library' : i.source === 'upload'));
    const pinned = 'atMs' in s.anchor;
    const small = `${field} !w-auto !py-1 !px-2 text-xs`;

    return (
        <section aria-label="Properties" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-200">Properties</h2>
                <span className="px-1.5 py-0.5 rounded text-xs bg-rose-500/20 text-rose-200">{s.track === SOUND_TRACK.music ? 'Music' : 'Effect'}</span>
                <span className="text-xs text-gray-300 truncate max-w-[14rem]" title={s.media.name}>{s.media.name}</span>
                <span className="grow" />
                <button type="button" className={`${secondary} px-2 py-0.5`} onClick={() => onRemove(s.id)}>Remove</button>
            </div>
            <p className={hint}>
                {s.library
                    ? item?.sound ? `From the show library: ${item.sound.licence || 'licence'}${item.sound.checked ? ', checked' : ', NOT checked (it will be left out of the render)'}.${item.sound.credit ? ` Credit in the description: “${item.sound.credit}”.` : ''}` : 'From the show library.'
                    : item?.rights ? `Uploaded for this episode; ${item.rights.name} said it is theirs to use (${item.rights.on}).` : 'Uploaded for this episode.'}
            </p>

            <Section title="Time">
                <label className="flex items-center gap-2">
                    Track
                    <select aria-label="Track" value={s.track} className={small} onChange={e => set({ track: Number(e.target.value) })}>
                        {[SOUND_TRACK.music, SOUND_TRACK.effects].map(t => <option key={t} value={t}>{SOUND_TRACK_LABELS[t]}</option>)}
                    </select>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                    <span>Starts at</span>
                    <button type="button" className={`${secondary} px-2 py-0.5`} title="Jump there"
                        onClick={() => { if (span) onSeek(sourceTime(clips, span.startMs + 50) ?? 0); }}>
                        {span ? mmss(span.startMs) : 'after the end'}
                    </button>
                    <button type="button" className={`${secondary} px-2 py-0.5`} title="Start it where the playhead is"
                        onClick={() => onChange(startAt(s, nowEdited, a => sourceTime(clips, a)))}>
                        Start at {mmss(nowEdited)}
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1">
                        <input type="checkbox" checked={isWhole(s)} aria-label="To the end of the episode"
                            onChange={e => set({ durationMs: e.target.checked ? WHOLE_EPISODE_MS : Math.max(LAYER_MIN_MS, Math.min(60_000, span ? span.endMs - span.startMs : 10_000)) })} />
                        To the end of the episode
                    </label>
                    {!isWhole(s) && (
                        <label className="flex items-center gap-1">
                            for
                            <NumberField label="Seconds it plays" value={s.durationMs / 1000} min={LAYER_MIN_MS / 1000} max={86_399} step={0.5} onChange={v => set({ durationMs: Math.round(v * 1000) })} />
                            s
                        </label>
                    )}
                </div>
                <select aria-label="Anchor" value={pinned ? 'pinned' : 'words'} className={`${small} self-start`}
                    title="Moves with its words when cuts change, or stays at its time in the edited video"
                    onChange={e => { if (span) set({ anchor: e.target.value === 'pinned' ? { atMs: span.startMs } : { srcMs: Math.round(sourceTime(clips, span.startMs) ?? 0) } }); }}>
                    <option value="words">Moves with the words</option>
                    <option value="pinned">Stays at this time</option>
                </select>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1">
                        From
                        <NumberField label="Start in the file, seconds" value={s.inMs / 1000} min={0} max={86_399} step={0.5} onChange={v => set({ inMs: Math.round(v * 1000) })} />
                        s into the file
                    </label>
                    <label className="flex items-center gap-1">
                        <input type="checkbox" checked={s.loop} aria-label="Loop" onChange={e => set({ loop: e.target.checked })} />
                        Loop when it ends
                    </label>
                </div>
            </Section>

            <Section title="Level">
                <label className="flex items-center gap-2">
                    Level
                    <input type="range" min={-40} max={6} value={Math.max(-40, s.gainDb)} aria-label="Level" onChange={e => set({ gainDb: Number(e.target.value) })} />
                    <NumberField label="Level, dB" value={s.gainDb} min={-60} max={12} onChange={v => set({ gainDb: Math.round(v) })} />
                    dB
                </label>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1">
                        Fade in
                        <NumberField label="Fade in, seconds" value={s.fadeInMs / 1000} min={0} max={10} step={0.25} onChange={v => set({ fadeInMs: Math.round(v * 1000) })} />
                        s
                    </label>
                    <label className="flex items-center gap-1">
                        out
                        <NumberField label="Fade out, seconds" value={s.fadeOutMs / 1000} min={0} max={10} step={0.25} onChange={v => set({ fadeOutMs: Math.round(v * 1000) })} />
                        s
                    </label>
                </div>
                <label className="flex items-center gap-1">
                    <input type="checkbox" checked={s.duck} aria-label="Duck under the voice" onChange={e => set({ duck: e.target.checked })} />
                    Lower it while anyone speaks (ducking)
                </label>
            </Section>
        </section>
    );
}
