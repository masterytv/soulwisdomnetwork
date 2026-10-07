// Why: the whole video as the Studio editor shows it and the render makes it (spec 020 item E10): the "In this
// episode" teasers, the intro, the edited episode and the outro, in that order. The teasers are stretches of the
// recording saved on the edit (`edit.teasers`), so what the editor plays is what the render cuts. And the edit an
// episode opens with the first time (firstEdit): its filler words, stammers, missed "um"s and long pauses already
// cut, each one a cut that can be brought back on its own, and its teasers placed from the approved notes.

import { z } from 'zod';
import { replaceSuggestions, suggestCuts, SUGGESTED_REASONS, type EpisodeEdit, type Silence } from './edit';
import type { SpokenWord } from './showNotes';
import { SECTION_JOIN_LABELS, type SectionJoin, type SectionJoins } from './transitions';

// A teaser: a stretch of the recording played before the intro, with the "In this episode" tag and its speaker.
export interface Teaser { startMs: number; endMs: number; speaker: string }

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

export type PieceKind = 'teaser' | 'intro' | 'episode' | 'outro';

// A piece of the programme: where it starts, how long it is, and how much of it the transition from the piece before
// overlaps (0 for a straight cut). `index` numbers the teasers.
export interface ProgrammePiece { kind: PieceKind; index: number; atMs: number; lengthMs: number; joinMs: number }

export interface Programme {
    pieces: ProgrammePiece[];
    lengthMs: number;
    // Where the edited episode starts: everything over it (layers, captions, chapters) moves this much later.
    episodeAtMs: number;
    // Transitions that play as straight cuts, and why.
    warnings: string[];
}

// The programme's pieces in order, joined as the render joins them (agent/src/podcast/editRender.ts `put`): the
// transition at each join overlaps the two pieces, never more than the piece before has left after its own
// transition in, nor more than the piece itself; one too long plays as a straight cut. A length not known yet
// (an intro still loading) counts as 0.
export function programmeOf(o: { teasers: number[]; introMs: number | null; outroMs: number | null; episodeMs: number; sections: SectionJoins }): Programme {
    const pieces: ProgrammePiece[] = [];
    const warnings: string[] = [];
    let at = 0, prevLeft = 0;
    const put = (kind: PieceKind, index: number, lengthMs: number, join: SectionJoin | null) => {
        const t = join && pieces.length ? o.sections[join] : null;
        let joinMs = 0;
        if (t && t.transition !== 'cut') {
            if (t.durationMs <= prevLeft && t.durationMs <= lengthMs) joinMs = t.durationMs;
            else warnings.push(`${SECTION_JOIN_LABELS[join!]}: the transition is longer than the clips around it, so it plays as a straight cut.`);
        }
        at -= joinMs;
        pieces.push({ kind, index, atMs: at, lengthMs, joinMs });
        at += lengthMs;
        prevLeft = lengthMs - joinMs;
    };
    o.teasers.forEach((len, i) => put('teaser', i, len, i > 0 ? 'betweenTeasers' : null));
    if (o.introMs !== null) put('intro', 0, o.introMs, o.teasers.length ? 'afterTeasers' : null);
    put('episode', 0, o.episodeMs, o.introMs !== null ? 'afterIntro' : o.teasers.length ? 'afterTeasers' : null);
    if (o.outroMs !== null) put('outro', 0, o.outroMs, 'beforeOutro');
    return { pieces, lengthMs: Math.max(0, at), episodeAtMs: pieces.find(p => p.kind === 'episode')!.atMs, warnings };
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
