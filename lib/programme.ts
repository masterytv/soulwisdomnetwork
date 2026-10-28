// Why: the whole video as the Studio editor shows it and the render makes it (spec 020 item E10): the "In this
// episode" teasers, the intro, the edited episode and the outro, in that order. The teasers are stretches of the
// recording saved on the edit (`edit.teasers`), so what the editor plays is what the render cuts. And the edit an
// episode opens with the first time (firstEdit): its filler words, stammers, missed "um"s and long pauses already
// cut, each one a cut that can be brought back on its own, and its teasers placed from the approved notes.

import { z } from 'zod';
import { replaceSuggestions, suggestCuts, SUGGESTED_REASONS, type EpisodeEdit, type Silence } from './edit';
import type { SpokenWord } from './showNotes';
import { SECTION_JOIN_LABELS, TransitionSchema, type SectionJoin, type SectionJoins, type Transition, type TransitionKind } from './transitions';
import { LAYER_MIN_MS, TRACK, type GraphicLayer } from './layers';
import { SoundSchema, teaserMusicSound, teaserSoundPlan, teaserWhooshSound, type Sound, type TeaserSound } from './audio';
import { GRAPHIC_MAX_MS } from './graphics';

// A teaser: a stretch of the recording played before the intro, with the "In this episode" tag and its speaker; `tag`
// false takes the tag off that teaser (item E14).
// `id` is the clip it is in the whole video (spec 022), carried through the editor's teaser actions so the sounds on a
// clip stay on it; it is never saved on a teaser.
export interface Teaser { startMs: number; endMs: number; speaker: string; tag?: boolean; id?: string }

// Breathing room around a clip the notes picked, and its shortest length: as the edit package has always cut them.
export const TEASER_LEAD_MS = 300;
export const TEASER_TAIL_MS = 600;
export const TEASER_MIN_MS = 1000;
export const MAX_TEASERS = 12;

const ms = z.number().min(0).max(24 * 3600_000).transform(Math.round);
export const TeasersSchema = z.array(z.object({
    startMs: ms,
    endMs: ms,
    speaker: z.string().max(200),
    tag: z.boolean().optional(),
}).strict().refine(t => t.endMs > t.startMs, 'A teaser must end after it starts')).max(MAX_TEASERS);

// The teasers from the approved notes' clips, as the edit package cuts them: from TEASER_LEAD_MS before each clip
// to TEASER_TAIL_MS after it (at least TEASER_MIN_MS of the clip), inside the recording when its length is known.
export function teasersFromNotes(clips: { startMs: number; endMs: number; speaker: string }[], durationMs?: number): Teaser[] {
    return clips.filter(c => c.endMs > c.startMs).slice(0, MAX_TEASERS).flatMap(c => {
        const startMs = Math.max(0, Math.round(c.startMs - TEASER_LEAD_MS));
        let endMs = Math.round(Math.max(c.endMs, c.startMs + TEASER_MIN_MS) + TEASER_TAIL_MS);
        if (durationMs && durationMs > 0) endMs = Math.min(endMs, Math.round(durationMs));
        return endMs > startMs ? [{ startMs, endMs, speaker: c.speaker }] : [];
    });
}

// What the editor sets up the first time it opens an episode with no saved edit: every filler word, stammer, missed
// "um" and long pause cut (the same as "Mark filler words and long pauses"), and the teasers. `counts` says how many
// of each kind, for the note the editor shows.
export function firstEdit(edit: EpisodeEdit, o: { words: SpokenWord[]; silences: Silence[] | null; teasers: Teaser[] }): {
    edit: EpisodeEdit; counts: Partial<Record<'filler' | 'repeat' | 'pause', number>>;
} {
    const fresh = suggestCuts(o.words, { silences: o.silences });
    const counts: Partial<Record<'filler' | 'repeat' | 'pause', number>> = {};
    for (const c of fresh) if (c.reason === 'filler' || c.reason === 'repeat' || c.reason === 'pause') counts[c.reason] = (counts[c.reason] ?? 0) + 1;
    return {
        edit: { ...edit, cuts: replaceSuggestions(edit.cuts, fresh, SUGGESTED_REASONS), teasers: edit.teasers ?? o.teasers },
        counts,
    };
}

