// The edits a person can make on the speaker review page, as pure functions over the
// corrections layer (types/episode.ts). Each returns a new object; nothing is mutated.

import { rootLabel, type Line } from "@/lib/transcript";
import type { TranscriptCorrections } from "@/types/episode";

type C = TranscriptCorrections;

export function rename(c: C, label: string, name: string): C {
    return { ...c, speakers: { ...c.speakers, [label]: { clip: c.speakers[label]?.clip ?? false, name } } };
}

// `name` is what the rename box shows, so ticking Clip keeps a detected name.
export function setClip(c: C, label: string, clip: boolean, name: string): C {
    return { ...c, speakers: { ...c.speakers, [label]: { name: c.speakers[label]?.name ?? name, clip } } };
}

export function addVoice(c: C): { corrections: C; label: string } {
    let n = 1;
    while (c.speakers[`N${n}`]) n++;
    const label = `N${n}`;
    return { corrections: { ...c, speakers: { ...c.speakers, [label]: { name: "", clip: false } } }, label };
}

// `label` is the same person as `into`. Voices already merged into `label` follow it.
export function merge(c: C, label: string, into: string): C {
    const mergedInto = { ...c.mergedInto, [label]: into };
    for (const [from, to] of Object.entries(mergedInto)) if (to === label) mergedInto[from] = into;
    return { ...c, mergedInto };
}

export function unmerge(c: C, label: string): C {
    const mergedInto = { ...c.mergedInto };
    delete mergedInto[label];
    return { ...c, mergedInto };
}

export function reassign(c: C, line: Line, label: string): C {
    const next = { ...c.reassign };
    if (label === rootLabel(c, line.detectedLabel)) delete next[line.id];
    else next[line.id] = label;
    return { ...c, reassign: next };
}

// Starts a new line at `word` (an index within the utterance). The new line keeps the
// speaker the whole line had.
export function split(c: C, line: Line, word: number): C {
    const splits = [...new Set([...(c.splits[line.utterance] ?? []), word])].sort((a, b) => a - b);
    const next: C = { ...c, splits: { ...c.splits, [line.utterance]: splits } };
    const chosen = c.reassign[line.id];
    if (chosen) next.reassign = { ...c.reassign, [`${line.utterance}:${word}`]: chosen };
    return next;
}

// Undoes a split: the line joins the one above it.
export function join(c: C, line: Line): C {
    const splits = (c.splits[line.utterance] ?? []).filter(w => w !== line.wordStart);
    const nextSplits = { ...c.splits };
    if (splits.length) nextSplits[line.utterance] = splits;
    else delete nextSplits[line.utterance];
    const nextReassign = { ...c.reassign };
    delete nextReassign[line.id];
    return { ...c, splits: nextSplits, reassign: nextReassign, dismissed: c.dismissed.filter(id => id !== line.id) };
}

export function dismiss(c: C, line: Line): C {
    return { ...c, dismissed: [...c.dismissed, line.id] };
}
