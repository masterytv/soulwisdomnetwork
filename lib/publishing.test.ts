// What Shorts and clips share on YouTube (docs/specs/025-clips.md, stage 4): the link to the full conversation, the
// slots of a batch, and the first slot the page suggests.
// Run: npx tsx --test lib/publishing.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, episodeLink, slotAt, suggestedFirstSlot, withUtm } from './publishing';

test('episodeLink: the episode, else the podcast playlist, else the site', () => {
    assert.deepEqual(episodeLink({ episodeUrl: 'https://youtu.be/x', playlistId: 'PL1', siteUrl: 'https://s' }), { url: 'https://youtu.be/x', linkText: 'Watch the full conversation' });
    assert.deepEqual(episodeLink({ playlistId: ' PL1 ', siteUrl: 'https://s' }), { url: 'https://www.youtube.com/playlist?list=PL1', linkText: 'Full episodes' });
    assert.deepEqual(episodeLink({ siteUrl: 'https://s' }), { url: 'https://s', linkText: 'Full episodes' });
    assert.equal(episodeLink({}).url, '');
});

test('slotAt: every so many days', () => {
    assert.equal(slotAt(1000, 0), 1000);
    assert.equal(slotAt(1000, 3), 1000 + 3 * DAY_MS);
    assert.equal(slotAt(1000, 2, 2), 1000 + 4 * DAY_MS);
});

test('suggestedFirstSlot: after the last one taken, else tomorrow at its time of day or the default hour', () => {
    const now = new Date(2026, 10, 18, 9, 30).getTime();
    const last = new Date(2026, 10, 25, 11, 0).getTime();
    assert.equal(suggestedFirstSlot(last, 2, 11, now), last + 2 * DAY_MS);
    const old = new Date(2026, 10, 1, 17, 15).getTime();
    assert.equal(suggestedFirstSlot(old, 2, 11, now), new Date(2026, 10, 19, 17, 15).getTime());
    assert.equal(suggestedFirstSlot(null, 2, 11, now), new Date(2026, 10, 19, 11, 0).getTime());
});

test('withUtm: tags links to the website with the short or clip, never YouTube links', () => {
    assert.equal(withUtm('https://soulwisdomcollective.com', 'shorts', 's1'),
        'https://soulwisdomcollective.com/?utm_source=youtube&utm_medium=shorts&utm_campaign=s1');
    assert.equal(withUtm('https://soulwisdomcollective.com/videos?x=1', 'clips', 'c1'),
        'https://soulwisdomcollective.com/videos?x=1&utm_source=youtube&utm_medium=clips&utm_campaign=c1');
    assert.equal(withUtm('https://youtu.be/x', 'shorts', 's1'), 'https://youtu.be/x');
    assert.equal(withUtm('https://www.youtube.com/playlist?list=PL1', 'clips', 'c1'), 'https://www.youtube.com/playlist?list=PL1');
    assert.equal(withUtm('', 'shorts', 's1'), '');
});
