// Why: "Studio sound" (docs/specs/019-editor-light-v2.md item 3.4), a free voice clean-up that does on the runner what
// Auphonic does as a service, with no account and no cost: DeepFilterNet removes the noise (held back so the voice
// does not thin out), then each speaker is given their own EQ and level, measured from the transcript's turns, and
// the whole voice is de-essed, levelled, compressed and limited. The render's loudness pass (−14 LUFS) and the
// podcast's (−16) come after it, as for every clean-up.
//
// The EQ is automatic: each speaker's average spectrum, in half-octave bands, is compared with a target (the
// average speech spectrum of ANSI S3.5-1997, plus a little broadcast "voicing": warmth, less mud, presence), and
// the difference is made up within limits (SPEAKER_EQ_LIMITS), so a laptop microphone gains body and a boomy room
// loses its mud, but no voice is remade. A band the recording does not reach (a codec's or a microphone's
// cut-off) is never boosted. The EQ and level change at the quiet moment between two speakers' turns, with
// asendcmd, so one filter chain serves every voice. Every filter here works sample for sample (the limiter
// compensates its look-ahead), so the voice stays where the picture is.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── the target ────────────────────────────────────────────────────────────

// The EQ's bands: half an octave apart, from 80 Hz to 10 kHz. Each is a peaking filter half an octave wide.
export const BANDS = [80, 113, 160, 226, 320, 453, 640, 905, 1280, 1810, 2560, 3620, 5120, 7240, 10240];
export const BAND_WIDTH_OCTAVES = 0.5;

// The average speech spectrum at normal vocal effort, as spectrum levels (dB per Hz) at one-third-octave centres
// (ANSI S3.5-1997, table 3). Only its shape is used.
export const SPEECH_SPECTRUM: [number, number][] = [
    [160, 32.41], [200, 34.48], [250, 34.75], [315, 33.98], [400, 34.59], [500, 34.27], [630, 32.06], [800, 28.30],
    [1000, 25.01], [1250, 23.00], [1600, 20.15], [2000, 17.32], [2500, 13.18], [3150, 11.55], [4000, 9.33],
    [5000, 5.31], [6300, 2.59], [8000, 1.13],
];

// The broadcast voicing added to that average, by band (dB): a close microphone's warmth below 200 Hz, a little
// less "mud" around 300–450 Hz, presence from 2.5 to 5 kHz. Starting points to be tuned by ear (item 3.4).
export const VOICING: Record<number, number> = { 80: 2, 113: 2.5, 160: 2, 226: 0.5, 320: -1, 453: -1, 2560: 1, 3620: 1.5, 5120: 1 };

// How far the EQ may go at a band (dB): cuts deeper than boosts, since a boost also raises what is left of the noise.
export const SPEAKER_EQ_LIMITS = { cut: -5, boost: 4 };

// A band this far below where the target puts it is one the recording does not reach: it is not boosted.
const MISSING_DB = 15;

// The bands the speech spectrum covers, which the EQ is fitted to; below and above, the nearest band's correction
// is carried on (never more than a small boost), with the voicing.
const FIT_FROM = 160, FIT_TO = 8000;

// The bands the level is matched over (the middle of speech, where the target and the voice are both reliable).
const LEVEL_FROM = 640, LEVEL_TO = 2560;

// The target's level in each band (dB, any reference): the speech spectrum interpolated in log frequency, made a
// band level (spectrum level + 10·log10 of the band's width), plus the voicing. Outside the table, null.
export function targetDb(f: number): number | null {
    if (f < FIT_FROM || f > FIT_TO) return null;
    const t = SPEECH_SPECTRUM;
    let i = 0;
    while (i < t.length - 2 && t[i + 1][0] < f) i++;
    const [f0, s0] = t[i], [f1, s1] = t[i + 1];
    const x = Math.log(f / f0) / Math.log(f1 / f0);
    const spectrum = s0 + (s1 - s0) * x;
    const width = f * (2 ** (BAND_WIDTH_OCTAVES / 2) - 2 ** (-BAND_WIDTH_OCTAVES / 2));
    return spectrum + 10 * Math.log10(width) + (VOICING[f] ?? 0);
}

// ─── the EQ ────────────────────────────────────────────────────────────────

