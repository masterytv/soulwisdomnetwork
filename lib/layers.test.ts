// Spec 020 item E5: layers, grown from Part I's overlays.
// Run: npx tsx --test lib/layers.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    alignFractions, anchorCut, brollLayer, layerFromBin, LayerSchema, layersAss, LayersSchema, layerSpan, layersOf, lookAt,
    overlayXY, pictureFilter, layerAudioFilter, placeOf, startAt, textEvents, toLayer, type ImageLayer, type TextLayer, type VideoLayer,
} from './layers';
import type { ImageOverlay, TextOverlay } from './onScreen';

const title: TextOverlay = {
    id: 'title-1', type: 'text', atMs: 12_000, seconds: 5, text: 'Daniel Endy', subtext: 'Host',
    font: 'Outfit SemiBold', size: 'medium', color: '#ffffff', background: 'box', position: 'bottom-left',
};
const logo: ImageOverlay = { id: 'o1', type: 'image', atMs: 0, seconds: 30, path: 'overlays/abc.png', name: 'logo.png', position: 'top-right', widthPct: 20 };

test('overlays convert to layers at the same spot, time and look', () => {
    const t = toLayer(title) as TextLayer;
    assert.equal(t.kind, 'text');
    assert.equal(t.track, 3);
    assert.deepEqual(t.anchor, { srcMs: 12_000 });
    assert.equal(t.durationMs, 5000);
    // 90 px in from the left and 80 up from the bottom, pinned by its bottom-left point (1).
    assert.deepEqual(t.place, { x: 90 / 1920, y: 1 - 80 / 1080, align: 1 });
    assert.deepEqual([t.in, t.out], [{ transition: 'fade', durationMs: 250 }, { transition: 'fade', durationMs: 250 }]);
    const i = toLayer(logo) as ImageLayer;
    assert.deepEqual(i.place, { x: 1 - 60 / 1920, y: 60 / 1080, align: 9 });
    assert.equal(i.w, 0.2);
    assert.deepEqual(i.media, { path: 'overlays/abc.png', name: 'logo.png' });
    assert.equal(i.in.transition, 'none');
    // A full-width image sits on the edge, as before.
    assert.deepEqual((toLayer({ ...logo, position: 'bottom', widthPct: 100 }) as ImageLayer).place, { x: 0.5, y: 1, align: 2 });
    assert.ok(LayersSchema.safeParse([t, i]).success);
    assert.deepEqual(layersOf({ overlays: [title, logo] }).map(l => l.id), ['title-1', 'o1']);
    assert.deepEqual(layersOf({ layers: [], overlays: [title] }), []);
});

test('the overlay filter puts an image where the nine positions did', () => {
    const i = toLayer(logo) as ImageLayer;
    const { x, y } = overlayXY(i, { startMs: 0, endMs: 5000 });
    // top right, 60 px in: x = W - 60 - w, y = 60.
    assert.equal(x, '(0.96875*W-1*w)');
    assert.equal(y, '(0.05556*H-0*h)');
    assert.deepEqual(alignFractions(5), { fx: 0.5, fy: 0.5 });
    assert.deepEqual(alignFractions(1), { fx: 0, fy: 1 });
    assert.deepEqual(alignFractions(9), { fx: 1, fy: 0 });
});

test('b-roll from the notes plan becomes a full-frame layer with a slow zoom and half-second fades', () => {
    const b = brollLayer({ index: 2, startMs: 61_234.4, durationSeconds: 6, path: 'episodes/abcdefghij/broll/3.png', idea: 'A candle' });
    assert.deepEqual({ ...b }, {
        id: 'broll-2', kind: 'image', track: 2, anchor: { srcMs: 61_234 }, durationMs: 6000, place: { x: 0, y: 0, align: 7 }, opacity: 1,
        in: { transition: 'fade', durationMs: 500 }, out: { transition: 'fade', durationMs: 500 },
        media: { path: 'episodes/abcdefghij/broll/3.png', name: 'A candle' }, w: 1, motion: 'kenBurnsIn',
    });
    assert.ok(LayerSchema.safeParse(b).success);
});

test('the schema refuses files outside the Studio, and two layers with one id', () => {
    const i = toLayer(logo);
    for (const path of ['../secret', 'users/x.png', 'overlays/../a.png', 'episodes/short/x.png']) {
        assert.equal(LayerSchema.safeParse({ ...i, media: { path, name: 'x' } }).success, false, path);
    }
    assert.ok(LayerSchema.safeParse({ ...i, media: { path: 'settings/logo-1.png', name: 'Logo' } }).success);
    assert.equal(LayersSchema.safeParse([i, i]).success, false);
    assert.equal(LayerSchema.safeParse({ ...i, durationMs: 100 }).success, false);
});

