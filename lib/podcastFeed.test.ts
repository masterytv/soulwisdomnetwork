// Spec 019 item 5.1: the audio podcast feed and the MP3's chapters.
// Run: npx tsx --test lib/podcastFeed.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterMetadata, feedShow, feedXml, podcastText } from './podcastFeed';
import { DEFAULT_SETTINGS } from './studioSettings';
import type { Episode } from '../types/episode';

test('chapters for the MP3: each ends where the next starts, the last at the end; names kept safe', () => {
    const meta = chapterMetadata('Ep 4', [{ title: 'Later; part = two', startMs: 60_000 }, { title: 'Welcome', startMs: 0 }, { title: 'Past the end', startMs: 999_000 }], 120_000);
    assert.equal(meta, [
        ';FFMETADATA1', 'title=Ep 4', '',
        '[CHAPTER]', 'TIMEBASE=1/1000', 'START=0', 'END=60000', 'title=Welcome', '',
        '[CHAPTER]', 'TIMEBASE=1/1000', 'START=60000', 'END=120000', String.raw`title=Later\; part \= two`, '',
    ].join('\n'));
});

test('the feed: the show from the settings, newest first, everything escaped', () => {
    const show = feedShow({ ...DEFAULT_SETTINGS, podcastEmail: 'tom@example.com' }, 'https://staging.example.com');
    assert.equal(show.feedUrl, 'https://staging.example.com/podcast/feed.xml');
    assert.equal(show.author, 'Daniel Endy and Tom Wood');
    const xml = feedXml(show, [
        { id: 'old1234567', title: 'First & "best"', description: 'Notes ]]> here', audioUrl: 'https://s/podcast/audio/old1234567.mp3', bytes: 1000, durationSeconds: 61.4, publishedAt: Date.UTC(2026, 0, 1) },
        { id: 'new1234567', title: 'Second', description: 'More', audioUrl: 'https://s/podcast/audio/new1234567.mp3', bytes: 2000, durationSeconds: 3600, publishedAt: Date.UTC(2026, 1, 1) },
    ]);
    assert.ok(xml.indexOf('<title>Second</title>') < xml.indexOf('<title>First &amp; &quot;best&quot;</title>'));
    assert.match(xml, /<enclosure url="https:\/\/s\/podcast\/audio\/old1234567\.mp3" length="1000" type="audio\/mpeg"\/>/);
    assert.match(xml, /<description><!\[CDATA\[Notes ]]]]><!\[CDATA\[> here]]><\/description>/);
    assert.match(xml, /<itunes:duration>61<\/itunes:duration>/);
    assert.match(xml, /<pubDate>Thu, 01 Jan 2026 00:00:00 GMT<\/pubDate>/);
    assert.match(xml, /<itunes:category text="Religion &amp; Spirituality"\/>/);
    assert.match(xml, /<itunes:owner><itunes:name>Daniel Endy and Tom Wood<\/itunes:name><itunes:email>tom@example.com<\/itunes:email><\/itunes:owner>/);
    assert.match(xml, /<atom:link href="https:\/\/staging\.example\.com\/podcast\/feed\.xml" rel="self"/);
    // No owner email: no owner.
    assert.ok(!feedXml(feedShow(DEFAULT_SETTINGS, 'https://x'), []).includes('itunes:owner'));
});

test('an episode without approved notes still has its title', () => {
    assert.deepEqual(podcastText({ title: 'Raw title' } as Episode, DEFAULT_SETTINGS), { title: 'Raw title', description: '' });
});
