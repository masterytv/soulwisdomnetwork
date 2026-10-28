"use client";

// Why: the Studio editor's music and effects (spec 020 item E7, lib/audio.ts). The preview plays each sound in
// an <audio> kept in step with the video: from its place in its file (round again when it loops), at its level
// with its fades, lowered while anyone speaks when it ducks (the render's compressor does it more smoothly), and
// silent while its track is muted on the timeline. A sketch of the render's mix, not the mix itself. The
// Properties panel shows a selected sound's track, time, level, fades, looping and ducking, and where its
// licence or rights come from.

import { useEffect, useMemo, useRef } from "react";
import {
    fileTimeAt, isStudioSound, soundGainAt, soundSpan, SOUND_TRACK, SOUND_TRACK_LABELS, type Sound,
} from "@/lib/audio";
import { isWhole, LAYER_MIN_MS, startAt, WHOLE_EPISODE_MS, type BinItem, type Span } from "@/lib/layers";
import { sourceTime, timelineTime, type Clip } from "@/lib/sequence";
import { MAX_LEAD_MS, type ProgrammeSound } from "@/lib/programme";
import type { ProgrammeView } from "@/components/studio/programme";
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
            <p className={hint}>{soundSource(s, bin)}</p>

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

            <SoundLevel s={s} set={set} />
        </section>
    );
}

// Spec 022: the sounds on the clips other than the episode, on the whole video's clock: the programme player's while it
// shows a teaser, the intro or the outro, else the episode's start plus where the editor's video is in the edit. Each
// plays from its clip's start at its level and fades, lowered while someone speaks (the words of a teaser's stretch or
// of the episode; never in the intro or outro), as the render mixes them over the whole video. A sketch of the mix, as
// the episode's sounds are.
export function ClipSoundsPreview({ prog, sounds, video, clips, words, urls, mutedTracks }: {
    prog: ProgrammeView;
    sounds: ProgrammeSound[];
    video: React.RefObject<HTMLVideoElement | null>;
    clips: Clip[];
    words: SpokenWord[];
    urls: Record<string, string>;
    mutedTracks: number[];
}) {
    const refs = useRef(new Map<string, HTMLAudioElement>());
    useEffect(() => {
        let raf = 0, last: number | null = null;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const pos = prog.control.position();
            const piece = pos ? prog.pieces[pos.piece] : null;
            const main = video.current;
            let now: number, speaking = false, playing: boolean;
            if (piece && pos) {
                now = piece.atMs + pos.ms;
                // Playing while the programme's clock moves on; a jump (a seek, a click on the timeline) is not playing.
                playing = last !== null && now > last && now - last < 500;
                if (piece.kind === 'teaser') speaking = speakingAt(words, piece.fromMs + pos.ms);
            } else {
                const src = (main?.currentTime ?? 0) * 1000;
                now = prog.programme.episodeAtMs + (timelineTime(clips, src, true) ?? 0);
                playing = !!main && !main.paused;
                speaking = speakingAt(words, src);
            }
            last = now;
            for (const s of sounds) {
                const el = refs.current.get(s.id);
                if (!el) continue;
                const p = prog.pieces.find(x => x.id === s.anchor.clip);
                const startMs = p ? Math.max(0, p.atMs + s.anchor.ms) : 0;
                const span = { startMs, endMs: Math.min(prog.programme.lengthMs, startMs + s.durationMs) };
                const gain = p ? soundGainAt(s, span, now, speaking) : null;
                const fileMs = Number.isFinite(el.duration) ? el.duration * 1000 : null;
                const at = fileTimeAt(s, span, now, fileMs);
                if (gain === null || !playing || mutedTracks.includes(s.track) || (!s.loop && fileMs !== null && at >= fileMs)) {
                    if (!el.paused) el.pause();
                    continue;
                }
                el.volume = Math.max(0, Math.min(1, gain));
                if (Math.abs(el.currentTime * 1000 - at) > 300) el.currentTime = at / 1000;
                if (el.paused) void el.play().catch(() => {});
            }
        };
        raf = requestAnimationFrame(tick);
        const els = refs.current;
        return () => { cancelAnimationFrame(raf); els.forEach(el => el.pause()); };
    }, [prog, sounds, video, clips, words, mutedTracks]);
    return (
        <div hidden>
            {sounds.filter(s => urls[s.media.path]).map(s => (
                <audio key={s.id} ref={el => { if (el) refs.current.set(s.id, el); else refs.current.delete(s.id); }}
                    src={urls[s.media.path]} preload="auto" loop={s.loop} aria-hidden />
            ))}
        </div>
    );
}

