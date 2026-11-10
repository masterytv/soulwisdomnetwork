// The text lane in the editor: text and motion graphics on V3 never overlap (Tom, 10 November 2026: three at once
// crowded the screen). Which layers count, and the free-stretch search, are lib/layers.ts (onTextLane, freeStart);
// this keeps every change the editor makes to the rule, on the edited episode's clock, so cuts are counted.
// Run: npx tsx --test lib/textLane.test.ts

import { freeStart, layerSpan, LAYER_MIN_MS, onTextLane, TEXT_GAP_MS, type Layer, type Span } from './layers';
import { sequenceLength, sequenceOf, sourceTime, type Clip } from './sequence';

export type LaneChange = 'move' | 'start' | 'end';

const spansOf = (layers: Layer[], clips: Clip[], editedMs: number, except: string) =>
    layers.filter(o => o.id !== except && onTextLane(o)).flatMap(o => {
        const s = layerSpan(o, clips, editedMs);
        return s ? [s] : [];
    });

// The same layer, starting at `startMs` of the edited episode for `durationMs`: its anchor stays the kind it was.
function placed(layer: Layer, clips: Clip[], startMs: number, durationMs: number): Layer {
    const anchor = 'srcMs' in layer.anchor
        ? { srcMs: Math.round(sourceTime(clips, startMs) ?? layer.anchor.srcMs) }
        : { atMs: Math.round(startMs) };
    return { ...layer, anchor, durationMs: Math.round(durationMs) } as Layer;
}

// One V3 layer kept clear of the others. Moved (or added): to the nearest free stretch as long as it, or with `later`
// the first at or after it. A trimmed edge ('start' or 'end') stops short of the neighbour it ran into. Returned as it
// is when it already fits, is not on the lane, or no stretch is free for it (it then shows overlapping, for the
// producer to make room).
export function fitOnLane(layer: Layer, others: Layer[], clips: Clip[], editedMs: number, change: LaneChange, later = false): Layer {
    if (!onTextLane(layer)) return layer;
    const span = layerSpan(layer, clips, editedMs);
    if (!span) return layer;
    const taken = spansOf(others, clips, editedMs, layer.id);
    const hits = (s: Span) => taken.some(t => s.startMs < t.endMs + TEXT_GAP_MS && s.endMs > t.startMs - TEXT_GAP_MS);
    if (!hits(span)) return layer;
    const inside = (ms: number) => taken.some(t => ms > t.startMs - TEXT_GAP_MS && ms < t.endMs + TEXT_GAP_MS);
    if (change === 'end' && !inside(span.startMs)) {
        const next = Math.min(...taken.filter(t => t.startMs >= span.startMs).map(t => t.startMs - TEXT_GAP_MS));
        if (Number.isFinite(next) && next - span.startMs >= LAYER_MIN_MS) return placed(layer, clips, span.startMs, next - span.startMs);
    }
    if (change === 'start' && !inside(span.endMs)) {
        const prev = Math.max(...taken.filter(t => t.endMs <= span.endMs).map(t => t.endMs + TEXT_GAP_MS));
        if (Number.isFinite(prev) && span.endMs - prev >= LAYER_MIN_MS) return placed(layer, clips, prev, span.endMs - prev);
    }
    const length = span.endMs - span.startMs;
    const at = freeStart(taken, span.startMs, length, editedMs, later);
    return at === null ? layer : placed(layer, clips, at, layer.durationMs);
}

// The editor's layers after a change, with every V3 layer the change added or moved kept clear of the rest: the
// layers it did not touch stay where they are. The same array when nothing had to move.
export function keepTextLane(before: Layer[], after: Layer[], clips: Clip[], editedMs: number): Layer[] {
    const was = new Map(before.map(l => [l.id, l]));
    let out = after;
    for (let i = 0; i < after.length; i++) {
        const l = out[i];
        if (!onTextLane(l)) continue;
        const old = was.get(l.id);
        if (old && JSON.stringify(old.anchor) === JSON.stringify(l.anchor) && old.durationMs === l.durationMs) continue;
        let change: LaneChange = 'move';
        if (old) {
            const a = layerSpan(old, clips, editedMs), b = layerSpan(l, clips, editedMs);
            if (a && b && Math.abs(a.startMs - b.startMs) < 1 && a.endMs !== b.endMs) change = 'end';
            else if (a && b && Math.abs(a.endMs - b.endMs) < 1 && a.startMs !== b.startMs) change = 'start';
        }
        const fitted = fitOnLane(l, out, clips, editedMs, change);
        if (fitted !== l) {
            if (out === after) out = [...after];
            out[i] = fitted;
        }
    }
    return out;
}

// A whole set of layers spaced out, earliest first: each V3 layer that overlaps one before it waits until just after.
// For the motion graphics an edit is first set up with, once its first cuts are known (they can bring a lower third
// placed on the recording's clock under the title banner).
export function spaceTextLane(layers: Layer[], clips: Clip[], editedMs: number): Layer[] {
    const start = (l: Layer) => layerSpan(l, clips, editedMs)?.startMs ?? Infinity;
    const order = layers.map((l, i) => i).filter(i => onTextLane(layers[i])).sort((a, b) => start(layers[a]) - start(layers[b]));
    const out = [...layers];
    const done: Layer[] = [];
    for (const i of order) {
        out[i] = fitOnLane(out[i], done, clips, editedMs, 'move', true);
        done.push(out[i]);
    }
    return out;
}

// The same for an edit just set up, from its cuts and the transcript's words (its length is the last word's end).
export function spaceFirstEdit(edit: { cuts: Parameters<typeof sequenceOf>[0]['cuts'] }, layers: Layer[], words: { start: number; end: number }[]): Layer[] {
    const clips = sequenceOf({ cuts: edit.cuts }, words.length ? words[words.length - 1].end : 0, words).clips;
    return spaceTextLane(layers, clips, sequenceLength(clips));
}
