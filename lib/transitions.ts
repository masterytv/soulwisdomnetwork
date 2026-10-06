// Why: transitions where sections and parts meet (spec 020 item E4): at the start and end of the
// video, between the teasers, the intro, the episode and the outro, and at the splits inside the
// episode. A transition overlaps the two clips it joins, so the video is shorter by its length;
// lib/sequence.ts moves every time after it. Cut (none) is the default everywhere. The kinds are the
// ones rendered with the runners' ffmpeg 6.1 on 5 October 2026 (xfade for the picture, acrossfade
// for the sound); the Studio's names are what editors call them.

import { z } from 'zod';

export const TRANSITIONS = [
    'cut', 'dissolve', 'fade', 'fadeWhite', 'grain',
    'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown',
    'slideLeft', 'slideRight', 'slideUp', 'slideDown',
    'softLeft', 'softRight', 'softUp', 'softDown',
    'circleOpen', 'circleClose', 'zoomIn', 'blur',
] as const;
export type TransitionKind = typeof TRANSITIONS[number];

export const TRANSITION_LABELS: Record<TransitionKind, string> = {
    cut: 'Cut', dissolve: 'Dissolve', fade: 'Fade (through black)', fadeWhite: 'Fade through white', grain: 'Grain dissolve',
    wipeLeft: 'Wipe left', wipeRight: 'Wipe right', wipeUp: 'Wipe up', wipeDown: 'Wipe down',
    slideLeft: 'Slide left', slideRight: 'Slide right', slideUp: 'Slide up', slideDown: 'Slide down',
    softLeft: 'Soft wipe left', softRight: 'Soft wipe right', softUp: 'Soft wipe up', softDown: 'Soft wipe down',
    circleOpen: 'Circle open', circleClose: 'Circle close', zoomIn: 'Zoom in', blur: 'Blur',
};

// ffmpeg's own names (xfade). Its "dissolve" is a grainy pixel effect, so the smooth one is "fade".
export const XFADE: Record<Exclude<TransitionKind, 'cut'>, string> = {
    dissolve: 'fade', fade: 'fadeblack', fadeWhite: 'fadewhite', grain: 'dissolve',
    wipeLeft: 'wipeleft', wipeRight: 'wiperight', wipeUp: 'wipeup', wipeDown: 'wipedown',
    slideLeft: 'slideleft', slideRight: 'slideright', slideUp: 'slideup', slideDown: 'slidedown',
    softLeft: 'smoothleft', softRight: 'smoothright', softUp: 'smoothup', softDown: 'smoothdown',
    circleOpen: 'circleopen', circleClose: 'circleclose', zoomIn: 'zoomin', blur: 'hblur',
};

// The joins between the video's sections. Teasers, the intro and the outro come from the Studio
// settings (spec 018); a join with nothing on one side does not happen.
export const SECTION_JOINS = ['start', 'betweenTeasers', 'afterTeasers', 'afterIntro', 'beforeOutro', 'end'] as const;
export type SectionJoin = typeof SECTION_JOINS[number];

export const SECTION_JOIN_LABELS: Record<SectionJoin, string> = {
    start: 'Start of the video', betweenTeasers: 'Between teaser clips', afterTeasers: 'After the teasers',
    afterIntro: 'After the intro', beforeOutro: 'Before the outro', end: 'End of the video',
};

export interface Transition { transition: TransitionKind; durationMs: number }
export type JoinAt = SectionJoin | { atSplit: number };
export interface Join extends Transition { at: JoinAt }

// A transition's length, 0.2 to 3 s, 0.5 s unless chosen; the lengths offered.
export const JOIN_MS = { min: 200, max: 3000, default: 500 } as const;
export const JOIN_LENGTHS = [200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000];
export const CUT: Transition = { transition: 'cut', durationMs: JOIN_MS.default };

