// Spec 020 item E1, the Studio editor's layout: pane sizes read back from the browser, and fitted
// to the window.
// Run: npx tsx --test lib/workspace.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPanes, DEFAULT_PANES, fitPanes, MIN_MAIN_PX, MIN_PREVIEW_PX, PANE_LIMITS, RAIL_PX } from './workspace';

test('missing or broken sizes fall back to the defaults', () => {
    assert.deepEqual(clampPanes(null), DEFAULT_PANES);
    assert.deepEqual(clampPanes('wide'), DEFAULT_PANES);
    assert.deepEqual(clampPanes({ scriptPx: 'x', panelPx: NaN, timelinePx: Infinity }), DEFAULT_PANES);
});

test('saved sizes are kept within their limits and rounded', () => {
    assert.deepEqual(clampPanes({ scriptPx: 500.4, panelPx: 10, timelinePx: 9999 }),
        { scriptPx: 500, panelPx: PANE_LIMITS.panelPx[0], timelinePx: PANE_LIMITS.timelinePx[1] });
});

test('a window that fits everything changes nothing', () => {
    assert.deepEqual(fitPanes(DEFAULT_PANES, 1920, 1000), DEFAULT_PANES);
});

test('a narrow window shrinks the script first, then the panel, to keep the preview', () => {
    const width = DEFAULT_PANES.scriptPx + DEFAULT_PANES.panelPx + RAIL_PX + MIN_PREVIEW_PX - 100;
    const fitted = fitPanes(DEFAULT_PANES, width, 1000);
    assert.equal(fitted.scriptPx, DEFAULT_PANES.scriptPx - 100);
    assert.equal(fitted.panelPx, DEFAULT_PANES.panelPx);

    const tight = fitPanes(DEFAULT_PANES, 1050, 1000);
    assert.equal(tight.scriptPx, PANE_LIMITS.scriptPx[0]);
    assert.equal(tight.scriptPx + tight.panelPx + RAIL_PX + MIN_PREVIEW_PX, 1050);

    const tiny = fitPanes(DEFAULT_PANES, 600, 1000);
    assert.equal(tiny.scriptPx, PANE_LIMITS.scriptPx[0]);
    assert.equal(tiny.panelPx, PANE_LIMITS.panelPx[0]);
});

test('a short window shrinks the timeline, never below its limit', () => {
    assert.equal(fitPanes(DEFAULT_PANES, 1920, 500).timelinePx, 500 - MIN_MAIN_PX);
    assert.equal(fitPanes(DEFAULT_PANES, 1920, 200).timelinePx, PANE_LIMITS.timelinePx[0]);
});
