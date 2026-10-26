// The highlight reframe (docs/specs/021-motion-graphics.md, item M3): for a few seconds the episode's own
// picture is moved by the keyframes its highlight template declares (window.GRAPHIC_LAYOUT), shaped by the
// template's matte clip, set over its background clip, with its words clip on top — all inside the window
// encode (editRender.ts renderWindow), so a highlight costs nothing outside its own seconds.
//
// The movement is lib/reframe.ts's: the same 16-segment table of the house picture curve becomes ffmpeg
// expressions over t (scale w/h with eval=frame and overlay x/y — probed to work on ffmpeg 6.1: a stream's
// frame size may change per frame under overlay). The picture is only ever scaled and moved; every shape
// (the rounded window, the iris oval) is the matte's. Visible = the picture's own alpha × the matte's
// alpha, so a one-pixel drift between the matte's easing (WAAPI) and these expressions can never leave a
// fringe. 'over' moves nothing: the dimmed, blurred copy fades in and out over the sharp picture (a linear
// alpha fade across the same squeezed in/out — a blur crossfade, where the curve's shape cannot be seen).
//
// A highlight may start before a window or end after it (windows cut the finished video wherever is
// cheap): every trim is in absolute episode seconds and the expressions carry the highlight's own start,
// so each window draws exactly its frames of the move and they join without a seam.

import { easeSegments, progressAt, type HighlightLayout, type LayoutKeyframes } from '../../../../lib/reframe';
import { FPS } from '../renderWindows';

// Which planes a layout needs drawn (one template clip each, GraphicSpec.mode): 'over' never clips or
// moves the picture (no matte, no background behind it) and 'push' slides it off the frame's own edge
// (no matte). `geometry` layouts move the picture; `dim` is 'over''s brightness and blur.
export const HIGHLIGHT_PLANES: Record<HighlightLayout, { background: boolean; matte: boolean; geometry: boolean; dim: boolean }> = {
    splitQuote: { background: true, matte: true, geometry: true, dim: false },
    splitWord: { background: true, matte: true, geometry: true, dim: false },
    below: { background: true, matte: true, geometry: true, dim: false },
    over: { background: false, matte: false, geometry: false, dim: true },
    iris: { background: true, matte: true, geometry: false, dim: false },
    push: { background: true, matte: false, geometry: true, dim: false },
};

const sec = (n: number) => n.toFixed(6);

// The eased progress 0→1→0 as an ffmpeg expression over `timeExpr` seconds into the highlight: the
// squeezed in/out of lib/reframe.ts progressAt, then the piecewise table as nested if()s — the very
// numbers the tests and the editor's preview read, so what ffmpeg draws is what both check.
export function progressExpr(timeExpr: string, k: Pick<LayoutKeyframes, 'inMs' | 'outMs'>, durationMs: number, steps = 16): string {
    const squeeze = Math.min(1, durationMs / (k.inMs + k.outMs));
    const inSec = k.inMs * squeeze / 1000, outSec = k.outMs * squeeze / 1000, d = durationMs / 1000;
    // x: the way in (0..1), the hold (1), the way back (1..0), clamped outside the highlight.
    const x = `clip(if(lt(${timeExpr},${sec(inSec)}),(${timeExpr})/${sec(inSec)},if(lte(${timeExpr},${sec(d - outSec)}),1,(${sec(d)}-(${timeExpr}))/${sec(outSec)})),0,1)`;
    const table = easeSegments(steps);
    // The table as nested ifs on st(0), so x is computed once per evaluation.
    let expr = String(table[steps]);
    for (let i = steps - 1; i >= 0; i--) {
        const seg = `${table[i]}+(${table[i + 1]}-${table[i]})*(ld(0)*${steps}-${i})`;
        expr = `if(lt(ld(0),${(i + 1) / steps}),${seg},${expr})`;
    }
    return `st(0,${x})*0+${expr}`;
}

// A number eased between `from` and `to` by the progress expression.
const between = (from: number, to: number, p: string) =>
    from === to ? String(from) : `(${from}+${to - from}*${p})`;

export interface HighlightWindowArgs {
    layout: HighlightLayout;
    keyframes: LayoutKeyframes;              // the template's declaration, already schema-checked
    startSec: number;                        // on the edited episode's clock
    durationMs: number;
    // ffmpeg input indexes for the drawn clips this layout needs (HIGHLIGHT_PLANES); the caller adds
    // the files as inputs. The graphics clip is always there.
    inputs: { background?: number; matte?: number; graphics: number };
    // The window's stretch of the episode clock: the highlight is trimmed to it.
    windowFromSec: number;
    windowToSec: number;
    tag: string;                             // unique label prefix in the filter graph
}

