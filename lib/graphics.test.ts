// The motion graphics contract (docs/specs/021-motion-graphics.md, item M1): the graphic layer's schema
// and limits (the edit route refuses a bad save), the clip the render overlays, and the document the
// editor's preview mounts. Run: npx tsx --test lib/graphics.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asVideoLayer, GRAPHIC_MAX_MS, graphicSpec, graphicSrcDoc } from './graphics';
import { GraphicLayerSchema, LayersSchema, layerKind, layerName, layerSpan, motionLowerThird, positionOf, type GraphicLayer } from './layers';

const COLORS = { background: '#140a2e', backgroundBottom: '#2a1552', accent: '#f7c65b' };

const graphic = (over: Partial<GraphicLayer> = {}): GraphicLayer => ({ ...motionLowerThird(2000, 'Maria Santos', false), id: 'm1', ...over });

test('schema: a motion lower third round-trips, and the factory makes a valid one', () => {
    const g = graphic();
    const parsed = GraphicLayerSchema.safeParse(JSON.parse(JSON.stringify(g)));
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data, g);
    assert.ok(LayersSchema.safeParse([g, motionLowerThird(0, 'Tom Wood', true)]).success);
    const host = motionLowerThird(0, 'Tom Wood', true);
    assert.deepEqual([host.fields.variant, host.fields.descriptor], ['host', 'HOST']);
});

test('schema: bad fields are refused — unknown keys, over-long text, a made-up variant', () => {
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), fields: { name: 'A', descriptor: '', variant: 'guest', extra: 'no' } }).success, false);
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), fields: { name: 'x'.repeat(201), descriptor: '', variant: 'guest' } }).success, false);
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), fields: { name: 'A', descriptor: '', variant: 'narrator' } }).success, false);
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), template: 'titleCard' }).success, false);
    const trimmed = GraphicLayerSchema.parse({ ...graphic(), fields: { name: '  Maria  ', descriptor: ' x ', variant: 'guest' } });
    assert.deepEqual([trimmed.fields.name, trimmed.fields.descriptor], ['Maria', 'x']);
});

test('schema: the edges stay the template\'s own, and the length is capped', () => {
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), in: { transition: 'fade', durationMs: 300 } }).success, false);
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), durationMs: GRAPHIC_MAX_MS + 1000 }).success, false);
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), durationMs: 100 }).success, false);
});

test('the graphic names and spans like any layer, with no place of its own', () => {
    const g = graphic();
    assert.equal(layerKind(g), 'Lower third (motion)');
    assert.equal(layerName(g), 'Maria Santos');
    assert.equal(positionOf(g), 'custom');
    // Anchored at 2 s of the recording; a cut from 1-3 s moves it to the next kept moment.
    const ranges = [{ startMs: 0, endMs: 1000 }, { startMs: 3000, endMs: 10_000 }];
    assert.deepEqual(layerSpan(g, ranges, 8000), { startMs: 1000, endMs: 6000 });
});

test('asVideoLayer: the clip overlays silently across the whole frame, timed as the graphic', () => {
    const g = graphic({ opacity: 0.9 });
    const v = asVideoLayer(g, 'episodes/abcdefghij/graphics/lowerThird-aa.mov');
    assert.equal(v.kind, 'video');
    assert.deepEqual([v.track, v.anchor, v.durationMs, v.opacity], [g.track, g.anchor, g.durationMs, 0.9]);
    assert.deepEqual([v.w, v.trimInMs, v.volumeDb], [1, 0, null]);
    assert.deepEqual(v.place, { x: 0, y: 0, align: 7 });
    assert.deepEqual([v.in.transition, v.out.transition], ['none', 'none']);
    assert.equal(v.media.path, 'episodes/abcdefghij/graphics/lowerThird-aa.mov');
});

test('graphicSpec reads the Studio colours and caps the drawn length', () => {
    const spec = graphicSpec(graphic({ durationMs: 50_000 }), COLORS);
    assert.deepEqual([spec.template, spec.colors, spec.width, spec.height], ['lowerThird', COLORS, 1920, 1080]);
    assert.equal(spec.durationMs, 50_000);
});

test('graphicSrcDoc sets GRAPHIC before the template script, with no way out of the tag', () => {
    const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.ran = window.GRAPHIC</script></body></html>';
    const doc = graphicSrcDoc(html, { fields: { name: '</script><b>x' }, colors: COLORS, durationMs: 4000, width: 1920, height: 1080 });
    assert.ok(doc.indexOf('window.GRAPHIC') < doc.indexOf('window.ran'));
    assert.ok(!doc.includes('</script><b>x'));
    assert.ok(doc.includes('\\u003c/script>\\u003cb>x'));
});
