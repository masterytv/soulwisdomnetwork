// The story carousel (docs/specs/026-social-publishing.md, stage 4): the checks on Claude's slides, the host limit, the
// b-roll offered, the slides' HTML, the captions and the YouTube post's text.
// Run: npx tsx --test lib/social/carousel.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carouselFrameTimes, carouselPrompt, carouselSystem, checkSlides, HOST_FRAMES_MAX, MAX_STORY_SLIDES } from './carousel';
import { endSlideHtml, lineSize, storySlideHtml } from './cards';
import { carouselCaptions, youtubePostText } from './captions';
import { brollCredit, nearestBroll } from './picture';
import { feedPostAt, PLANNED_KINDS } from './plan';
import type { BrollImage } from '../../types/episode';

const spoken = 'I was sure I had nothing left to give. And then one morning I stopped fighting the silence, and it was all love.';
const frameIds = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
const brollIds = ['B1', 'B2', 'B3'];
const s = (picture: string, line: string, gold: string, centre = 0.5) => ({ picture, line, gold, centre });

const good = [
    s('F1', 'Jo Ann was sure she had nothing left to give.', 'nothing left to give', 0.4),
    s('B1', 'Then one morning she stopped fighting the silence.', 'stopped fighting the silence'),
    s('F2', 'The quiet started teaching her who she really was.', 'who she really was'),
    s('B2', '"It was all love," she remembers of that morning.', 'It was all love'),
];

test('checkSlides: keeps slides that pass, with their pictures and centres', () => {
    const c = checkSlides({ slides: good }, { frameIds, brollIds, spoken, host: false });
    assert.ok(c.ok);
    if (!c.ok) return;
    assert.equal(c.slides.length, 4);
    assert.deepEqual(c.slides[0], { picture: 'F1', line: 'Jo Ann was sure she had nothing left to give.', gold: 'nothing left to give', centre: 0.4 });
    assert.deepEqual(c.dropped, []);
});

test('checkSlides: drops a slide with a missing or reused picture, wrong length, limited word, false quote or loose gold', () => {
    const bad = [
        s('F9', 'A picture that does not exist at all here.', 'does not exist'),
        s('F1', 'The same picture used a second time over.', 'second time over'),
        s('F3', 'Too short.', 'Too short'),
        s('F4', 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.', 'one two'),
        s('F5', 'She survived an overdose and came back changed forever.', 'came back changed'),
        s('F6', '"I saw angels everywhere," she says about that day.', 'saw angels everywhere'),
        s('B3', 'Then one morning she stopped fighting the silence.', 'Stopped Fighting'),
    ];
    const c = checkSlides({ slides: [...good, ...bad] }, { frameIds, brollIds, spoken, host: false });
    assert.ok(c.ok);
    if (!c.ok) return;
    assert.equal(c.slides.length, 4);
    assert.deepEqual(c.dropped, [
        'Slide 5: no picture F9',
        'Slide 6: picture F1 used twice',
        'Slide 7: 2 words',
        'Slide 8: 16 words',
        'Slide 9: a limited word',
        'Slide 10: a quote that is not the speaker\'s words',
        'Slide 11: its gold phrase is not copied exactly from the line',
    ]);
});

test('checkSlides: fewer than 4 good slides make no carousel; more than 8 are cut', () => {
    const few = checkSlides({ slides: good.slice(0, 3) }, { frameIds, brollIds, spoken, host: false });
    assert.deepEqual(few, { ok: false, why: 'only 3 slides passed the checks (at least 4)', dropped: [] });
    const ids = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'B1', 'B2', 'B3'];
    const many = ids.map(id => s(id, 'Then one morning she stopped fighting the silence.', 'fighting the silence'));
    const c = checkSlides({ slides: many }, { frameIds, brollIds, spoken, host: false });
    assert.ok(c.ok && c.slides.length === MAX_STORY_SLIDES);
});

test('checkSlides: a host\'s carousel keeps at most 2 frames', () => {
    const slides = [
        s('F1', 'Tom was sure he had nothing left to give.', 'nothing left to give'),
        s('F2', 'Then one morning he stopped fighting the silence.', 'stopped fighting the silence'),
        s('F3', 'The quiet started teaching him who he really was.', 'who he really was'),
        s('B1', 'The quiet started teaching him who he really was.', 'who he really was'),
        s('B2', 'Then one morning he stopped fighting the silence.', 'one morning'),
        s('B3', 'Tom was sure he had nothing left to give.', 'nothing left'),
    ];
    const c = checkSlides({ slides }, { frameIds, brollIds, spoken, host: true });
    assert.ok(c.ok);
    if (!c.ok) return;
    assert.equal(c.slides.filter(x => x.picture.startsWith('F')).length, HOST_FRAMES_MAX);
    assert.deepEqual(c.dropped, [`Slide 3: more than ${HOST_FRAMES_MAX} frames of a host`]);
    assert.match(carouselPrompt({ title: 'T', speaker: 'Tom', spoken, frames: 6, broll: 3, host: true }), /at most 2 frames/);
    assert.doesNotMatch(carouselPrompt({ title: 'T', speaker: 'Jo', spoken, frames: 6, broll: 0, host: false }), /at most/);
});