// A sound's level, fades and ducking, wherever it is.
function SoundLevel({ s, set }: { s: Pick<Sound, "gainDb" | "fadeInMs" | "fadeOutMs" | "duck">; set: (part: Partial<Pick<Sound, "gainDb" | "fadeInMs" | "fadeOutMs" | "duck">>) => void }) {
    return (
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
    );
}

// Where a sound came from and whether it may play: the Studio's own, the show library's (its licence), or an upload.
function soundSource(s: Pick<Sound, "library" | "media">, bin: BinItem[] | null): string {
    const item = bin?.find(i => i.path === s.media.path && (s.library ? i.source === 'library' : i.source === 'upload'));
    return isStudioSound(s.media.path) ? 'One of the Studio\'s own sounds: the show\'s to use, with no licence to check.'
        : s.library
        ? item?.sound ? `From the show library: ${item.sound.licence || 'licence'}${item.sound.checked ? ', checked' : ', NOT checked (it will be left out of the render)'}.${item.sound.credit ? ` Credit in the description: “${item.sound.credit}”.` : ''}` : 'From the show library.'
        : item?.rights ? `Uploaded for this episode; ${item.rights.name} said it is theirs to use (${item.rights.on}).` : 'Uploaded for this episode.';
}

// Spec 022: a sound on a clip other than the episode in the Properties panel: which clip it is on and how far from that
// clip's start (it may lead in), how long, its file, level, fades and ducking. It plays on to the end of the video at
// the latest.
export function ClipSoundProperties({ sound: s, clips, bin, onChange, onRemove, onSeek }: {
    sound: ProgrammeSound;
    clips: { id: string; name: string }[];      // the clips it may sit on, in play order
    bin: BinItem[] | null;
    onChange: (s: ProgrammeSound) => void;
    onRemove: (id: string) => void;
    onSeek: (clip: string, ms: number) => void;
}) {
    const set = (part: Partial<ProgrammeSound>) => onChange({ ...s, ...part });
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
            <p className={hint}>{soundSource(s, bin)}</p>
            <Section title="Time">
                <label className="flex items-center gap-2">
                    Track
                    <select aria-label="Track" value={s.track} className={small} onChange={e => set({ track: Number(e.target.value) })}>
                        {[SOUND_TRACK.music, SOUND_TRACK.effects].map(t => <option key={t} value={t}>{SOUND_TRACK_LABELS[t]}</option>)}
                    </select>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1">
                        On
                        <select aria-label="The clip it is on" value={s.anchor.clip} className={small} onChange={e => set({ anchor: { clip: e.target.value, ms: s.anchor.ms } })}>
                            {clips.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </label>
                    <label className="flex items-center gap-1">
                        at
                        <NumberField label="Seconds from the clip's start (less than 0 leads into it)" value={s.anchor.ms / 1000} min={-MAX_LEAD_MS / 1000} max={86_399} step={0.05}
                            onChange={v => set({ anchor: { clip: s.anchor.clip, ms: Math.round(v * 1000) } })} />
                        s
                    </label>
                    <button type="button" className={`${secondary} px-2 py-0.5`} title="Play from there" onClick={() => onSeek(s.anchor.clip, Math.max(0, s.anchor.ms))}>▶</button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1">
                        <input type="checkbox" checked={isWhole(s)} aria-label="To the end of the video"
                            onChange={e => set({ durationMs: e.target.checked ? WHOLE_EPISODE_MS : 10_000 })} />
                        To the end of the video
                    </label>
                    {!isWhole(s) && (
                        <label className="flex items-center gap-1">
                            for
                            <NumberField label="Seconds it plays" value={s.durationMs / 1000} min={LAYER_MIN_MS / 1000} max={86_399} step={0.5} onChange={v => set({ durationMs: Math.round(v * 1000) })} />
                            s
                        </label>
                    )}
                </div>
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
            <SoundLevel s={s} set={set} />
        </section>
    );
}
