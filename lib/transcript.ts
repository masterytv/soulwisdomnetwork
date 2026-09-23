// Speaker review (docs/specs/006-podcast-studio.md, page 2). AssemblyAI's transcript is
// never changed; a person's fixes are stored as a layer of corrections over it, and the
// lines shown on the review page are rebuilt from both. Shared by the page and the API
// routes, so the transcript that gets accepted is exactly the one on screen.

import type { DetectedSpeaker, TranscriptCorrections } from '@/types/episode';

export interface ReviewWord { text: string; start: number; end: number }

// One diarized utterance from raw.json, slimmed down for the browser.
export interface ReviewUtterance { label: string; words: ReviewWord[] }

export interface Line {
    id: string;              // `${utterance}:${first word}`; stable when a line is split
    utterance: number;
    wordStart: number;       // offset of the first word within the utterance
    words: ReviewWord[];
    start: number;           // ms
    end: number;
    text: string;
    detectedLabel: string;   // the voice AssemblyAI gave this line
    label: string;           // the voice after fixes and merges
    name: string;
    clip: boolean;
    changed: boolean;        // moved to another voice by hand
}

export interface Flag {
    toLabel: string;
    reason: string;
}

export const emptyCorrections = (): TranscriptCorrections => ({
    speakers: {}, mergedInto: {}, splits: {}, reassign: {}, dismissed: [],
});

// The voice a label ends up as after merges.
export function rootLabel(c: TranscriptCorrections, label: string) {
    const seen = new Set<string>();
    while (c.mergedInto[label] && !seen.has(label)) {
        seen.add(label);
        label = c.mergedInto[label];
    }
    return label;
}

export function speakerName(voices: DetectedSpeaker[], c: TranscriptCorrections, label: string) {
    const root = rootLabel(c, label);
    return c.speakers[root]?.name?.trim()
        || voices.find(v => v.label === root)?.suggestedName
        || `Speaker ${root}`;
}

export function isNamed(voices: DetectedSpeaker[], c: TranscriptCorrections, label: string) {
    return !!(c.speakers[label]?.name?.trim() || voices.find(v => v.label === label)?.suggestedName);
}

export function isClip(c: TranscriptCorrections, label: string) {
    return !!c.speakers[rootLabel(c, label)]?.clip;
}

// Every voice: the detected ones, then any added by hand.
export function allLabels(voices: DetectedSpeaker[], c: TranscriptCorrections) {
    const labels = voices.map(v => v.label);
    for (const label of Object.keys(c.speakers)) if (!labels.includes(label)) labels.push(label);
    return labels;
}

export function buildLines(utterances: ReviewUtterance[], voices: DetectedSpeaker[], c: TranscriptCorrections): Line[] {
    const lines: Line[] = [];
    utterances.forEach((u, ui) => {
        const cuts = [0, ...(c.splits[ui] ?? []).filter(w => w > 0 && w < u.words.length), u.words.length];
        for (let i = 0; i < cuts.length - 1; i++) {
            const words = u.words.slice(cuts[i], cuts[i + 1]);
            if (!words.length) continue;
            const id = `${ui}:${cuts[i]}`;
            const chosen = c.reassign[id] ?? u.label;
            const label = rootLabel(c, chosen);
            lines.push({
                id, utterance: ui, wordStart: cuts[i], words,
                start: words[0].start, end: words[words.length - 1].end,
                text: words.map(w => w.text).join(' '),
                detectedLabel: u.label, label,
                name: speakerName(voices, c, label),
                clip: isClip(c, label),
                changed: chosen !== u.label,
            });
        }
    });
    return lines;
}

const SHORT_WORDS = 4;