// ─── The programme ────────────────────────────────────────────────────────────

// A teaser is a recording clip (spec 022).
export type PieceKind = 'teaser' | 'intro' | 'episode' | 'outro';

// A piece of the programme: where it starts, how long it is, and how much of it the transition from the piece before
// overlaps (0 for a straight cut), and which transition that is ('cut' when joinMs is 0). `index` numbers the teasers
// (the recording clips, spec 022) and `id` is the clip's.
// Starlight (spec 021) overlaps nothing — the drawn clip covers the straight cut — so a piece it leads into has
// joinMs 0, transition 'starlight' and the clip's length as `starlightMs`.
export interface ProgrammePiece { kind: PieceKind; index: number; id: string; atMs: number; lengthMs: number; joinMs: number; transition: TransitionKind; starlightMs?: number }

export interface Programme {
    pieces: ProgrammePiece[];
    lengthMs: number;
    // Where the edited episode starts: everything over it (layers, captions, chapters) moves this much later.
    episodeAtMs: number;
    // Transitions that play as straight cuts, and why.
    warnings: string[];
}

// Where the edited episode is in the recording `ms` into it, its kept stretches in play order (the preview's hand-over
// after a transition into the episode, item E16); past the end, the last stretch's end.
export function recordingAt(ranges: { startMs: number; endMs: number }[], ms: number): number {
    let left = Math.max(0, ms);
    for (const r of ranges) {
        const len = r.endMs - r.startMs;
        if (left < len) return r.startMs + left;
        left -= len;
    }
    return ranges.length ? ranges[ranges.length - 1].endMs : 0;
}

// How far into the edited episode a moment of the recording plays; null when it is cut.
export function playedAt(ranges: { startMs: number; endMs: number }[], srcMs: number): number | null {
    let at = 0;
    for (const r of ranges) {
        if (srcMs >= r.startMs && srcMs < r.endMs) return at + srcMs - r.startMs;
        at += r.endMs - r.startMs;
    }
    return null;
}

// The programme's pieces in order, joined as the render joins them (agent/src/podcast/editRender.ts `put`): the
// transition into each clip (clipJoins: its own, or the default for its kind of change) overlaps the two pieces, never
// more than the piece before has left after its own transition in, nor more than the piece itself; one too long plays
// as a straight cut. A clip that does not play (lengthMs null: an intro with no file) is left out; a length not known
// yet (an intro still loading) counts as 0.
export function programmeOf(o: { clips: TimedClip[]; sections: SectionJoins }): Programme {
    const pieces: ProgrammePiece[] = [];
    const warnings: string[] = [];
    let at = 0, prevLeft = 0, teasers = 0;
    for (const { clip, join: t, label } of clipJoins(o.clips, o.sections)) {
        const lengthMs = clip.lengthMs ?? 0;
        let joinMs = 0;
        const starlight = t?.transition === 'starlight';
        if (t && !starlight && t.transition !== 'cut') {
            if (t.durationMs <= prevLeft && t.durationMs <= lengthMs) joinMs = t.durationMs;
            else warnings.push(`${label}: the transition is longer than the clips around it, so it plays as a straight cut.`);
        }
        at -= joinMs;
        const kind: PieceKind = clip.kind === 'recording' ? 'teaser' : clip.kind;
        pieces.push({
            kind, index: kind === 'teaser' ? teasers++ : 0, id: clip.id, atMs: at, lengthMs, joinMs,
            transition: joinMs ? t!.transition : starlight ? 'starlight' : 'cut',
            ...(starlight ? { starlightMs: t!.durationMs } : {}),
        });
        at += lengthMs;
        prevLeft = lengthMs - joinMs;
    }
    return { pieces, lengthMs: Math.max(0, at), episodeAtMs: pieces.find(p => p.kind === 'episode')?.atMs ?? 0, warnings };
}