// ffmpeg's `equalizer` (a peaking biquad, af_biquads.c, width in octaves): its gain in dB at frequency `f`.
export function peakResponseDb(f: number, centre: number, gainDb: number, octaves: number, rate = 48000): number {
    if (!gainDb) return 0;
    const w0 = 2 * Math.PI * centre / rate;
    const alpha = Math.sin(w0) * Math.sinh(Math.log(2) / 2 * octaves * w0 / Math.sin(w0));
    const A = 10 ** (gainDb / 40);
    const b = [1 + alpha * A, -2 * Math.cos(w0), 1 - alpha * A];
    const a = [1 + alpha / A, -2 * Math.cos(w0), 1 - alpha / A];
    const w = 2 * Math.PI * f / rate;
    const mag = (c: number[]) => Math.hypot(c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w), -(c[1] * Math.sin(w) + c[2] * Math.sin(2 * w)));
    return 20 * Math.log10(mag(b) / mag(a));
}

// The whole EQ's gain (dB) at each band centre, for filter gains `gains` (one per band).
export function chainResponse(gains: number[]): number[] {
    return BANDS.map(f => gains.reduce((t, g, i) => t + peakResponseDb(f, BANDS[i], g, BAND_WIDTH_OCTAVES), 0));
}

// The filter gains whose combined response meets `wanted` at the band centres (neighbouring filters overlap, so
// each one's gain is not simply the band's): a few rounds of correcting each by what is still missing.
export function fitGains(wanted: number[]): number[] {
    const g = [...wanted];
    for (let round = 0; round < 40; round++) {
        const got = chainResponse(g);
        let worst = 0;
        for (let i = 0; i < g.length; i++) {
            const miss = wanted[i] - got[i];
            worst = Math.max(worst, Math.abs(miss));
            g[i] = Math.max(-12, Math.min(12, g[i] + 0.7 * miss));
        }
        if (worst < 0.05) break;
    }
    return g.map(x => Math.round(x * 10) / 10);
}

// A band is boosted only where the voice stands this far above the recording's noise (dB), and by at most half of
// what it stands above that, so what is left of the hiss after DeepFilterNet is never what gets louder.
export const BOOST_SNR_DB = 10;

// What one speaker's voice needs at each band (dB): the target less the voice, both at the same level in the middle
// of speech, smoothed over neighbouring bands, within SPEAKER_EQ_LIMITS, and never a boost where the voice has
// (next to) nothing. `measured` is the voice's band levels (dB), one per band; `snr`, how far it stands above the
// noise in each band (dB), when known.
export function wantedEq(measured: number[], snr?: number[]): number[] {
    const fit = BANDS.map((f, i) => ({ f, i, t: targetDb(f) })).filter(b => b.t !== null) as { f: number; i: number; t: number }[];
    const middle = fit.filter(b => b.f >= LEVEL_FROM && b.f <= LEVEL_TO);
    const offset = middle.reduce((s, b) => s + measured[b.i] - b.t, 0) / middle.length;
    const raw: (number | null)[] = BANDS.map(() => null);
    for (const b of fit) {
        const need = b.t + offset - measured[b.i];
        raw[b.i] = need > MISSING_DB ? 0 : need;
    }
    // Below and above the table: the nearest band's need, with the voicing on top, but only a small boost.
    const first = fit[0].i, last = fit[fit.length - 1].i;
    for (let i = 0; i < first; i++) raw[i] = Math.min(2, (raw[first] ?? 0) + (VOICING[BANDS[i]] ?? 0) - (VOICING[BANDS[first]] ?? 0));
    for (let i = last + 1; i < BANDS.length; i++) raw[i] = measured[i] < measured[last] - MISSING_DB ? 0 : Math.min(1, raw[last] ?? 0);
    const r = raw as number[];
    const smooth = r.map((x, i) => 0.25 * (r[i - 1] ?? x) + 0.5 * x + 0.25 * (r[i + 1] ?? x));
    return smooth.map((x, i) => {
        const room = snr ? Math.max(0, (snr[i] - BOOST_SNR_DB) / 2) : Infinity;
        return Math.max(SPEAKER_EQ_LIMITS.cut, Math.min(SPEAKER_EQ_LIMITS.boost, room, x));
    });
}

// ─── each speaker's level ──────────────────────────────────────────────────