// Lines that are probably given to the wrong voice: the "Boom" pattern, a short line from
// one voice inside another voice's sentence or clip. A short reply between two complete
// sentences ("Yeah." "Agreed.") is normal conversation and is not flagged.
export function findFlags(lines: Line[], c: TranscriptCorrections): Map<string, Flag> {
    const flags = new Map<string, Flag>();
    for (let i = 1; i < lines.length - 1; i++) {
        const [prev, line, next] = [lines[i - 1], lines[i], lines[i + 1]];
        if (c.dismissed.includes(line.id) || line.changed) continue;
        if (line.words.length > SHORT_WORDS || prev.label !== next.label || line.label === prev.label) continue;
        if (prev.clip) {
            flags.set(line.id, { toLabel: prev.label, reason: `Short line in the middle of the ${prev.name} clip` });
        } else if (!/[.!?]["')\]]*$/.test(prev.text) || /^[a-z]/.test(next.text)) {
            flags.set(line.id, { toLabel: prev.label, reason: `Short line in the middle of a sentence from ${prev.name}` });
        }
    }
    return flags;
}

export function timestamp(ms: number) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// Consecutive lines from the same voice read as one paragraph in the Doc.
export function reviewedText(
    episode: { title: string; recordedAt: string | null; durationSeconds?: number | null },
    lines: Line[],
    acceptedBy: string,
    acceptedAt: Date,
) {
    const speakers = new Map<string, { name: string; clip: boolean; seconds: number }>();
    for (const l of lines) {
        const s = speakers.get(l.label) ?? { name: l.name, clip: l.clip, seconds: 0 };
        s.seconds += (l.end - l.start) / 1000;
        speakers.set(l.label, s);
    }
    const groups: { first: Line; text: string[] }[] = [];
    for (const l of lines) {
        const last = groups[groups.length - 1];
        if (last?.first.label === l.label) last.text.push(l.text);
        else groups.push({ first: l, text: [l.text] });
    }
    const paragraphs = groups.map(({ first, text }) =>
        `[${timestamp(first.start)}] ${first.name}${first.clip ? ' (clip)' : ''}: ${text.join(' ')}`);

    return [
        episode.title,
        [
            episode.recordedAt ? `Recorded ${episode.recordedAt.slice(0, 10)}` : null,
            episode.durationSeconds ? `${Math.round(episode.durationSeconds / 60)} min` : null,
            `Speakers confirmed by ${acceptedBy} on ${acceptedAt.toISOString().slice(0, 10)}`,
        ].filter(Boolean).join(' · '),
        '',
        'SPEAKERS',
        '',
        ...[...speakers.values()]
            .sort((a, b) => b.seconds - a.seconds)
            .map(s => `${s.name}${s.clip ? ' (clip, played during the episode)' : ''} · talk time ${timestamp(s.seconds * 1000)}`),
        '',
        'TRANSCRIPT',
        '',
        paragraphs.join('\n\n'),
    ].join('\n') + '\n';
}

// Server-side check of corrections sent by the browser: known shape, sane sizes.
export function parseCorrections(input: unknown, utteranceCount: number): TranscriptCorrections {
    const bad = (why: string): never => { throw new Error(`Invalid corrections: ${why}`); };
    const obj = (v: unknown, what: string) =>
        (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : bad(what));
    const label = (v: unknown) => (typeof v === 'string' && /^[\w .'-]{1,40}$/.test(v) ? v : bad('speaker label'));
    const lineId = (v: string) => (/^\d{1,6}:\d{1,6}$/.test(v) ? v : bad('line id'));

    const raw = obj(input, 'not an object');
    const c = emptyCorrections();
    for (const [key, value] of Object.entries(obj(raw.speakers ?? {}, 'speakers'))) {
        const s = obj(value, 'speaker');
        const name = typeof s.name === 'string' ? s.name.trim().slice(0, 80) : '';
        c.speakers[label(key)] = { name, clip: s.clip === true };
    }
    for (const [key, value] of Object.entries(obj(raw.mergedInto ?? {}, 'mergedInto'))) {
        if (label(key) !== label(value)) c.mergedInto[key] = value as string;
    }
    for (const [key, value] of Object.entries(obj(raw.splits ?? {}, 'splits'))) {
        const u = Number(key);
        if (!Number.isInteger(u) || u < 0 || u >= utteranceCount) bad('split line');
        if (!Array.isArray(value) || value.some(w => !Number.isInteger(w) || w <= 0)) bad('split words');
        const words = [...new Set(value as number[])].sort((a, b) => a - b);
        if (words.length) c.splits[u] = words;
    }
    for (const [key, value] of Object.entries(obj(raw.reassign ?? {}, 'reassign'))) {
        c.reassign[lineId(key)] = label(value);
    }
    if (!Array.isArray(raw.dismissed ?? [])) bad('dismissed');
    c.dismissed = [...new Set(((raw.dismissed ?? []) as unknown[]).map(v => lineId(String(v))))];
    return c;
}