// The whole video's clips with their lengths: a recording clip its stretch, the episode its edited length, the intro
// and outro their files' (null when there is none, or a length not known yet: 0).
export function timedClips(p: ProgrammeEdit, o: { introMs: number | null; outroMs: number | null; episodeMs: number }): TimedClip[] {
    return p.clips.map(c => ({
        kind: c.kind, id: c.id, ...(c.join ? { join: c.join } : {}),
        lengthMs: c.kind === 'recording' ? c.outMs - c.inMs : c.kind === 'episode' ? o.episodeMs : c.kind === 'intro' ? o.introMs : o.outroMs,
    }));
}

// A piece's name, as the editor shows it.
export function pieceLabel(p: { kind: PieceKind; index: number }): string {
    return p.kind === 'teaser' ? `Teaser ${p.index + 1}` : p.kind === 'intro' ? 'Intro' : p.kind === 'outro' ? 'Outro' : 'Episode';
}

// ─── The intro and outro ──────────────────────────────────────────────────────

// The show's intro, in the site's files (public/studio/show-intro.mp4): the render reads the file, the editor plays it.
export const SHOW_INTRO_URL = '/studio/show-intro.mp4';

// The Studio's intro, also its outro (spec 018), as the render picks it: your own uploaded one; the show's (the edit
// package's copy when there is a package, else the site's file: 'site'); or none. An episode's own intro and outro
// (`edit.intro`, `edit.outro`, spec 020 item E9) replace it.
export function studioIntro(settings: { intro: 'show' | 'custom' | 'none'; introPath: string | null }, pkg?: { introPath?: string | null } | null): { path: string } | 'site' | null {
    if (settings.intro === 'custom') return settings.introPath ? { path: settings.introPath } : null;
    if (settings.intro === 'show') return pkg ? (pkg.introPath ? { path: pkg.introPath } : null) : 'site';
    return null;
}

// ─── Trimming and reordering teasers (spec 020 item E12) ──────────────────────

// A teaser keeps at least this much.
export const TEASER_SHORTEST_MS = 500;

// The teasers with the one at `from` moved to `to` (play positions).
export function moveTeaser(teasers: Teaser[], from: number, to: number): Teaser[] {
    if (from === to || from < 0 || from >= teasers.length || to < 0 || to >= teasers.length) return teasers;
    const out = [...teasers];
    const [t] = out.splice(from, 1);
    out.splice(to, 0, t);
    return out;
}

// The teasers with one's start or end moved to `ms` of the recording: inside the recording (when its length is
// known), and TEASER_SHORTEST_MS short of its other end.
export function trimTeaser(teasers: Teaser[], index: number, edge: 'start' | 'end', ms: number, durationMs?: number): Teaser[] {
    const t = teasers[index];
    if (!t) return teasers;
    const top = durationMs && durationMs > 0 ? durationMs : Infinity;
    const v = Math.round(ms);
    const next = edge === 'start'
        ? { ...t, startMs: Math.max(0, Math.min(v, t.endMs - TEASER_SHORTEST_MS)) }
        : { ...t, endMs: Math.min(top, Math.max(v, t.startMs + TEASER_SHORTEST_MS)) };
    if (next.startMs === t.startMs && next.endMs === t.endMs) return teasers;
    return teasers.map((x, i) => (i === index ? next : x));
}

// ─── Teasers made on the timeline (spec 020 item E14) ─────────────────────────

// The teasers with a stretch of the recording added at place `at` (a section or a stretch chosen on the timeline, copied
// and pasted, or "Make teaser"), its speaker the one heard first in it; unchanged when there are MAX_TEASERS already, or
// the stretch is shorter than TEASER_SHORTEST_MS.
export function addTeaser(teasers: Teaser[], stretch: { startMs: number; endMs: number }, at: number, words: { start: number; end: number; speaker: string }[]): Teaser[] {
    const startMs = Math.round(stretch.startMs), endMs = Math.round(stretch.endMs);
    if (teasers.length >= MAX_TEASERS || endMs - startMs < TEASER_SHORTEST_MS) return teasers;
    const speaker = (words.find(w => w.end > startMs && w.start < endMs)?.speaker ?? '').slice(0, 200);
    const out = [...teasers];
    out.splice(Math.max(0, Math.min(teasers.length, at)), 0, { startMs, endMs, speaker });
    return out;
}