// The level differences between speakers are evened out before the leveller, so one quiet guest is not left to it:
// each is brought to the speakers' average (weighted by how long each speaks), at most this far.
export const SPEAKER_LEVEL_LIMIT_DB = 12;

// A voice's level (dB) from its band levels, after an EQ with response `eqDb` at the bands: the sum of the bands' power.
export function levelDb(measured: number[], eqDb: number[] = []): number {
    return 10 * Math.log10(measured.reduce((s, m, i) => s + 10 ** ((m + (eqDb[i] ?? 0)) / 10), 0));
}

// A voice as measured: its band levels (the shape, at its average level), and how far it stands above the noise in
// each band (dB), when the noise could be measured.
export interface SpeakerProfile { speaker: string; seconds: number; bands: number[]; snr?: number[] }
export interface SpeakerSound { speaker: string; gains: number[]; volumeDb: number }

// Each speaker's EQ (the filter gains) and level change.
export function speakerSounds(profiles: SpeakerProfile[]): SpeakerSound[] {
    const shaped = profiles.map(p => {
        const gains = fitGains(wantedEq(p.bands, p.snr));
        return { p, gains, level: levelDb(p.bands, chainResponse(gains)) };
    });
    const total = shaped.reduce((s, x) => s + x.p.seconds, 0);
    const mean = total ? shaped.reduce((s, x) => s + x.level * x.p.seconds, 0) / total : 0;
    return shaped.map(x => ({
        speaker: x.p.speaker, gains: x.gains,
        volumeDb: Math.round(Math.max(-SPEAKER_LEVEL_LIMIT_DB, Math.min(SPEAKER_LEVEL_LIMIT_DB, mean - x.level)) * 10) / 10,
    }));
}

// ─── when each voice's sound applies ───────────────────────────────────────

export interface Turn { speaker: string; startMs: number; endMs: number }

// A line of the accepted transcript (reviewed.json), as far as Studio sound needs it.
export interface ReviewedLine { speaker: string; clip?: boolean; start: number; end: number }

// Who speaks when, from the accepted transcript: a clip played in the episode is no one's voice (speaker '').
export function turnsOf(lines: ReviewedLine[]): Turn[] {
    return lines.map(l => ({ speaker: l.clip ? '' : l.speaker, startMs: l.start, endMs: l.end }));
}

// The turns inside a stretch of the recording, in the stretch's own times (the clean-up comparison's stretch).
export function turnsWithin(turns: Turn[], startMs: number, endMs: number): Turn[] {
    return turns.filter(t => t.endMs > startMs && t.startMs < endMs)
        .map(t => ({ speaker: t.speaker, startMs: Math.max(0, t.startMs - startMs), endMs: Math.min(endMs, t.endMs) - startMs }));
}

// Where the sound changes from one speaker to the next: in the middle of the pause between their turns (or where the
// next begins, when they overlap), starting with the first speaker's. Neighbouring turns of one speaker are one.
export function switchPoints(turns: Turn[], known: Set<string>): { atMs: number; speaker: string }[] {
    const sorted = turns.filter(t => known.has(t.speaker) && t.endMs > t.startMs).sort((a, b) => a.startMs - b.startMs);
    const out: { atMs: number; speaker: string }[] = [];
    let lastEnd = 0;
    for (const t of sorted) {
        const current = out[out.length - 1];
        if (current?.speaker !== t.speaker) {
            const at = !current ? 0 : t.startMs > lastEnd ? Math.round((lastEnd + t.startMs) / 2) : t.startMs;
            out.push({ atMs: Math.max(at, current?.atMs ?? 0), speaker: t.speaker });
        }
        lastEnd = Math.max(lastEnd, t.endMs);
    }
    return out;
}

const dbToGain = (db: number) => (10 ** (db / 20)).toFixed(4);

// The asendcmd commands that switch the EQ (filters `eq0`…) and level (`lvl`) at each switch point.
export function commandsFor(points: { atMs: number; speaker: string }[], sounds: SpeakerSound[]): string {
    const by = new Map(sounds.map(s => [s.speaker, s]));
    return points.slice(1).map(p => {
        const s = by.get(p.speaker)!;
        const cmds = [...s.gains.map((g, i) => `equalizer@eq${i} g ${g}`), `volume@lvl volume ${dbToGain(s.volumeDb)}`];
        return `${(p.atMs / 1000).toFixed(3)} ${cmds.join(', ')};`;
    }).join('\n');
}

