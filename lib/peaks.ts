// Why: the waveform on the Studio editor's timeline (spec 019 item 2.1, built in spec 020 item E2).
// Peaks are made once at ingest (agent/src/podcast/timelineMedia.ts) from audio.m4a: the lowest and
// highest sample of every 10 ms, as two signed bytes, saved as analysis/peaks.bin (about 720 KB an
// hour). The bytes are µ-law (µ = 255), as 8-bit telephone audio is, so quiet sounds keep their
// detail: a breath fills about a quarter of the lane instead of a single pixel.

export const PEAKS_BUCKET_MS = 10;
// The audio is decoded at this rate for the peaks: plenty for a 10 ms bucket's highest and lowest.
export const PEAKS_SAMPLE_RATE = 8000;
const SAMPLES_PER_BUCKET = PEAKS_SAMPLE_RATE * PEAKS_BUCKET_MS / 1000;
const MU = 255;
const LOG_1P_MU = Math.log1p(MU);

// A sample (−1 to 1) as a µ-law byte (−127 to 127).
export function encodePeak(x: number): number {
    const q = Math.round(127 * Math.log1p(MU * Math.min(1, Math.abs(x))) / LOG_1P_MU);
    return x < 0 ? -q : q;
}

// A µ-law byte back to a sample.
export function decodePeak(q: number): number {
    const a = (Math.pow(1 + MU, Math.min(127, Math.abs(q)) / 127) - 1) / MU;
    return q < 0 ? -a : a;
}

// The peaks of 16-bit samples, fed in as they are decoded, so a long episode never sits in memory
// whole. Two bytes per bucket: the lowest, then the highest.
export class PeaksBuilder {
    private out: number[] = [];
    private lo = Infinity;
    private hi = -Infinity;
    private n = 0;

    push(samples: Int16Array) {
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (s < this.lo) this.lo = s;
            if (s > this.hi) this.hi = s;
            if (++this.n === SAMPLES_PER_BUCKET) this.flush();
        }
    }

    private flush() {
        this.out.push(encodePeak(this.lo / 32768), encodePeak(this.hi / 32768));
        this.lo = Infinity;
        this.hi = -Infinity;
        this.n = 0;
    }

    finish(): Int8Array {
        if (this.n > 0) this.flush();
        return Int8Array.from(this.out);
    }
}

// Coarser copies of the peaks, each with buckets twice as long as the one before, so a column of
// the zoomed-out timeline reads a few buckets instead of thousands. Level 0 is the peaks themselves.
export function peakLevels(peaks: Int8Array): Int8Array[] {
    const levels = [peaks];
    for (let prev = peaks; prev.length > 128; prev = levels[levels.length - 1]) {
        const buckets = prev.length >> 1;
        const next = new Int8Array(Math.ceil(buckets / 2) * 2);
        for (let i = 0; i < next.length; i += 2) {
            const a = 2 * i, b = a + 2;
            next[i] = b < prev.length ? Math.min(prev[a], prev[b]) : prev[a];
            next[i + 1] = b < prev.length ? Math.max(prev[a + 1], prev[b + 1]) : prev[a + 1];
        }
        levels.push(next);
    }
    return levels;
}

// The lowest and highest peak in each of `columns` columns, the first starting at `startMs` and
// each `msPerColumn` long: two values per column, 0 where there is no audio. Reads the coarsest
// level whose buckets still fit in a column.
export function columnPeaks(levels: Int8Array[], startMs: number, msPerColumn: number, columns: number): Int8Array {
    const out = new Int8Array(Math.max(0, columns) * 2);
    if (!levels.length || msPerColumn <= 0) return out;
    let level = 0;
    while (level + 1 < levels.length && PEAKS_BUCKET_MS * 2 ** (level + 1) <= msPerColumn) level++;
    const data = levels[level];
    const bucketMs = PEAKS_BUCKET_MS * 2 ** level;
    const buckets = data.length >> 1;
    for (let c = 0; c < columns; c++) {
        const from = startMs + c * msPerColumn;
        const first = Math.max(0, Math.floor(from / bucketMs));
        const last = Math.min(buckets, Math.max(first + 1, Math.ceil((from + msPerColumn) / bucketMs)));
        let lo = 127, hi = -127;
        for (let i = first; i < last; i++) {
            if (data[2 * i] < lo) lo = data[2 * i];
            if (data[2 * i + 1] > hi) hi = data[2 * i + 1];
        }
        if (first < last && from + msPerColumn > 0) {
            out[2 * c] = lo;
            out[2 * c + 1] = hi;
        }
    }
    return out;
}