// The teasers with one's "In this episode" tag changed: its name, or on and off.
export function setTeaserTag(teasers: Teaser[], index: number, change: { speaker?: string; tag?: boolean }): Teaser[] {
    const t = teasers[index];
    if (!t) return teasers;
    const next: Teaser = { ...t, ...(change.speaker !== undefined ? { speaker: change.speaker.trim().slice(0, 200) } : {}) };
    if (change.tag === false) next.tag = false;
    else if (change.tag === true) delete next.tag;
    return teasers.map((x, i) => (i === index ? next : x));
}

// ─── Picking a teaser's words on the notes page (spec 020 item E14, part 2) ───

// How much of the transcript is shown either side of a teaser clip for picking its words.
export const PICK_CONTEXT_MS = 8000;

// The words around a clip (from PICK_CONTEXT_MS before it starts to as long after it ends), each marked inside it or not.
export function wordsAround<W extends { start: number; end: number }>(words: W[], clip: { startMs: number; endMs: number }, contextMs = PICK_CONTEXT_MS): { word: W; inside: boolean }[] {
    return words
        .filter(w => w.end > clip.startMs - contextMs && w.start < clip.endMs + contextMs)
        .map(word => ({ word, inside: word.start >= clip.startMs - 1 && word.end <= clip.endMs + 1 }));
}

// The clip with a word picked: before the clip's middle, the clip starts at that word; after it, it ends with it. A pick
// that would leave it shorter than TEASER_SHORTEST_MS moves the other end too (the clip is that one word). Its text is
// then the words in it, and its speaker the first one's.
export function pickTeaserWord<W extends { text: string; start: number; end: number; speaker: string }>(
    words: W[], clip: { startMs: number; endMs: number }, word: W,
): { startMs: number; endMs: number; text: string; speaker: string } {
    const middle = (clip.startMs + clip.endMs) / 2;
    let startMs = clip.startMs, endMs = clip.endMs;
    if (word.start < middle) startMs = word.start; else endMs = word.end;
    if (endMs - startMs < TEASER_SHORTEST_MS) { startMs = word.start; endMs = Math.max(word.end, word.start + TEASER_SHORTEST_MS); }
    const inside = words.filter(w => w.start >= startMs - 1 && w.end <= endMs + 1);
    return { startMs, endMs, text: inside.map(w => w.text).join(' '), speaker: inside[0]?.speaker ?? word.speaker };
}

// ─── The whole video as clips (spec 022) ──────────────────────────────────────

// V1 is a list of clips in play order (`edit.programme`): the edited episode once, the intro and outro at most once
// each, and recording clips, each a stretch of the recording played as it is (what a teaser was). Each clip may carry
// the transition into it (`join`); without one it gets the default for its kind of change (changeJoin). Graphics on a
// clip other than the episode are `layers` anchored to it (`{ clip, ms }`): drawn on that clip before it is joined to
// its neighbours, ending with it at the latest. Stage 2 holds what the old fields held (the teasers, their "In this
// episode" label, the intro and outro on or off), so an edit converts both ways without loss (programmeEdit,
// legacyFields); stage 3 opens up the rest.

export type ClipKind = 'recording' | 'intro' | 'episode' | 'outro';
export type ProgrammeClip = { id: string; join?: Transition } & (
    | { kind: 'recording'; inMs: number; outMs: number; name: string }
    | { kind: 'intro' }
    | { kind: 'episode' }
    | { kind: 'outro' }
);
export type RecordingClip = Extract<ProgrammeClip, { kind: 'recording' }>;
export interface ClipAnchor { clip: string; ms: number }
// The "In this episode" label on a clip (stage 2: the teaser's tag; any graphic in stage 3b).
export type ProgrammeLayer = Omit<Extract<GraphicLayer, { template: 'teaserTag' }>, 'anchor'> & { anchor: ClipAnchor };
// A sound on a clip other than the episode (stage 3a): on the whole video's clock from `ms` after its clip starts (it may
// lead into the clip by up to MAX_LEAD_MS), across changes, to the end of the video at the latest.
export type ProgrammeSound = Omit<Sound, 'anchor'> & { anchor: ClipAnchor };
// `audio` missing (saved before stage 3a): the Studio settings' old teaser music and whoosh, converted (programmeEdit).
export interface ProgrammeEdit { clips: ProgrammeClip[]; layers: ProgrammeLayer[]; audio?: ProgrammeSound[] }