// After the EQ: de-essing (the presence boost raises the "s" sounds too), a slow leveller that does not lift the
// pauses, a gentle compressor, and a limiter that keeps a dB of room (it compensates its look-ahead, so it adds no delay).
export const STUDIO_AFTER = [
    'deesser=i=0.4:m=0.5:f=0.5',
    'dynaudnorm=f=500:g=31:p=0.9:m=3:t=0.01',
    'acompressor=threshold=-18dB:ratio=3:attack=10:release=120:knee=4',
    'alimiter=limit=0.891:attack=5:release=50:level=false:latency=true',
].join(',');

// The warmth asked for (dB, 0 for none; lib/voice.ts WARMTH_DB): a low shelf adding that much body below about 220 Hz,
// and half of it taken off around 4 kHz, so the voice sounds lower and softer without its pitch changing.
export function warmthFilter(db: number): string {
    return db > 0 ? `lowshelf=f=220:t=q:w=0.7:g=${db},equalizer=f=4000:t=o:w=1.5:g=${-db / 2},` : '';
}

// The filter chain for the cleaned voice: the first speaker's EQ and level to start with, the commands to switch
// (a file, when there is more than one sound), the warmth, then STUDIO_AFTER, as two channels.
export function studioChain(first: SpeakerSound, commandsFile: string | null, warmthDb = 0): string {
    const cmd = commandsFile ? `asendcmd=f=${commandsFile.replace(/[\\:',;[\]]/g, c => `\\${c}`)},` : '';
    const eq = first.gains.map((g, i) => `equalizer@eq${i}=f=${BANDS[i]}:t=o:w=${BAND_WIDTH_OCTAVES}:g=${g}`).join(',');
    return `${cmd}${eq},volume@lvl=volume=${dbToGain(first.volumeDb)},${warmthFilter(warmthDb)}${STUDIO_AFTER},pan=stereo|c0=c0|c1=c0`;
}

// ─── measuring a voice ─────────────────────────────────────────────────────

const FFT = 8192;

// An in-place radix-2 FFT of `re`/`im` (length a power of two).
export function fft(re: Float64Array, im: Float64Array) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const a = i + k, b = a + len / 2;
                const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr; im[b] = im[a] - ti;
                re[a] += tr; im[a] += ti;
                const nr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr; cr = nr;
            }
        }
    }
}

// The band levels (dB) of the speech in `samples` (mono, `rate` Hz), from frames with a Hann window every half frame,
// leaving out frames more than 30 dB below the loudest (the pauses inside a turn). The shape is the average of each
// frame's spectrum made to the same power, so a loud moment or a loud speaker does not decide it alone; the level is
// the frames' average power.
export class BandMeter {
    private readonly shape = new Float64Array(FFT / 2);
    private readonly power = new Float64Array(FFT / 2);
    private energy = 0;
    private readonly window = Float64Array.from({ length: FFT }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FFT));
    frames = 0;
    constructor(readonly rate = 48000) {}

    // `keep` chooses the frames by their energy; by default, those within 30 dB of the loudest in `samples`.
    add(samples: Float32Array, keep?: (energy: number) => boolean) {
        const energies = frameEnergies(samples);
        const loudest = Math.max(0, ...energies);
        const chosen = keep ?? ((e: number) => e >= loudest / 1000);
        const re = new Float64Array(FFT), im = new Float64Array(FFT);
        energies.forEach((e, k) => {
            if (!(e > 0) || !chosen(e)) return;
            const s = k * FFT / 2;
            for (let i = 0; i < FFT; i++) { re[i] = samples[s + i] * this.window[i]; im[i] = 0; }
            fft(re, im);
            let total = 0;
            for (let i = 0; i < FFT / 2; i++) { im[i] = re[i] * re[i] + im[i] * im[i]; total += im[i]; }
            if (!(total > 0)) return;
            for (let i = 0; i < FFT / 2; i++) { this.shape[i] += im[i] / total; this.power[i] += im[i]; }
            this.energy += total;
            this.frames++;
        });
    }

    private sum(of: Float64Array): number[] {
        const hz = this.rate / FFT;
        return BANDS.map(c => {
            const lo = c * 2 ** (-BAND_WIDTH_OCTAVES / 2), hi = c * 2 ** (BAND_WIDTH_OCTAVES / 2);
            let p = 0;
            for (let i = Math.ceil(lo / hz); i <= Math.floor(hi / hz) && i < of.length; i++) p += of[i];
            return p / Math.max(1, this.frames);
        });
    }

    // The shape, at the frames' average level (dB).
    bands(): number[] {
        const level = this.energy / Math.max(1, this.frames);
        return this.sum(this.shape).map(p => 10 * Math.log10(p * level + 1e-20));
    }

    // The frames' average power in each band (dB): for comparing with the noise.
    powerBands(): number[] {
        return this.sum(this.power).map(p => 10 * Math.log10(p + 1e-20));
    }
}

