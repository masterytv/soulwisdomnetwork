// Shared by every graphics template (docs/specs/021-motion-graphics.md, item M1). A template reads its data
// from window.GRAPHIC (set before this runs: the renderer injects it, the editor's preview writes it into
// the iframe's document) and describes each element's motion as an in part and an out part; the hold between
// them stretches to fill GRAPHIC.durationMs. Everything becomes one paused Web Animation per element, so
// window.seek(ms) draws the exact frame for any moment, in any order — the renderer screenshots frame by
// frame, and the editor's sandboxed iframe seeks it to the video's time (posted as {t:'seek', ms}).
(() => {
    'use strict';

    const anims = [];
    const total = () => Math.max(1, (window.GRAPHIC && window.GRAPHIC.durationMs) || 5000);

    // The house curves (the spec's "Motion"): enter eases out long; exits just fade.
    const EASE = 'cubic-bezier(.22,1,.36,1)';
    const PICTURE_EASE = 'cubic-bezier(.65,0,.25,1)';

    // One element's motion. `enter` and `exit` are keyframe lists whose `at` is 0..1 of their own part;
    // the last enter keyframe is held until the exit begins. `delay`, `inMs` and `outMs` are squeezed
    // together when the graphic is shorter than they need.
    function animate(el, o) {
        const T = total();
        const squeeze = Math.min(1, T / ((o.delay || 0) + o.inMs + o.outMs + 1));
        const d = (o.delay || 0) * squeeze, inMs = o.inMs * squeeze, outMs = o.outMs * squeeze;
        const off = ms => Math.min(1, Math.max(0, ms / T));
        const frame = (k, offset) => {
            const props = { ...k };
            delete props.at;
            delete props.easing;
            return { ...props, offset, easing: k.easing || EASE };
        };
        const keyframes = [];
        // Hidden through the delay, then the enter keyframes over the in part.
        keyframes.push(frame(o.enter[0], 0));
        if (d > 0) keyframes.push(frame(o.enter[0], off(d)));
        for (const k of o.enter.slice(1)) keyframes.push(frame(k, off(d + (k.at ?? 1) * inMs)));
        // The hold: the last enter keyframe, kept until the out part begins.
        const held = o.enter[o.enter.length - 1];
        keyframes.push(frame(held, off(T - outMs)));
        for (const k of o.exit) keyframes.push(frame(k, off(T - outMs + (k.at ?? 1) * outMs)));
        // Offsets must never step back (a squeezed delay can land on the frame before).
        let last = 0;
        for (const k of keyframes) { k.offset = Math.max(k.offset, last); last = k.offset; }
        const a = el.animate(keyframes, { duration: T, fill: 'both' });
        a.pause();
        anims.push(a);
        return a;
    }

    window.graphicRuntime = { animate, EASE, PICTURE_EASE, total };

    window.seek = ms => {
        const t = Math.min(Math.max(0, ms), total());
        for (const a of anims) a.currentTime = t;
    };

    // The editor's preview drives the iframe from outside (components/studio/graphics.tsx).
    window.addEventListener('message', e => {
        const d = e.data;
        if (d && d.t === 'seek' && typeof d.ms === 'number') window.seek(d.ms);
    });
})();