// The filter stage for one highlight: takes the episode stream `[inLabel]` (yuv420p, PTS on the edited
// episode's clock) and leaves `[outLabel]` with the highlight's seconds replaced by the reframed frame.
export function highlightFilter(inLabel: string, outLabel: string, o: HighlightWindowArgs): string {
    const planes = HIGHLIGHT_PLANES[o.layout];
    const k = o.keyframes;
    const d = o.durationMs / 1000;
    const endSec = o.startSec + d;
    const from = Math.max(o.startSec, o.windowFromSec);
    const to = Math.min(endSec, o.windowToSec);
    const skip = from - o.startSec;          // how far into the highlight this window begins
    const span = to - from;
    const t = o.tag;
    // Seconds into the highlight, on the trimmed stream's local clock (which starts at `skip`).
    const T = `(t+${sec(skip)})`;
    const p = progressExpr(T, k, o.durationMs);

    // The highlight's frames, in step with the drawn clips: both trimmed to this window's stretch of the
    // highlight and reset to a shared local clock, so alphamerge pairs the right frames.
    let f = `[${inLabel}]split=2[${t}_main][${t}_pick];`;
    f += `[${t}_pick]trim=start=${sec(from)}:end=${sec(to)},setpts=PTS-STARTPTS[${t}_h];`;
    const clipIn = (n: number, label: string, loop = false) =>
        `[${n}:v]${loop ? `tpad=stop_mode=clone:stop_duration=${sec(d)},` : ''}fps=${FPS},trim=start=${sec(skip)}:end=${sec(skip + span)},setpts=PTS-STARTPTS[${label}];`;

    let staged: string;                      // the full-frame replacement, opaque where the bg shows
    if (planes.dim) {
        // 'over': the sharp picture with its dimmed, blurred copy faded in over the squeezed in and out.
        const squeeze = Math.min(1, o.durationMs / (k.inMs + k.outMs));
        const inSec = k.inMs * squeeze / 1000, outSec = k.outMs * squeeze / 1000;
        f += `[${t}_h]split=2[${t}_sharp][${t}_tod];`;
        f += `[${t}_tod]colorchannelmixer=rr=${k.to.brightness}:gg=${k.to.brightness}:bb=${k.to.brightness},gblur=sigma=${k.to.blur}:steps=2,format=rgba,`
            + `fade=t=in:st=${sec(-skip)}:d=${sec(inSec)}:alpha=1,fade=t=out:st=${sec(d - skip - outSec)}:d=${sec(outSec)}:alpha=1[${t}_dim];`;
        f += `[${t}_sharp][${t}_dim]overlay=x=0:y=0:eof_action=pass,format=rgba[${t}_pic];`;
        staged = `${t}_pic`;
    } else if (planes.geometry) {
        // The picture scaled and placed by the eased keyframes, on a transparent canvas the frame's size.
        // A pure pan (the split layouts, push) skips the scale: the picture is already the frame's size.
        let pic = `${t}_h`;
        if (k.from.scale !== 1 || k.to.scale !== 1) {
            const w = `max(2,round(1920*${between(k.from.scale, k.to.scale, p)}))`;
            const h = `max(2,round(1080*${between(k.from.scale, k.to.scale, p)}))`;
            f += `[${pic}]scale=w='${w}':h='${h}':eval=frame:flags=lanczos[${t}_sc];`;
            pic = `${t}_sc`;
        }
        f += `[${pic}]format=rgba[${t}_fr];`;
        f += `color=c=black@0:s=1920x1080:r=${FPS}:d=${sec(span)},format=rgba[${t}_cv];`;
        f += `[${t}_cv][${t}_fr]overlay=x='${between(k.from.x, k.to.x, p)}':y='${between(k.from.y, k.to.y, p)}':format=auto:eof_action=pass,format=rgba[${t}_pic];`;
        staged = `${t}_pic`;
    } else {
        // 'iris': the picture never moves; the matte below does everything.
        f += `[${t}_h]format=rgba[${t}_pic];`;
        staged = `${t}_pic`;
    }

    if (planes.matte && o.inputs.matte !== undefined) {
        // Visible = the picture's alpha × the matte's alpha (never a fringe where the two eases drift).
        f += clipIn(o.inputs.matte, `${t}_mc`);
        f += `[${staged}]split=2[${t}_p1][${t}_p2];[${t}_p2]alphaextract[${t}_a1];[${t}_mc]alphaextract[${t}_a2];`;
        f += `[${t}_a1][${t}_a2]blend=all_mode=multiply[${t}_am];[${t}_p1][${t}_am]alphamerge[${t}_shaped];`;
        staged = `${t}_shaped`;
    }
    if (planes.background && o.inputs.background !== undefined) {
        f += clipIn(o.inputs.background, `${t}_bg`);
        f += `[${t}_bg]format=rgba[${t}_bgr];[${t}_bgr][${staged}]overlay=x=0:y=0:format=auto:eof_action=pass[${t}_onbg];`;
        staged = `${t}_onbg`;
    }
    // The template's words and frame art, with alpha, on top.
    f += clipIn(o.inputs.graphics, `${t}_gc`);
    f += `[${staged}][${t}_gc]overlay=x=0:y=0:format=auto:eof_action=pass,format=yuv420p[${t}_done];`;
    // Back on the episode's clock, replacing the picture for exactly these seconds.
    f += `[${t}_done]setpts=PTS-STARTPTS+${sec(from)}/TB[${t}_at];`;
    f += `[${t}_main][${t}_at]overlay=x=0:y=0:enable='between(t,${sec(from)},${sec(to)})':eof_action=pass,format=yuv420p[${outLabel}];`;
    return f;
}

// For the tests and the preview: the progress a drawn frame should show, straight from lib/reframe.ts,
// so the expression and the library can be compared at sampled times.
export const expectedProgress = (k: LayoutKeyframes, msIntoHighlight: number, durationMs: number) =>
    progressAt(k, msIntoHighlight, durationMs, easeSegments());