test('times: a layer follows its words through cuts, or stays pinned; it never runs past the end', () => {
    const ranges = [{ startMs: 0, endMs: 10_000 }, { startMs: 20_000, endMs: 30_000 }];   // 10 s cut
    const t = toLayer(title);   // at 12 s of the recording: cut, so it shows at the next kept moment
    assert.deepEqual(layerSpan(t, ranges, 20_000), { startMs: 10_000, endMs: 15_000 });
    assert.equal(anchorCut(t, ranges), true);
    assert.deepEqual(layerSpan({ ...t, anchor: { srcMs: 25_000 } }, ranges, 20_000), { startMs: 15_000, endMs: 20_000 });
    assert.deepEqual(layerSpan({ ...t, anchor: { atMs: 3_000 } }, ranges, 20_000), { startMs: 3_000, endMs: 8_000 });
    assert.equal(layerSpan({ ...t, anchor: { srcMs: 40_000 } }, ranges, 20_000), null);
    // Moving keeps the anchor's kind.
    const back = (atMs: number) => (atMs < 10_000 ? atMs : atMs + 10_000);
    assert.deepEqual(startAt(t, 12_000, back).anchor, { srcMs: 22_000 });
    assert.deepEqual(startAt({ ...t, anchor: { atMs: 3_000 } }, 12_000, back).anchor, { atMs: 12_000 });
});

test('the preview: fades scale the opacity, slides come from and go to the side they move along', () => {
    const span = { startMs: 1000, endMs: 5000 };
    const fade = { opacity: 0.8, in: { transition: 'fade' as const, durationMs: 1000 }, out: { transition: 'fade' as const, durationMs: 1000 } };
    assert.equal(lookAt(fade, span, 999), null);
    assert.ok(Math.abs(lookAt(fade, span, 1500)!.opacity - 0.4) < 1e-9);
    assert.equal(lookAt(fade, span, 3000)!.opacity, 0.8);
    assert.ok(Math.abs(lookAt(fade, span, 4750)!.opacity - 0.2) < 1e-9);
    const slide = { opacity: 1, in: { transition: 'slideLeft' as const, durationMs: 1000 }, out: { transition: 'slideDown' as const, durationMs: 1000 } };
    assert.deepEqual(lookAt(slide, span, 1000), { opacity: 1, dx: 1, dy: 0 });        // enters from the right
    assert.deepEqual(lookAt(slide, span, 1500), { opacity: 1, dx: 0.5, dy: 0 });
    assert.deepEqual(lookAt(slide, span, 3000), { opacity: 1, dx: 0, dy: 0 });
    assert.deepEqual(lookAt(slide, span, 4500), { opacity: 1, dx: 0, dy: 0.5 });       // leaves downwards
});

test('the render: a picture is trimmed, scaled, faded and laid over while it is up', () => {
    const i = { ...toLayer(logo), in: { transition: 'fade', durationMs: 500 }, out: { transition: 'fade', durationMs: 500 }, opacity: 0.5 } as ImageLayer;
    const f = pictureFilter(3, 'epv', 'l0', i, { startMs: 2000, endMs: 7000 });
    assert.equal(f,
        '[3:v]trim=start=0.000:duration=5.000,setpts=PTS-STARTPTS,fps=30,scale=384:-2,format=rgba,fade=t=in:st=0:d=0.500:alpha=1,' +
        'fade=t=out:st=4.500:d=0.500:alpha=1,colorchannelmixer=aa=0.500,setpts=PTS+2.000/TB[l0_p];' +
        "[epv][l0_p]overlay=x='(0.96875*W-1*w)':y='(0.05556*H-0*h)':enable='between(t,2.000,7.000)':eof_action=pass,format=yuv420p[l0];");
    const v: VideoLayer = {
        id: 'v1', kind: 'video', track: 2, anchor: { srcMs: 0 }, durationMs: 4000, place: { x: 0, y: 0, align: 7 }, opacity: 1,
        in: { transition: 'slideRight', durationMs: 1000 }, out: { transition: 'none', durationMs: 0 },
        media: { path: 'episodes/abcdefghij/media/m1.mp4', name: 'clip' }, w: 1, trimInMs: 2500, volumeDb: -6,
    };
    const vf = pictureFilter(4, 'epv', 'l1', v, { startMs: 1000, endMs: 5000 });
    assert.match(vf, /^\[4:v\]trim=start=2\.500:duration=4\.000,/);
    // Enters from the left: from -w to its place over the first second.
    assert.match(vf, /x='if\(lt\(t,2\.000\),\(-w\)\+\(\(\(0\.00000\*W-0\*w\)\)-\(-w\)\)\*\(t-1\.000\)\/1\.000,\(0\.00000\*W-0\*w\)\)'/);
    assert.equal(layerAudioFilter(4, 'la1', v, { startMs: 1000, endMs: 5000 }),
        '[4:a]atrim=start=2.500:duration=4.000,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=-6dB,' +
        'afade=t=in:d=0.05,afade=t=out:st=3.950:d=0.05,adelay=1000|1000[la1];');
    assert.equal(layerAudioFilter(4, 'la1', { ...v, volumeDb: null }, { startMs: 1000, endMs: 5000 }), null);
});

