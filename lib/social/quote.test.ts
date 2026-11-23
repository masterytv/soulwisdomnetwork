// The image post (docs/specs/026-social-publishing.md, stage 3): the checks on Claude's quote and gold phrase, the
// frame crop, the card's HTML and the captions.
// Run: npx tsx --test lib/social/quote.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkQuote, fallbackGold, frameTimes, isVerbatim, quoteSystem, wordsOf } from './quote';
import { CARD_HEIGHT, CARD_WIDTH, cropAround, escapeHtml, GOLD, quoteCardHtml, quoteSize, withGold } from './cards';
import { imageCaptions } from './captions';
import { feedPostAt, feedSlot, PLANNED_KINDS } from './plan';

const spoken = 'So um I I remember standing there and I felt what everyone around me felt, and it was all love. Nothing else mattered.';

test('isVerbatim: the speaker\'s words in order, fillers and stammers aside, nothing paraphrased', () => {
    assert.equal(isVerbatim('I felt what everyone around me felt, and it was all love.', spoken), true);
    assert.equal(isVerbatim('I remember standing there', spoken), true);           // "I I" stammer
    assert.equal(isVerbatim('i FELT what everyone around me felt — and it was all love', spoken), true);
    assert.equal(isVerbatim('I felt what everyone felt, and it was all love.', spoken), false);   // a word left out
    assert.equal(isVerbatim('I felt the love of everyone around me', spoken), false);
    assert.equal(isVerbatim('', spoken), false);
    assert.deepEqual(wordsOf('Um, it’s *all* love!'), ["it's", 'all', 'love']);
});

test('checkQuote: keeps a verbatim quote with its exact gold phrase', () => {
    const c = checkQuote({ quote: '“I felt what everyone around me felt, and it was all love.”', gold: 'it was all love', frame: 3, centre: 0.4 }, spoken, 6);
    assert.deepEqual(c, { ok: true, quote: 'I felt what everyone around me felt, and it was all love.', gold: 'it was all love', frame: 3, centre: 0.4, goldFallback: false });
});

test('checkQuote: refuses what is not the speaker\'s words, too short, too long or limited', () => {
    assert.equal(checkQuote({ quote: 'I felt the love of everyone around me that day.', gold: 'the love', frame: 1, centre: 0.5 }, spoken, 6).ok, false);
    assert.equal(checkQuote({ quote: 'it was all love', gold: 'all love', frame: 1, centre: 0.5 }, spoken, 6).ok, false);
    const long = 'word '.repeat(60).trim();
    assert.equal(checkQuote({ quote: long, gold: 'word word', frame: 1, centre: 0.5 }, long, 6).ok, false);
    const limited = 'After the overdose I saw a light that changed everything for me.';
    const r = checkQuote({ quote: limited, gold: 'a light', frame: 1, centre: 0.5 }, limited, 6);
    assert.deepEqual(r, { ok: false, why: 'The quote has a word the platforms limit' });
});

test('checkQuote: a gold phrase not copied exactly, or too long, becomes the quote\'s last clause; frame and centre kept in range', () => {
    const c = checkQuote({ quote: 'I felt what everyone around me felt, and it was all love.', gold: 'It Was All Love', frame: 9, centre: 1.4 }, spoken, 6);
    assert.ok(c.ok);
    if (!c.ok) return;
    assert.equal(c.gold, 'and it was all love');
    assert.equal(c.goldFallback, true);
    assert.equal(c.frame, 1);
    assert.equal(c.centre, 1);
    assert.equal(fallbackGold('We think we are here to get somewhere, but the soul is never in any kind of hurry at all.'), 'hurry at all');
});

test('the system prompt carries the limited-words rule and the gold example', () => {
    assert.match(quoteSystem(), /it was all love/);
    assert.match(quoteSystem(), /unalive/);
});

test('frameTimes: spread over the Short, away from its ends', () => {
    assert.deepEqual(frameTimes(10_000, 80_000, 6), [20_000, 30_000, 40_000, 50_000, 60_000, 70_000]);
});

test('cropAround: 4:5, as tall as the frame, centred on the speaker and kept inside', () => {
    assert.deepEqual(cropAround(1920, 1080, 0.5), { x: 528, y: 0, width: 864, height: 1080 });
    assert.deepEqual(cropAround(1920, 1080, 0), { x: 0, y: 0, width: 864, height: 1080 });
    assert.deepEqual(cropAround(1920, 1080, 1), { x: 1056, y: 0, width: 864, height: 1080 });
    assert.deepEqual(cropAround(1920, 1080, NaN), { x: 528, y: 0, width: 864, height: 1080 });
    const c = cropAround(1920, 1080, 0.3);
    assert.equal(c.width / c.height, 0.8);
});

const ASSETS = { logoUrl: 'L', outfitUrl: 'O', outfitBlackUrl: 'OB', cinzelUrl: 'C' };

test('quoteCardHtml: the logo, the gold phrase in the accent, the speaker, escaped text', () => {
    const html = quoteCardHtml({ pictureUrl: 'P', quote: 'Love <is> all & more', gold: 'all & more', speaker: 'Jo Ann <H>', show: 'Soul Wisdom Collective' }, ASSETS);
    assert.match(html, /<img class="logo" src="L"/);
    assert.match(html, /<span class="gold">all &amp; more<\/span>/);
    assert.match(html, /Love &lt;is&gt; /);
    assert.match(html, /Jo Ann &lt;H&gt;/);
    assert.ok(html.includes(GOLD));
    assert.ok(html.includes(`width: ${CARD_WIDTH}px; height: ${CARD_HEIGHT}px`));
    assert.equal(withGold('abc', 'zzz'), 'abc');
    assert.equal(escapeHtml('"<&>"'), '&quot;&lt;&amp;&gt;&quot;');
    assert.ok(quoteSize(50) > quoteSize(200));
});

test('imageCaptions: the quote, the speaker credited, the episode linked and tagged', () => {
    const c = imageCaptions({
        quote: 'It was all love.', speaker: 'Jo Ann H', show: 'Soul Wisdom Collective',
        episode: { url: 'https://soulwisdomcollective.com/videos', linkText: 'Full episodes' }, shortId: 's1', hashtags: ['nde'],
    });
    assert.equal(c.instagramCaption, '“It was all love.”\n\n— Jo Ann H, on Soul Wisdom Collective\n\nFull episodes: https://soulwisdomcollective.com/videos?utm_source=instagram&utm_medium=image&utm_campaign=s1\n\n#nde #soulwisdom');
    assert.match(c.facebookCaption, /utm_source=facebook&utm_medium=image/);
});

test('image posts queue one a day at 7:30 pm ET after the Reel', () => {
    assert.deepEqual(PLANNED_KINDS, ['reel', 'carousel', 'image']);
    const reelAt = Date.parse('2026-11-24T17:00:00Z'), now = Date.parse('2026-11-24T12:00:00Z');
    const first = feedPostAt('image', { lastTaken: null, reelAt, now });
    assert.equal(new Date(first).toISOString(), '2026-11-25T00:30:00.000Z');
    // The next Short's Reel the same day: its image post goes the next day.
    assert.equal(new Date(feedPostAt('image', { lastTaken: first, reelAt: reelAt + 4 * 3_600_000, now })).toISOString(), new Date(feedSlot('image', '2026-11-25')).toISOString());
});
