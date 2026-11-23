// The Social calendar (docs/specs/026-social-publishing.md, stage 5): months, weeks, Eastern days and times, entries,
// what shows and the totals.
// Run: npx tsx --test lib/social/calendar.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, byDay, calendarEntry, dayLabel, etTime, monthName, monthOf, monthRange, monthTotals, monthWeeks, shiftMonth, type CalendarPost } from './calendar';

const now = Date.parse('2026-11-23T20:00:00Z');     // 3 pm ET, Monday 23 November 2026

test('monthOf, shiftMonth, monthName', () => {
    assert.equal(monthOf('2026-12', now), '2026-12');
    assert.equal(monthOf('2026-13', now), '2026-11');
    assert.equal(monthOf(null, now), '2026-11');
    assert.equal(monthOf(null, Date.parse('2026-12-01T03:00:00Z')), '2026-11');    // still 30 Nov in ET
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    assert.equal(monthName('2026-11'), 'November 2026');
});

test('monthRange: midnight Eastern at each end', () => {
    const r = monthRange('2026-11');
    assert.equal(new Date(r.from).toISOString(), '2026-11-01T04:00:00.000Z');     // EDT until 1 Nov, 2 am
    assert.equal(new Date(r.to).toISOString(), '2026-12-01T05:00:00.000Z');
});

test('monthWeeks: Sunday first, whole weeks, the edges marked', () => {
    const weeks = monthWeeks('2026-11');                 // 1 Nov 2026 is a Sunday
    assert.equal(weeks[0][0].day, '2026-11-01');
    assert.equal(weeks.length, 5);
    assert.equal(weeks[4][6].day, '2026-12-05');
    assert.equal(weeks[4][6].inMonth, false);
    const dec = monthWeeks('2026-12');                   // 1 Dec 2026 is a Tuesday
    assert.equal(dec[0][0].day, '2026-11-29');
    assert.equal(dec[0][2].day, '2026-12-01');
    assert.ok(dec.every(w => w.length === 7));
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(dayLabel('2026-11-23'), 'Monday, November 23');
});

function post(over: Partial<CalendarPost>): CalendarPost {
    return {
        id: 'ep_s_reel', kind: 'reel', status: 'sent', postAt: Date.parse('2026-11-25T00:00:00Z'), platforms: ['instagram', 'facebook'],
        results: {}, shortTitle: 'Coming home', speaker: 'Jo Ann H', ...over,
    };
}

test('calendarEntry: the Eastern day and time, the kind, live links once posted, the Social page while it lists it', () => {
    const e = calendarEntry(post({
        status: 'partial',
        results: { instagram: { ok: true, url: 'https://instagram.com/p/x', postId: 'x', error: null }, facebook: { ok: false, url: null, postId: null, error: 'no' } },
    }), now);
    assert.equal(e.day, '2026-11-24');                   // 7 pm ET on the 24th
    assert.equal(e.time, '7pm');
    assert.equal(e.kind, 'Reel');
    assert.deepEqual(e.platforms, [
        { name: 'IG', full: 'Instagram', url: 'https://instagram.com/p/x', ok: true },
        { name: 'FB', full: 'Facebook', url: null, ok: false },
    ]);
    assert.equal(e.href, '/admin/podcast/social#post-ep_s_reel');
    assert.equal(calendarEntry(post({ postAt: Date.parse('2026-10-01T00:00:00Z') }), now).href, null);   // older than 14 days
    assert.equal(etTime(Date.parse('2026-11-25T00:30:00Z')), '7:30pm');
    assert.equal(calendarEntry(post({ kind: 'image' }), now).kind, 'Quote');
});

test('byDay: soonest first; not made never shown; cancelled only when asked; totals', () => {
    const list = [
        post({ id: 'b', kind: 'image', status: 'waiting', postAt: Date.parse('2026-11-25T00:30:00Z') }),
        post({ id: 'a', kind: 'carousel', status: 'posted', postAt: Date.parse('2026-11-25T00:00:00Z') }),
        post({ id: 'c', status: 'cancelled', postAt: Date.parse('2026-11-26T00:00:00Z') }),
        post({ id: 'd', status: 'cancelled', notMade: true, postAt: Date.parse('2026-11-26T00:00:00Z') }),
        post({ id: 'e', status: 'missed', postAt: Date.parse('2026-11-20T17:00:00Z') }),
    ];
    const days = byDay(list, now);
    assert.deepEqual([...days.keys()], ['2026-11-20', '2026-11-24']);
    assert.deepEqual(days.get('2026-11-24')!.map(e => e.id), ['a', 'b']);
    assert.deepEqual(monthTotals(days), { posted: 1, planned: 1, failed: 1 });
    const all = byDay(list, now, true);
    assert.deepEqual(all.get('2026-11-25')!.map(e => e.id), ['c']);
    assert.deepEqual(monthTotals(all), { posted: 1, planned: 1, failed: 1 });
});