test('the render: text is pinned with \\an and \\pos where the nine positions put it, and slides with \\move', () => {
    const t = toLayer(title) as TextLayer;
    assert.deepEqual(textEvents(t, { startMs: 1000, endMs: 6000 }, 'Text1'),
        ['Dialogue: 1,0:00:01.00,0:00:06.00,Text1,,0,0,0,,{\\an1\\pos(90,1000)\\fad(250,250)}Daniel Endy\\N{\\fs36}Host']);
    const slid: TextLayer = { ...t, opacity: 0.5, in: { transition: 'slideUp', durationMs: 500 }, out: { transition: 'fade', durationMs: 300 } };
    assert.deepEqual(textEvents(slid, { startMs: 1000, endMs: 6000 }, 'T'), [
        'Dialogue: 1,0:00:01.00,0:00:01.50,T,,0,0,0,,{\\an1\\move(90,1280,90,1000)\\alpha&H80&}Daniel Endy\\N{\\fs36}Host',
        'Dialogue: 1,0:00:01.50,0:00:06.00,T,,0,0,0,,{\\an1\\pos(90,1000)\\fad(0,300)\\alpha&H80&}Daniel Endy\\N{\\fs36}Host',
    ]);
    const ass = layersAss([], null, [{ layer: t, span: { startMs: 0, endMs: 1000 } }])!;
    assert.match(ass, /^Style: Text1,Outfit SemiBold,60,/m);
    assert.equal(layersAss([], null, []), null);
});

test('the bin: a picture, the logo, b-roll and video each get a sensible layer; sound waits for E7', () => {
    const img = layerFromBin({ id: 'm1', kind: 'image', source: 'upload', path: 'episodes/abcdefghij/media/m1.png', name: 'Photo' }, 5000) as ImageLayer;
    assert.deepEqual([img.w, img.place.align, img.durationMs, img.anchor], [0.2, 9, 5000, { srcMs: 5000 }]);
    const lg = layerFromBin({ id: 'logo', kind: 'image', source: 'logo', path: 'settings/logo-1.png', name: 'Logo' }, 0) as ImageLayer;
    assert.deepEqual([lg.w, lg.durationMs, lg.opacity], [0.12, 60_000, 0.9]);
    const br = layerFromBin({ id: 'b', kind: 'image', source: 'broll', path: 'episodes/abcdefghij/broll/1.png', name: 'A candle', seconds: 8, index: 0 }, 9000) as ImageLayer;
    assert.deepEqual([br.w, br.motion, br.durationMs, br.anchor], [1, 'kenBurnsIn', 8000, { srcMs: 9000 }]);
    const v = layerFromBin({ id: 't', kind: 'video', source: 'teaser', path: 'episodes/abcdefghij/package/t1.mp4', name: 'Teaser', durationMs: 95_000 }, 0) as VideoLayer;
    assert.deepEqual([v.kind, v.w, v.durationMs, v.volumeDb], ['video', 1, 60_000, null]);
    assert.equal(layerFromBin({ id: 'a', kind: 'audio', source: 'upload', path: 'episodes/abcdefghij/media/a.mp3', name: 'Bed' }, 0), null);
    for (const l of [img, lg, br, v]) assert.ok(LayerSchema.safeParse(l).success, l.id);
    assert.deepEqual(placeOf('middle', 90, 80), { x: 0.5, y: 0.5, align: 5 });
});
