// Why: the Studio editor's music and sound effects (docs/specs/020-studio-editor.md item E7). A sound is a
// file from the show library (music beds, effects and stingers the team downloaded and whose licence an
// admin checked) or one uploaded for the episode (its uploader declared the rights), placed on A2 (music)
// or A3 (effects) like a layer: anchored to a moment of the recording (`srcMs`, moving with its words) or
// pinned to a time in the edited episode (`atMs`, the default for music beds), for `durationMs`, from
// `inMs` into the file, looped or not, at a gain, with fades, and ducked under the voice or not.
//
// The library's licence record and its "not checked" gate are here too, so the edit route, the render job
// and the pages apply the same rules. The ducking mix starts from Part H's `musicMix` by Jo Ann H
// (Lucid4224, `bc5b006` in her fork, not merged): the voice keys a `sidechaincompress` on the music, and
// `amix` puts them back together without changing the voice's level.

import { z } from 'zod';
import { AnchorSchema, layerSpan, LAYER_MIN_MS, WHOLE_EPISODE_MS, type Span } from './layers';
import type { KeptRange } from './edit';

// ─── the show library's licences ─────────────────────────────────────────────

export const LIBRARY_KINDS = ['music', 'effect'] as const;
export type LibraryKind = typeof LIBRARY_KINDS[number];
export const LIBRARY_KIND_LABELS: Record<LibraryKind, string> = { music: 'Music', effect: 'Effect' };
export const LIBRARY_MAX = 500;

const text = (max: number) => z.string().trim().max(max);
const webUrl = z.string().trim().max(500).refine(s => s === '' || /^https?:\/\/\S+$/.test(s), 'Use a full web address starting with https://');

// What the team records for each file it downloads (spec 020, "Music and sound effects: licences").
export const LicenceSchema = z.object({
    sourceUrl: webUrl,                           // where it was downloaded
    author: text(150),
    name: text(150),                             // the licence's name, such as "Pixabay Content License" or "CC0 1.0"
    url: webUrl,                                 // the licence's own page
    downloadedOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use a date like 2026-10-06'),
    proofPath: z.string().regex(/^library\/[\w.-]+$/).max(200).nullable(),   // a snapshot of the licence page (PDF or picture)
    code: text(200),                             // a certificate or credit code, when the site gives one
    credit: text(300),                           // what the description must say, when the licence asks for it
});
export type Licence = z.infer<typeof LicenceSchema>;
export const EMPTY_LICENCE: Licence = { sourceUrl: '', author: '', name: '', url: '', downloadedOn: '', proofPath: null, code: '', credit: '' };

// Who checked the licence by hand, and when (decision U2). Without it a file cannot be placed or rendered.
export interface LicenceCheck { by: string; name: string; on: string }

// The licences the Studio cannot use, whatever else the record says: non-commercial (NC) and no-derivatives
// (ND) ones, since a podcast on YouTube is commercial and the edit changes the file; and YouTube Audio
// Library tracks, which may be used on YouTube only, while the episode also goes out as a podcast.
export function licenceProblem(l: Pick<Licence, 'name' | 'url' | 'sourceUrl'>): string | null {
    const all = `${l.name} ${l.url} ${l.sourceUrl}`;
    if (/youtube\s*audio\s*library|youtube\.com\/audiolibrary|studio\.youtube\.com\/.*music/i.test(all)) {
        return 'YouTube Audio Library tracks may be used on YouTube only, and the episode also goes out as a podcast';
    }
    // "CC BY-NC 4.0" by name (the short forms in capitals, so "Inc" or "and" never count), or a Creative
    // Commons address such as creativecommons.org/licenses/by-nc-sa/4.0.
    if (/non[-\s]?commercial/i.test(l.name) || /\bNC\b/.test(l.name) || /licenses\/[a-z-]*\bnc\b/i.test(l.url)) {
        return 'A non-commercial (NC) licence does not allow a podcast that earns money';
    }
    if (/no[-\s]?deriv/i.test(l.name) || /\bND\b/.test(l.name) || /licenses\/[a-z-]*\bnd\b/i.test(l.url)) {
        return 'A no-derivatives (ND) licence does not allow trimming, fading or mixing the file';
    }
    return null;
}

// What must be filled in before a licence can be marked checked.
export function licenceMissing(l: Licence): string[] {
    const missing: string[] = [];
    if (!l.sourceUrl) missing.push('where it came from');
    if (!l.name) missing.push("the licence's name");
    if (!l.url) missing.push("the licence's web page");
    if (!l.downloadedOn) missing.push('the download date');
    if (!l.proofPath) missing.push('a snapshot of the licence page');
    return missing;
}