test('the system prompt carries the rules and the limited words', () => {
    assert.match(carouselSystem(), /4 to 8 slides/);
    assert.match(carouselSystem(), /unalive/);
});

function img(over: Partial<BrollImage>): BrollImage {
    return { index: 0, idea: 'x', startMs: 0, durationSeconds: 5, prompt: 'p', model: 'm', quality: 'q', size: 's', path: 'p.png', usd: 0, createdAt: null, ...over };
}

test('nearestBroll: stills nearest the moment, never footage; credits', () => {
    const images = [img({ index: 0, path: 'a', startMs: 0 }), img({ index: 1, path: 'b', startMs: 100_000 }),
        img({ index: 2, path: 'c', startMs: 90_000, kind: 'video' }), img({ index: 3, path: 'd', startMs: 80_000, source: 'pixabay', credit: { name: 'Lee', url: null } })];
    assert.deepEqual(nearestBroll(images, 95_000, 2).map(i => i.path), ['b', 'd']);
    assert.deepEqual(nearestBroll(images, null, 3).map(i => i.path), ['a', 'b', 'd']);
    assert.equal(brollCredit(images[3]), 'Background photo by Lee on Pixabay.');
    assert.equal(brollCredit(images[0]), 'Background image created with AI.');
});

const ASSETS = { logoUrl: 'L', outfitUrl: 'O', outfitBlackUrl: 'OB', cinzelUrl: 'C' };

test('slides: the logo, the gold phrase, the count, the speaker on the first only; the end slide', () => {
    const first = storySlideHtml({ pictureUrl: 'P', line: 'It <was> all love', gold: 'all love', index: 1, total: 5, speaker: 'Jo Ann' }, ASSETS);
    assert.match(first, /<img class="logo" src="L"/);
    assert.match(first, /<span class="gold">all love<\/span>/);
    assert.match(first, /It &lt;was&gt; /);
    assert.match(first, /1 \/ 5/);
    assert.match(first, /Jo Ann/);
    assert.match(first, /Swipe/);
    const third = storySlideHtml({ pictureUrl: null, line: 'x y z a b', gold: 'a b', index: 3, total: 5, speaker: 'Jo Ann' }, ASSETS);
    assert.doesNotMatch(third, /class="who"/);
    assert.match(third, /class="plain"/);
    const end = endSlideHtml({ speaker: 'Jo Ann', show: 'Soul Wisdom Collective', index: 5 }, ASSETS);
    assert.match(end, /Hear the whole conversation with <span class="gold">Jo Ann<\/span>/);
    assert.match(end, /soulwisdomcollective\.com/);
    assert.match(end, /5 \/ 5/);
    assert.ok(lineSize(30) > lineSize(90));
});

test('carouselCaptions and the YouTube post text: credit, link, picture credits once', () => {
    const episode = { url: 'https://soulwisdomcollective.com/videos', linkText: 'Full episodes' };
    const c = carouselCaptions({ title: 'Coming home', speaker: 'Jo Ann H', show: 'Soul Wisdom Collective', episode, shortId: 's1', hashtags: ['nde'],
        pictureCredits: ['Background image created with AI.', 'Background image created with AI.'] });
    assert.equal(c.instagramCaption, 'Coming home\n\nA moment with Jo Ann H, on Soul Wisdom Collective. Swipe through, then hear the whole conversation.\n\n'
        + 'Full episodes: https://soulwisdomcollective.com/videos?utm_source=instagram&utm_medium=carousel&utm_campaign=s1\n\nBackground image created with AI.\n\n#nde #soulwisdom');
    assert.match(c.facebookCaption, /utm_source=facebook&utm_medium=carousel/);
    assert.equal(youtubePostText({ title: 'Coming home', speaker: 'Jo Ann H', show: 'Soul Wisdom Collective', episode }),
        'Coming home\n\n— Jo Ann H, on Soul Wisdom Collective\n\nFull episodes: https://soulwisdomcollective.com/videos');
});

test('carousels are planned with each Short, one a day at 7 pm ET', () => {
    assert.deepEqual(PLANNED_KINDS, ['reel', 'carousel', 'image']);
    const at = feedPostAt('carousel', { lastTaken: null, reelAt: Date.parse('2026-11-24T17:00:00Z'), now: Date.parse('2026-11-24T12:00:00Z') });
    assert.equal(new Date(at).toISOString(), '2026-11-25T00:00:00.000Z');
    assert.deepEqual(carouselFrameTimes(0, 130_000, 12).slice(0, 2), [10_000, 20_000]);
});