// Each frame's energy (the frames BandMeter analyses).
export function frameEnergies(samples: Float32Array): number[] {
    const out: number[] = [];
    for (let s = 0; s + FFT <= samples.length; s += FFT / 2) {
        let e = 0;
        for (let i = 0; i < FFT; i++) e += samples[s + i] * samples[s + i];
        out.push(e);
    }
    return out;
}

// The value below which a share `q` (0–1) of `values` lies.
export function quantile(values: number[], q: number): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

// Reads stretches of a 16-bit mono WAV file without loading all of it.
export class WavReader {
    private readonly fd: number;
    private readonly dataAt: number;
    readonly rate: number;
    readonly length: number;     // samples
    constructor(file: string) {
        this.fd = fs.openSync(file, 'r');
        const head = Buffer.alloc(4096);
        fs.readSync(this.fd, head, 0, head.length, 0);
        if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file} is not a WAV file`);
        let at = 12, rate = 0, bits = 0, channels = 0, data = -1, size = 0;
        while (at + 8 <= head.length) {
            const id = head.toString('ascii', at, at + 4), len = head.readUInt32LE(at + 4);
            if (id === 'fmt ') { channels = head.readUInt16LE(at + 10); rate = head.readUInt32LE(at + 12); bits = head.readUInt16LE(at + 22); }
            if (id === 'data') { data = at + 8; size = len; break; }
            at += 8 + len + (len % 2);
        }
        if (data < 0 || bits !== 16 || channels !== 1) throw new Error(`${file}: expected 16-bit mono PCM`);
        const fileSize = fs.fstatSync(this.fd).size;
        this.dataAt = data;
        this.rate = rate;
        this.length = Math.floor(Math.min(size || Infinity, fileSize - data) / 2);
    }
    read(fromSample: number, count: number): Float32Array {
        const from = Math.max(0, Math.min(this.length, fromSample)), n = Math.max(0, Math.min(count, this.length - from));
        const buf = Buffer.alloc(n * 2);
        fs.readSync(this.fd, buf, 0, buf.length, this.dataAt + from * 2);
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
        return out;
    }
    close() { fs.closeSync(this.fd); }
}

// At most this much of each speaker is measured, spread over the whole recording; a speaker heard for less than
// MIN_SPEAKER_SEC gets everyone's sound.
const MEASURE_SEC = 300;
export const MIN_SPEAKER_SEC = 20;

// Turns of at least this long are measured (shorter ones are mostly "yeah"s and laughs).
const MIN_TURN_MS = 1500;

// The turns to measure for one speaker: their longer ones, evenly picked over the recording, up to MEASURE_SEC.
export function turnsToMeasure(turns: Turn[]): Turn[] {
    const long = turns.filter(t => t.endMs - t.startMs >= MIN_TURN_MS).sort((a, b) => a.startMs - b.startMs);
    const total = long.reduce((s, t) => s + t.endMs - t.startMs, 0);
    if (total <= MEASURE_SEC * 1000) return long;
    const every = total / (MEASURE_SEC * 1000);
    return long.filter((_, i) => Math.floor(i / every) !== Math.floor((i - 1) / every));
}

// Each speaker's band levels, from their turns in the cleaned voice; plus everyone's together (speaker ''), for the
// speakers too little heard and the clips. Without turns, everyone's is measured from the whole recording, a second
// in every few, from the frames within 30 dB of its loud speech. The noise is the quietest tenth of those seconds'
// frames, and each voice's distance above it, band by band, limits its boosts (BOOST_SNR_DB).
export function measureVoices(wav: string, turns: Turn[]): { profiles: SpeakerProfile[]; everyone: SpeakerProfile } {
    const reader = new WavReader(wav);
    try {
        // A second in every few, over the whole recording.
        const step = Math.max(1, Math.floor(reader.length / reader.rate / MEASURE_SEC)) * reader.rate;
        const seconds: number[] = [];
        for (let at = 0; at + reader.rate <= reader.length; at += step) seconds.push(at);
        const energies = seconds.flatMap(at => frameEnergies(reader.read(at, reader.rate))).filter(e => e > 0);
        const quiet = quantile(energies, 0.1), loud = quantile(energies, 0.95);
        const noise = new BandMeter(reader.rate);
        if (energies.length >= 20 && quiet * 100 < loud) for (const at of seconds) noise.add(reader.read(at, reader.rate), e => e <= quiet);
        const noiseBands = noise.frames >= 5 ? noise.powerBands() : null;
        const snrOf = (m: BandMeter) => (noiseBands ? m.powerBands().map((p, i) => p - noiseBands[i]) : undefined);

        const all = new BandMeter(reader.rate);
        const profiles: SpeakerProfile[] = [];
        const speakers = [...new Set(turns.map(t => t.speaker))].filter(Boolean);
        let allSeconds = 0;
        for (const speaker of speakers) {
            const mine = turns.filter(t => t.speaker === speaker);
            const heard = mine.reduce((s, t) => s + t.endMs - t.startMs, 0) / 1000;
            const meter = new BandMeter(reader.rate);
            for (const t of turnsToMeasure(mine)) {
                const s = reader.read(Math.round(t.startMs * reader.rate / 1000), Math.round((t.endMs - t.startMs) * reader.rate / 1000));
                meter.add(s);
                all.add(s);
            }
            allSeconds += heard;
            if (heard >= MIN_SPEAKER_SEC && meter.frames > 20) profiles.push({ speaker, seconds: heard, bands: meter.bands(), snr: snrOf(meter) });
        }
        if (!speakers.length || all.frames < 5) {
            for (const at of seconds) all.add(reader.read(at, reader.rate), e => e >= loud / 1000);
            allSeconds = reader.length / reader.rate;
        }
        if (all.frames < 5) throw new Error('Studio sound found too little speech to measure');
        return { profiles, everyone: { speaker: '', seconds: allSeconds, bands: all.bands(), snr: snrOf(all) } };
    } finally {
        reader.close();
    }
}

// ─── the clean-up ─────────────────────────────────────────────────────────

function ffmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', d => { err += d; });
        p.on('error', reject);
        p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-600)}`))));
    });
}