// One use of a library file, so a Content ID claim can be traced to its licence.
export interface LibraryUse { episodeId: string; kind: 'episode' | 'short'; ref: string; at: string }

export interface LibraryEntry {
    id: string;
    kind: LibraryKind;
    path: string;                 // Cloud Storage, library/
    name: string;
    durationMs: number | null;
    licence: Licence;
    checked: LicenceCheck | null;
    uses: LibraryUse[];
    url?: string | null;          // a short-lived link for the browser
    proofUrl?: string | null;
}

// ─── sounds on the timeline ─────────────────────────────────────────────────

// The tracks: A2 music, A3 effects (A1 is the voice).
export const SOUND_TRACK = { music: 2, effects: 3 } as const;
export const SOUND_TRACK_LABELS: Record<number, string> = { 2: 'A2 Music', 3: 'A3 Effects' };
export const SOUNDS_MAX = 200;

// Where a sound's file is: the show library, or the episode's own media.
export const SoundPathSchema = z.string().max(300)
    .regex(/^(library\/[\w.-]+|episodes\/[\w-]{10,}\/media\/[\w.-]+)$/, 'Not a Studio sound')
    .refine(p => !p.includes('..'), 'Not a Studio sound');

export const SoundSchema = z.object({
    id: z.string().regex(/^[\w-]{1,40}$/),
    track: z.number().int().min(SOUND_TRACK.music).max(SOUND_TRACK.effects),
    media: z.object({ path: SoundPathSchema, name: z.string().trim().max(150) }),
    library: z.string().regex(/^[\w-]{1,40}$/).optional(),   // the library entry, for its licence and credit
    anchor: AnchorSchema,
    durationMs: z.number().int().min(LAYER_MIN_MS).max(WHOLE_EPISODE_MS),
    inMs: z.number().int().min(0).max(24 * 3600_000),        // where in the file it starts
    loop: z.boolean(),                                        // start the file again when it ends (music beds)
    gainDb: z.number().min(-60).max(12),
    fadeInMs: z.number().int().min(0).max(10_000),
    fadeOutMs: z.number().int().min(0).max(10_000),
    duck: z.boolean(),                                        // lowered while anyone speaks
});
export type Sound = z.infer<typeof SoundSchema>;
export const SoundsSchema = z.array(SoundSchema).max(SOUNDS_MAX)
    .refine(ss => new Set(ss.map(s => s.id)).size === ss.length, 'Two sounds have the same id');

export const soundSpan = (s: Sound, ranges: KeptRange[], editedMs: number): Span | null => layerSpan(s, ranges, editedMs);

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

// A file as a sound. Music: a bed pinned at `atMs` of the edited episode to its end, looped, 18 dB down,
// fading in over 2 s and out over 3 s, ducked under the voice. An effect (or stinger): at `srcMs` of the
// recording, so it stays on its moment, for its own length, at full level, with 10 ms fades against clicks.
export function newSound(file: { path: string; name: string; durationMs?: number | null; library?: string }, kind: LibraryKind,
    at: { srcMs: number; atMs: number }): Sound {
    const base = { media: { path: file.path, name: file.name.slice(0, 150) }, ...(file.library ? { library: file.library } : {}), inMs: 0 };
    if (kind === 'music') {
        return {
            ...base, id: newId('m'), track: SOUND_TRACK.music, anchor: { atMs: Math.max(0, Math.round(at.atMs)) }, durationMs: WHOLE_EPISODE_MS,
            loop: true, gainDb: -18, fadeInMs: 2000, fadeOutMs: 3000, duck: true,
        };
    }
    const length = Math.max(LAYER_MIN_MS, Math.min(WHOLE_EPISODE_MS, Math.round(file.durationMs ?? 3000)));
    return {
        ...base, id: newId('e'), track: SOUND_TRACK.effects, anchor: { srcMs: Math.max(0, Math.round(at.srcMs)) }, durationMs: length,
        loop: false, gainDb: 0, fadeInMs: 10, fadeOutMs: 10, duck: false,
    };
}

// An episode upload counts as music when it is long enough to be a bed.
export const uploadKind = (durationMs: number | null | undefined): LibraryKind => ((durationMs ?? 0) >= 30_000 ? 'music' : 'effect');

// ─── the preview ────────────────────────────────────────────────────────────

export const DUCK_PREVIEW_DB = -12;     // about what the render's compressor takes off under speech
export const dbToGain = (db: number) => 10 ** (db / 20);