export const TransitionSchema = z.object({
    transition: z.enum(TRANSITIONS),
    durationMs: z.number().int().min(JOIN_MS.min).max(JOIN_MS.max),
}).strict();

// Where a join is, as a key: the section join's name, or `split:<ms>`.
export const joinKey = (at: JoinAt) => typeof at === 'string' ? at : `split:${at.atSplit}`;

// What the Studio may save on an edit (app/api/studio/episodes/[id]/edit): one transition a place.
export const MAX_JOINS = 500;
export const JoinsSchema = z.array(TransitionSchema.extend({
    at: z.union([z.enum(SECTION_JOINS), z.object({ atSplit: z.number().int().min(0).max(24 * 3600_000) }).strict()]),
}).strict()).max(MAX_JOINS).refine(joins => new Set(joins.map(j => joinKey(j.at))).size === joins.length, 'Each place has one transition');

// The Studio settings' section joins: every one a straight cut until the producer chooses.
export type SectionJoins = Record<SectionJoin, Transition>;
export const DEFAULT_SECTION_JOINS: SectionJoins = Object.fromEntries(SECTION_JOINS.map(k => [k, CUT])) as SectionJoins;
export const SectionJoinsSchema = z.object(Object.fromEntries(SECTION_JOINS.map(k => [k, TransitionSchema])) as Record<SectionJoin, typeof TransitionSchema>);

// The transition at a section join: the edit's own, or the Studio's default.
export function sectionJoins(joins: Join[] | undefined, defaults: SectionJoins = DEFAULT_SECTION_JOINS): SectionJoins {
    const out = { ...defaults };
    for (const j of joins ?? []) if (typeof j.at === 'string') out[j.at] = { transition: j.transition, durationMs: j.durationMs };
    return out;
}

// The joins with one place set (or, with null, back to the default: a cut at a split, the Studio's
// choice at a section join).
export function setJoin(joins: Join[] | undefined, at: JoinAt, t: Transition | null): Join[] {
    const key = joinKey(at);
    const rest = (joins ?? []).filter(j => joinKey(j.at) !== key);
    return t ? [...rest, { at, transition: t.transition, durationMs: t.durationMs }] : rest;
}

// The transitions at splits that are there, sorted; cuts and joins whose split is gone are left out.
export function splitTransitions(joins: Join[] | undefined, splits: number[] | undefined): { atMs: number; transition: Exclude<TransitionKind, 'cut'>; durationMs: number }[] {
    const have = new Set(splits ?? []);
    return (joins ?? [])
        .flatMap(j => typeof j.at === 'object' && have.has(j.at.atSplit) && j.transition !== 'cut'
            ? [{ atMs: j.at.atSplit, transition: j.transition as Exclude<TransitionKind, 'cut'>, durationMs: j.durationMs }] : [])
        .sort((a, b) => a.atMs - b.atMs);
}

// What an edit has that only the Studio editor shows, in a line for the quick edit: "2 splits, 1
// transition, 3 on-screen items". Empty when it has none.
export function studioOnlySummary(edit: { splits?: number[]; joins?: Join[]; overlays?: unknown[]; layers?: unknown[]; audio?: unknown[] }): string {
    const splits = edit.splits?.length ?? 0;
    const transitions = (edit.joins ?? []).filter(j => j.transition !== 'cut' && (typeof j.at === 'string' || (edit.splits ?? []).includes(j.at.atSplit))).length;
    // Layers (spec 020 item E5) replace the overlays once saved.
    const overlays = (edit.layers ?? edit.overlays)?.length ?? 0;
    const n = (count: number, one: string, many: string) => count ? [`${count} ${count === 1 ? one : many}`] : [];
    // And music and effects (item E7).
    return [...n(splits, 'split', 'splits'), ...n(transitions, 'transition', 'transitions'), ...n(overlays, 'on-screen item', 'on-screen items'),
        ...n(edit.audio?.length ?? 0, 'sound', 'sounds')].join(', ');
}
