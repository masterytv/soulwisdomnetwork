// The motion graphics contract (docs/specs/021-motion-graphics.md, item M1): the graphic layer's schema
// and limits (the edit route refuses a bad save), the clip the render overlays, and the document the
// editor's preview mounts. Run: npx tsx --test lib/graphics.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asVideoLayer, drawnMs, episodeAnchored, GRAPHIC_MAX_MS, graphicSpec, graphicSrcDoc, programmeWindow } from './graphics';
import { GraphicLayerSchema, LayersSchema, layerKind, layerName, layerSpan, motionChapter, motionEndScreen, motionGraphics, motionLogoBug, motionLowerThird, motionPullQuote, positionOf, type GraphicLayer } from './layers';
import { sequenceLength, sequenceOf } from './sequence';

const COLORS = { background: '#140a2e', backgroundBottom: '#2a1552', accent: '#f7c65b' };

type LowerThird = Extract<GraphicLayer, { template: 'lowerThird' }>;
const graphic = (over: Partial<LowerThird> = {}): LowerThird => ({ ...motionLowerThird(2000, 'Maria Santos', false) as LowerThird, id: 'm1', ...over });

test('schema: a motion lower third round-trips, and the factory makes a valid one', () => {
    const g = graphic();
    const parsed = GraphicLayerSchema.safeParse(JSON.parse(JSON.stringify(g)));
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data, g);
    assert.ok(LayersSchema.safeParse([g, motionLowerThird(0, 'Tom Wood', true)]).success);
    const host = motionLowerThird(0, 'Tom Wood', true) as LowerThird;
    assert.deepEqual([host.fields.variant, host.fields.descriptor], ['host', 'HOST']);
});

test('schema: bad fields are refused — unknown keys, over-long text, a made-up variant', () => {
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), fields: { name: 'A', descriptor: '', variant: 'guest', extra: 'no' } }).success, false);
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), fields: { name: 'x'.repeat(201), descriptor: '', variant: 'guest' } }).success, false);
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), fields: { name: 'A', descriptor: '', variant: 'narrator' } }).success, false);
    assert.equal(GraphicLayerSchema.safeParse({ ...graphic(), template: 'titleCard' }).success, false);
    const trimmed = GraphicLayerSchema.parse({ ...graphic(), fields: { name: '  Maria  ', descriptor: ' x ', variant: 'guest' } }) as LowerThird;
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
    const doc = graphicSrcDoc(html, { fields: { name: '</script><b>x' }, colors: COLORS, durationMs: 4000, width: 1920, height: 1080, logo: null });
    assert.ok(doc.indexOf('window.GRAPHIC') < doc.indexOf('window.ran'));
    assert.ok(!doc.includes('</script><b>x'));
    assert.ok(doc.includes('\\u003c/script>\\u003cb>x'));
});

// ─── M2: the full template set, programme anchors and placement ──────────────

test('M2 schema: each template checks its own fields; the end screen may anchor fromEnd', () => {
    const chapter = motionChapter(5000, 2, 'The middle');
    assert.ok(GraphicLayerSchema.safeParse(chapter).success);
    assert.equal(GraphicLayerSchema.safeParse({ ...chapter, fields: { number: '2' } }).success, false);
    const end = motionEndScreen();
    const parsed = GraphicLayerSchema.safeParse(JSON.parse(JSON.stringify(end)));
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data!.anchor, { fromEnd: 20_000 });
    // Only the logo bug may run the whole episode; anything else is capped at the drawn length.
    assert.ok(GraphicLayerSchema.safeParse(motionLogoBug()).success);
    assert.equal(GraphicLayerSchema.safeParse({ ...motionPullQuote(0, 'Q', 'S'), durationMs: 24 * 3600_000 }).success, false);
});

test('M2: programme anchors — layerSpan leaves them out, programmeWindow places them against the end', () => {
    const end = motionEndScreen();
    assert.equal(layerSpan(end, [{ startMs: 0, endMs: 60_000 }], 60_000), null);
    assert.deepEqual(programmeWindow(end, 90_000), { startMs: 70_000, endMs: 90_000 });
    assert.deepEqual(programmeWindow(end, 10_000), { startMs: 0, endMs: 10_000 });
    assert.equal(programmeWindow(motionLogoBug(), 90_000), null);
    assert.ok(episodeAnchored(motionLogoBug().anchor));
    assert.ok(!episodeAnchored(end.anchor));
    assert.throws(() => asVideoLayer(end, 'episodes/abcdefghij/graphics/x.mov'), /programme-anchored/);
});

test('M2: the logo bug is drawn short and looped; everything else is drawn for its layer', () => {
    assert.equal(drawnMs('logoBug', 24 * 3600_000), 12_000);
    assert.equal(drawnMs('lowerThird', 5000), 5000);
    assert.equal(drawnMs('pullQuote', 120_000), GRAPHIC_MAX_MS);
});

test('M2 placement: title card with the guest, a third per speaker, chapters after the first, bug and end screen', () => {
    const layers = motionGraphics({
        title: 'The field around us', show: 'Soul Wisdom Collective',
        words: [
            { speaker: 'Daniel Endy', start: 1200 }, { speaker: 'Maria Santos', start: 8000 },
            { speaker: 'Daniel Endy', start: 20_000 }, { speaker: 'Tom Wood', start: 31_000 },
        ],
        chapters: [{ title: 'Start', startMs: 0 }, { title: 'The middle', startMs: 600_000 }, { title: 'The close', startMs: 1_500_000 }],
        hosts: ['Daniel Endy', 'Tom Wood'],
    });
    const by = (t: string) => layers.filter(l => l.template === t);
    const card = by('titleCard')[0] as Extract<GraphicLayer, { template: 'titleCard' }>;
    assert.deepEqual(card.fields, { title: 'The field around us', guest: 'Maria Santos', show: 'Soul Wisdom Collective' });
    const thirds = by('lowerThird') as Extract<GraphicLayer, { template: 'lowerThird' }>[];
    assert.deepEqual(thirds.map(t => [t.fields.name, t.fields.variant]), [['Daniel Endy', 'host'], ['Maria Santos', 'guest'], ['Tom Wood', 'host']]);
    assert.deepEqual(thirds.map(t => t.anchor), [{ srcMs: 1200 }, { srcMs: 8000 }, { srcMs: 31_000 }]);
    const chapters = by('chapter') as Extract<GraphicLayer, { template: 'chapter' }>[];
    assert.deepEqual(chapters.map(c => [c.fields.number, c.fields.title]), [['2', 'The middle'], ['3', 'The close']]);
    assert.equal(by('logoBug').length, 1);
    assert.equal(by('endScreen').length, 1);
    assert.ok(LayersSchema.safeParse(layers).success);
});

test('M2: a starlight join never shortens the timeline, and is kept for the render to cover', () => {
    const edit = { cuts: [], splits: [10_000], joins: [{ at: { atSplit: 10_000 }, transition: 'starlight' as const, durationMs: 1000 }] };
    const seq = sequenceOf(edit, 20_000);
    assert.equal(sequenceLength(seq.clips), 20_000);
    assert.deepEqual(seq.joins.map(j => [j.transition, j.splitMs, j.durationMs]), [['starlight', 10_000, 1000]]);
    const dissolve = sequenceOf({ ...edit, joins: [{ at: { atSplit: 10_000 }, transition: 'dissolve' as const, durationMs: 1000 }] }, 20_000);
    assert.equal(sequenceLength(dissolve.clips), 19_000);
});