// How loud a sound is `nowMs` into the edited episode, as a gain (1 = as recorded), with its fades and,
// while someone speaks, the ducking; null when it is not playing.
export function soundGainAt(s: Pick<Sound, 'gainDb' | 'fadeInMs' | 'fadeOutMs' | 'duck'>, span: Span, nowMs: number, speaking: boolean): number | null {
    if (nowMs < span.startMs || nowMs >= span.endMs) return null;
    let g = dbToGain(s.gainDb + (s.duck && speaking ? DUCK_PREVIEW_DB : 0));
    const into = nowMs - span.startMs, left = span.endMs - nowMs;
    if (s.fadeInMs > 0 && into < s.fadeInMs) g *= into / s.fadeInMs;
    if (s.fadeOutMs > 0 && left < s.fadeOutMs) g *= left / s.fadeOutMs;
    return g;
}

// Where in its file a sound is at `nowMs`: from `inMs`, round again when it loops (the render loops the
// whole file and then skips `inMs`, so this is the same).
export function fileTimeAt(s: Pick<Sound, 'inMs' | 'loop'>, span: Span, nowMs: number, fileMs: number | null): number {
    const t = s.inMs + Math.max(0, nowMs - span.startMs);
    return s.loop && fileMs && fileMs > 0 ? t % fileMs : t;
}

// ─── the render (ffmpeg) ────────────────────────────────────────────────────

const sec = (msVal: number) => (msVal / 1000).toFixed(3);

// One sound, from its input (looped with -stream_loop when it loops), trimmed, set to its level, faded
// (at least 10 ms, so it never clicks) and placed at its start in the edited episode.
export function soundFilter(inputIdx: number, outLabel: string, s: Sound, span: Span): string {
    const dur = span.endMs - span.startMs;
    const fadeIn = Math.min(Math.max(10, s.fadeInMs), dur / 2), fadeOut = Math.min(Math.max(10, s.fadeOutMs), dur / 2);
    const delay = Math.round(span.startMs);
    return `[${inputIdx}:a]atrim=start=${sec(s.inMs)}:duration=${sec(dur)},asetpts=PTS-STARTPTS,` +
        `aformat=sample_rates=48000:channel_layouts=stereo,volume=${s.gainDb}dB,` +
        `afade=t=in:d=${sec(fadeIn)},afade=t=out:st=${sec(dur - fadeOut)}:d=${sec(fadeOut)},adelay=${delay}|${delay}[${outLabel}];`;
}

// The ducking, from Part H's musicMix: everything to duck is mixed into one bed, which a compressor keyed
// by the voice lowers while anyone speaks (10-15 dB at speaking level, about -18 dBFS), then the voice, the ducked bed
// and every other sound are mixed without changing the voice's level, for exactly the voice's length.
export const DUCK = 'threshold=0.02:ratio=6:attack=20:release=500';
export function soundsMix(voice: string, ducked: string[], others: string[], outLabel: string): string {
    if (!ducked.length && !others.length) return `[${voice}]anull[${outLabel}];`;
    let f = '';
    const inputs = [`[${voice}]`];
    if (ducked.length) {
        f += `[${voice}]asplit=2[${outLabel}_v][${outLabel}_key];`;
        inputs[0] = `[${outLabel}_v]`;
        const bed = ducked.length > 1 ? `${outLabel}_bed` : ducked[0];
        if (ducked.length > 1) f += `${ducked.map(d => `[${d}]`).join('')}amix=inputs=${ducked.length}:normalize=0:duration=longest:dropout_transition=0[${bed}];`;
        f += `[${bed}][${outLabel}_key]sidechaincompress=${DUCK}[${outLabel}_duck];`;
        inputs.push(`[${outLabel}_duck]`);
    }
    inputs.push(...others.map(o => `[${o}]`));
    return f + `${inputs.join('')}amix=inputs=${inputs.length}:normalize=0:duration=first:dropout_transition=0[${outLabel}];`;
}

// ─── credits ────────────────────────────────────────────────────────────────

// The credits the rendered episode owes: the credit text of every library file it plays, once each, in
// the order they first play.
export function soundCredits(sounds: { sound: Sound; span: Span | null }[], library: Map<string, Pick<LibraryEntry, 'licence'>>): string[] {
    const out: string[] = [];
    for (const { sound, span } of [...sounds].sort((a, b) => (a.span?.startMs ?? Infinity) - (b.span?.startMs ?? Infinity))) {
        if (!span || !sound.library) continue;
        const credit = library.get(sound.library)?.licence.credit.trim();
        if (credit && !out.includes(credit)) out.push(credit);
    }
    return out;
}