// The rest of Studio sound, on `voice` (DeepFilterNet's mono WAV at the recording's times): measures the speakers,
// writes the switch commands, and makes `out` (48 kHz stereo WAV). Returns what was set, for the log.
export async function studioFinish(voice: string, out: string, o: { workDir: string; turns?: Turn[]; warmthDb?: number }): Promise<string> {
    const { profiles, everyone } = measureVoices(voice, o.turns ?? []);
    const sounds = speakerSounds([...profiles, everyone]);
    const all = sounds[sounds.length - 1];
    const own = sounds.slice(0, -1);
    // Clips played in the episode (speaker '') and speakers heard too little to measure get everyone's sound.
    const mine = new Set(own.map(s => s.speaker));
    const turns = (o.turns ?? []).map(t => (mine.has(t.speaker) ? t : { ...t, speaker: '' }));
    const points = switchPoints(turns, new Set(sounds.map(s => s.speaker)));
    const first = sounds.find(s => s.speaker === points[0]?.speaker) ?? all;
    let file: string | null = null;
    if (points.length > 1) {
        file = path.join(o.workDir, 'studio-sound.cmd');
        fs.writeFileSync(file, commandsFor(points, sounds));
    }
    await ffmpeg(['-i', voice, '-af', studioChain(first, file, o.warmthDb), '-ar', '48000', '-c:a', 'pcm_s16le', out]);
    const describe = (s: SpeakerSound) => `${s.speaker || 'everyone'}: ${s.volumeDb >= 0 ? '+' : ''}${s.volumeDb} dB, EQ ${s.gains.map((g, i) => `${BANDS[i]}:${g}`).filter((_, i) => s.gains[i]).join(' ')}`;
    return (own.length ? own : [all]).map(describe).join('; ');
}