export const MAX_CLIPS = 40;
export const MAX_CLIP_LAYERS = 100;
export const MAX_CLIP_SOUNDS = 100;
export const MAX_LEAD_MS = 10_000;
// The episode and the intro and outro have these ids; a recording clip's is its own.
export const EPISODE_CLIP = 'episode', INTRO_CLIP = 'intro', OUTRO_CLIP = 'outro';

const clipId = z.string().regex(/^[\w-]{1,40}$/);
const RecordingClipSchema = z.object({
    id: clipId, kind: z.literal('recording'), inMs: ms, outMs: ms, name: z.string().trim().max(200), join: TransitionSchema.optional(),
}).strict().refine(c => c.outMs - c.inMs >= TEASER_SHORTEST_MS, `A clip keeps at least ${TEASER_SHORTEST_MS / 1000} s`);
const fixedClip = <K extends 'intro' | 'episode' | 'outro'>(kind: K, id: string) =>
    z.object({ id: z.literal(id), kind: z.literal(kind), join: TransitionSchema.optional() }).strict();
const ProgrammeLayerSchema = z.object({
    id: z.string().regex(/^[\w-]{1,40}$/),
    track: z.number().int().min(2).max(9),
    anchor: z.object({ clip: clipId, ms: z.literal(0) }).strict(),
    durationMs: z.number().int().min(LAYER_MIN_MS).max(GRAPHIC_MAX_MS),
    opacity: z.number().min(0).max(1),
    in: z.object({ transition: z.literal('none'), durationMs: z.literal(0) }).strict(),
    out: z.object({ transition: z.literal('none'), durationMs: z.literal(0) }).strict(),
    kind: z.literal('graphic'),
    template: z.literal('teaserTag'),
    fields: z.object({ speaker: z.string().trim().max(200) }).strict(),
}).strict();

const ProgrammeSoundSchema = SoundSchema.omit({ anchor: true }).extend({
    anchor: z.object({ clip: clipId, ms: z.number().int().min(-MAX_LEAD_MS).max(24 * 3600_000) }).strict(),
}).strict();

// What the Studio may save as `edit.programme` (app/api/studio/episodes/[id]/edit).
export const ProgrammeSchema = z.object({
    clips: z.array(z.union([RecordingClipSchema, fixedClip('intro', INTRO_CLIP), fixedClip('episode', EPISODE_CLIP), fixedClip('outro', OUTRO_CLIP)])).max(MAX_CLIPS),
    layers: z.array(ProgrammeLayerSchema).max(MAX_CLIP_LAYERS),
    audio: z.array(ProgrammeSoundSchema).max(MAX_CLIP_SOUNDS).optional(),
}).strict().superRefine((p, ctx) => {
    const ids = p.clips.map(c => c.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Two clips have the same id' });
    if (p.clips.filter(c => c.kind === 'episode').length !== 1) ctx.addIssue({ code: 'custom', message: 'The episode must be on the timeline once' });
    if (new Set(p.layers.map(l => l.id)).size !== p.layers.length) ctx.addIssue({ code: 'custom', message: 'Two graphics have the same id' });
    for (const l of p.layers) {
        const on = p.clips.find(c => c.id === l.anchor.clip);
        if (!on || on.kind === 'episode') ctx.addIssue({ code: 'custom', message: 'A graphic is on a clip that is not there' });
    }
    const audio = p.audio ?? [];
    if (new Set(audio.map(s => s.id)).size !== audio.length) ctx.addIssue({ code: 'custom', message: 'Two sounds have the same id' });
    for (const a of audio) {
        const on = p.clips.find(c => c.id === a.anchor.clip);
        if (!on || on.kind === 'episode') ctx.addIssue({ code: 'custom', message: 'A sound is on a clip that is not there' });
    }
});

// How long an "In this episode" label is on a clip of `lengthMs`: the whole clip, at least a second (the motion tag's
// shortest drawing) and at most the longest graphic, as the render has drawn the teaser's tag since spec 021.
export const labelLength = (lengthMs: number) => Math.max(1000, Math.min(Math.round(lengthMs), GRAPHIC_MAX_MS));

// The "In this episode" label on a clip.
export function clipLabel(clip: string, speaker: string, lengthMs: number): ProgrammeLayer {
    return {
        id: `tag-${clip}`.slice(0, 40), kind: 'graphic', template: 'teaserTag', track: TRACK.text,
        anchor: { clip, ms: 0 }, durationMs: labelLength(lengthMs), opacity: 1,
        in: { transition: 'none', durationMs: 0 }, out: { transition: 'none', durationMs: 0 },
        fields: { speaker: speaker.trim().slice(0, 200) },
    };
}

// The opening as clips from a list of teasers: a recording clip each, named by its speaker, with its label unless its
// tag was taken off.
// Each teaser keeps the clip id it carries (`id`, once, and not one of the fixed clips'); one without gets `t<n>` (as a
// converted edit's are numbered) or, when that is taken, a new one.
function openingOf(teasers: Teaser[], taken: Set<string> = new Set(), retired: Set<string> = new Set()): ProgrammeEdit & { audio: ProgrammeSound[] } {
    const used = new Set(taken);
    const ids = teasers.map(t => {
        const ok = t.id && /^[\w-]{1,40}$/.test(t.id) && !used.has(t.id) && ![EPISODE_CLIP, INTRO_CLIP, OUTRO_CLIP].includes(t.id);
        if (ok) used.add(t.id!);
        return ok ? t.id! : null;
    });
    const fresh = () => { let n = 1; while (used.has(`t${n}`) || retired.has(`t${n}`) || ids.includes(`t${n}`)) n++; used.add(`t${n}`); return `t${n}`; };
    const named = ids.map(id => id ?? fresh());
    const clips: ProgrammeClip[] = teasers.map((t, i) => ({ id: named[i], kind: 'recording', inMs: t.startMs, outMs: t.endMs, name: t.speaker }));
    const layers = teasers.flatMap((t, i) => (t.tag === false ? [] : [clipLabel(named[i], t.speaker, t.endMs - t.startMs)]));
    return { clips, layers, audio: [] };
}

// The edit's whole video: its own (`edit.programme`), or converted from what it had before spec 022: its teasers (or,
// saved before it had them, `fallback`: the approved notes' teaser clips, when the Studio plays teasers, as the editor
// shows them), then the intro unless it was taken out, the episode and the outro unless it was taken out.
// An edit saved before stage 3a (no `audio` on its whole video) gets the Studio settings' old teaser music and whoosh
// as sounds on its clips, when `old` gives them (oldTeaserSounds).
export function programmeEdit(edit: Pick<EpisodeEdit, 'programme' | 'teasers' | 'intro' | 'outro'>, fallback: Teaser[] = [], old?: OldTeaserSounds | null): ProgrammeEdit {
    const withSounds = (p: ProgrammeEdit): ProgrammeEdit => (p.audio || !old ? p : { ...p, audio: oldTeaserSounds(p, old) });
    if (edit.programme) return withSounds(edit.programme);
    const opening = openingOf(edit.teasers ?? fallback);
    return withSounds({
        clips: [
            ...opening.clips,
            ...(edit.intro === false ? [] : [{ id: INTRO_CLIP, kind: 'intro' as const }]),
            { id: EPISODE_CLIP, kind: 'episode' },
            ...(edit.outro === false ? [] : [{ id: OUTRO_CLIP, kind: 'outro' as const }]),
        ],
        layers: opening.layers,
    });
}

// The Studio settings' teaser music and whoosh as they were (lib/audio.ts), with what places them: the transitions
// between the teasers (the edit's or the Studio's) and the whoosh file's length (null: not known, 1.5 s).
export interface OldTeaserSounds { music: TeaserSound | null; whoosh: TeaserSound | null; whooshMs: number | null; sections: SectionJoins }

// The old teaser music and whoosh as sounds on the opening's clips (the recording clips before the episode), where the
// render mixed them (lib/audio.ts teaserSoundPlan): the bed on the first clip for the whole opening, the whoosh on each
// later one, at the middle of the transition into it less WHOOSH_LEAD_MS.
export function oldTeaserSounds(p: ProgrammeEdit, old: OldTeaserSounds): ProgrammeSound[] {
    const episode = p.clips.findIndex(c => c.kind === 'episode');
    const opening = p.clips.slice(0, episode).filter((c): c is RecordingClip => c.kind === 'recording');
    if (!opening.length) return [];
    const pg = programmeOf({ clips: opening.map(c => ({ kind: c.kind, id: c.id, lengthMs: c.outMs - c.inMs, ...(c.join ? { join: c.join } : {}) })), sections: old.sections });
    const plan = teaserSoundPlan(pg.pieces);
    const out: ProgrammeSound[] = [];
    const onClip = (s: Sound, clip: string, ms: number): ProgrammeSound => ({ ...s, anchor: { clip, ms: Math.round(ms) } });
    if (old.music && plan.music) out.push(onClip(teaserMusicSound(old.music, plan.music), opening[0].id, 0));
    if (old.whoosh) {
        pg.pieces.slice(1).forEach((piece, i) => {
            const at = plan.whooshes[i];
            out.push(onClip({ ...teaserWhooshSound(old.whoosh!, at, old.whooshMs), id: `teaserWhoosh${i + 1}` }, piece.id, at - piece.atMs));
        });
    }
    return out;
}

// The recording clips before the episode, as the teasers they were: their stretch, their label's name (else the clip's)
// and `tag` false when they have no label.
export function teasersOf(p: ProgrammeEdit, withIds = false): Teaser[] {
    const episode = p.clips.findIndex(c => c.kind === 'episode');
    return p.clips.slice(0, episode < 0 ? p.clips.length : episode).flatMap(c => {
        if (c.kind !== 'recording') return [];
        const label = p.layers.find(l => l.anchor.clip === c.id);
        return [{ startMs: c.inMs, endMs: c.outMs, speaker: label ? label.fields.speaker : c.name, ...(label ? {} : { tag: false as const }), ...(withIds ? { id: c.id } : {}) }];
    });
}

// The stretches of the recording the whole video plays again outside the episode (its recording clips), which a
// highlight must keep off (lib/reframe.ts highlightProblems).
export function clipStretches(edit: Pick<EpisodeEdit, 'programme' | 'teasers' | 'intro' | 'outro'>): { startMs: number; endMs: number }[] {
    return programmeEdit(edit).clips.flatMap(c => (c.kind === 'recording' ? [{ startMs: c.inMs, endMs: c.outMs }] : []));
}

// The whole video with its opening (the recording clips before the intro, or the episode) made from `teasers`, the
// teasers' actions of spec 020 (trim, move, take out, add, the tag's name) working on clips; the intro, the episode
// and the outro stay where they are.
// A teaser that carries its clip's id (teasersOf withIds, passed through the editor's actions) stays that clip, with
// its sounds; a clip whose teaser is gone takes its sounds with it.
export function withTeasers(p: ProgrammeEdit, teasers: Teaser[]): ProgrammeEdit {
    const before = p.clips.findIndex(c => c.kind !== 'recording');
    const rest = before < 0 ? [] : p.clips.slice(before);
    // A new teaser never takes the id of a clip that was there, so no sound of a clip taken out lands on it.
    const opening = openingOf(teasers, new Set(rest.map(c => c.id)), new Set(p.clips.map(c => c.id)));
    const kept = new Set([...rest, ...opening.clips].map(c => c.id));
    return {
        clips: [...opening.clips, ...rest],
        layers: [...opening.layers, ...p.layers.filter(l => rest.some(c => c.id === l.anchor.clip))],
        ...(p.audio ? { audio: p.audio.filter(s => kept.has(s.anchor.clip)) } : {}),
    };
}

// The whole video with the intro or outro taken out (spec 020 item E14's Delete).
export function withoutEnd(p: ProgrammeEdit, kind: 'intro' | 'outro'): ProgrammeEdit {
    const id = kind === 'intro' ? INTRO_CLIP : OUTRO_CLIP;
    return {
        clips: p.clips.filter(c => c.kind !== kind), layers: p.layers.filter(l => l.anchor.clip !== id),
        ...(p.audio ? { audio: p.audio.filter(s => s.anchor.clip !== id) } : {}),
    };
}

// The whole video with the intro or outro put back (the Parts panel's choice of one): the intro just before the
// episode, the outro just after it; unchanged when it is there.
export function withEnd(p: ProgrammeEdit, kind: 'intro' | 'outro'): ProgrammeEdit {
    if (p.clips.some(c => c.kind === kind)) return p;
    const at = p.clips.findIndex(c => c.kind === 'episode') + (kind === 'outro' ? 1 : 0);
    const clips = [...p.clips];
    clips.splice(at, 0, kind === 'intro' ? { id: INTRO_CLIP, kind: 'intro' } : { id: OUTRO_CLIP, kind: 'outro' });
    return { ...p, clips };
}

// The edit with its intro or outro chosen (the Parts panel): none takes the clip out, the Studio's or a file of its
// own puts it back where it goes.
export function setEnds<E extends EpisodeEdit>(edit: E, patch: Partial<Pick<EpisodeEdit, 'intro' | 'outro'>>, fallback: Teaser[] = []): E {
    let p = programmeEdit(edit, fallback);
    const next = { ...edit, ...patch };
    for (const kind of ['intro', 'outro'] as const) {
        if (!(kind in patch)) continue;
        p = patch[kind] === false ? withoutEnd(p, kind) : withEnd(p, kind);
    }
    return setProgramme(next, p);
}

// The old fields the whole video says, written with it on every save while code from before spec 022 still reads
// edits (the live site, and the jobs, until spec 022 is on `main`): its teasers, and the intro or outro false when it
// has none (the episode's own file stays as it is otherwise).
export function legacyFields(p: ProgrammeEdit, edit: Pick<EpisodeEdit, 'intro' | 'outro'>): Pick<EpisodeEdit, 'teasers' | 'intro' | 'outro'> {
    const has = (kind: ClipKind) => p.clips.some(c => c.kind === kind);
    return {
        teasers: teasersOf(p),     // without ids: old code checks teasers strictly
        intro: has('intro') ? (edit.intro || null) : false,
        outro: has('outro') ? (edit.outro || null) : false,
    };
}

// The edit with its whole video changed: `programme` and the old fields it says.
export function setProgramme<E extends EpisodeEdit>(edit: E, p: ProgrammeEdit): E {
    return { ...edit, programme: p, ...legacyFields(p, edit) };
}

// The section join that is the default for a change from a clip of kind `before` into one of kind `kind` (spec 022:
// the edit's or the Studio's, as the programme has always been joined); null for a straight cut.
export function changeJoin(before: ClipKind, kind: ClipKind): SectionJoin | null {
    if (before === 'recording') return kind === 'recording' ? 'betweenTeasers' : kind === 'intro' || kind === 'episode' ? 'afterTeasers' : null;
    if (before === 'intro' && kind === 'episode') return 'afterIntro';
    if (before === 'episode' && kind === 'outro') return 'beforeOutro';
    return null;
}

// A clip of the whole video as programmeOf joins it: its kind, id and length (null: it does not play, such as an
// intro with no file), and its own transition in.
export interface TimedClip { kind: ClipKind; id: string; lengthMs: number | null; join?: Transition }

// The transition into each clip that plays, as programmeOf and the render resolve it: its own, or the default for
// its kind of change (null for none: the first clip, or a straight cut by default), with the name its warning uses.
export function clipJoins(clips: TimedClip[], sections: SectionJoins, names: (c: TimedClip) => string = c => c.id): { clip: TimedClip; join: Transition | null; label: string; key: string }[] {
    const playing = clips.filter(c => c.lengthMs !== null);
    return playing.map((c, i) => {
        if (i === 0) return { clip: c, join: null, label: '', key: `clip:${c.id}` };
        const def = changeJoin(playing[i - 1].kind, c.kind);
        const join = c.join ?? (def ? sections[def] : null);
        return { clip: c, join, label: c.join || !def ? `Into ${names(c)}` : SECTION_JOIN_LABELS[def], key: `clip:${c.id}` };
    });
}
