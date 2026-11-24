// "Soul Wisdom Video of the Week" (lib/newsletterEmail.ts): the feeds, the pick, the subject, the send time, the HTML.
// Run: npx tsx --test lib/newsletterEmail.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    firstParagraph, newestEpisode, nextSend, parseChannelFeed, sendTime, tagged, videoOfWeek, weeklyEmail, weeklyHtml, weekName, welcomeHtml,
} from './newsletterEmail';

const entry = (id: string, title: string, published: string, views: number, kind = 'shorts') => `
 <entry>
  <yt:videoId>${id}</yt:videoId>
  <title>${title}</title>
  <link rel="alternate" href="https://www.youtube.com/${kind}/${id}"/>
  <published>${published}</published>
  <media:group>
   <media:description>What she saw &amp; why.

#nde</media:description>
   <media:community><media:statistics views="${views}"/></media:community>
  </media:group>
 </entry>`;
const channel = `<feed>${entry('a1', 'Old one', '2026-11-01T17:00:00+00:00', 9000)}${entry('b2', 'Earth as a &quot;Scary Movie&quot;', '2026-11-18T21:00:00+00:00', 81)}${entry('c3', 'The Full Episode', '2026-11-16T14:00:00+00:00', 152, 'watch?v=')}</feed>`;

test('the week\'s most-watched video, a Short or a full episode', () => {
    const videos = parseChannelFeed(channel);
    assert.equal(videos.length, 3);
    assert.equal(videos[1].title, 'Earth as a "Scary Movie"');
    assert.equal(videos[1].views, 81);
    assert.equal(videoOfWeek(videos, new Date('2026-11-22T10:41:00Z'))?.videoId, 'c3');
    assert.equal(videoOfWeek(videos, new Date('2026-11-24T10:41:00Z'))?.videoId, 'b2');   // c3 is now over 7 days old
    assert.equal(videoOfWeek(videos, new Date('2027-01-01T00:00:00Z')), null);
    assert.equal(firstParagraph(videos[0].description), 'What she saw & why.');
});

test('the newest podcast episode, and no episode shown twice', () => {
    const feed = `<rss><channel><item><title>Older</title><description><![CDATA[Old.]]></description><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate></item>
      <item><title>The Full Episode</title><description><![CDATA[About it.\n\nMore.]]></description><pubDate>Wed, 18 Nov 2026 17:42:01 GMT</pubDate></item></channel></rss>`;
    const episode = newestEpisode(feed);
    assert.equal(episode?.title, 'The Full Episode');
    const videos = parseChannelFeed(channel);
    const e = weeklyEmail({ video: videos[2], episode });
    assert.equal(e?.subject, 'Soul Wisdom Video of the Week: The Full Episode');
    assert.equal(e?.episode, null);          // the video is the newest episode itself
    const e2 = weeklyEmail({ video: videos[1], episode });
    assert.equal(e2?.previewText, 'Plus our newest episode: The Full Episode');
    assert.equal(weeklyEmail({ video: null, episode: null }), null);
});

test('sends at 9:00 am Eastern on the Tuesday it runs, in winter and in summer', () => {
    assert.equal(sendTime(new Date('2026-11-24T10:41:00Z')).toISOString(), '2026-11-24T14:00:00.000Z');   // EST
    assert.equal(sendTime(new Date('2026-06-09T10:41:00Z')).toISOString(), '2026-06-09T13:00:00.000Z');   // EDT
    assert.equal(sendTime(new Date('2026-03-10T10:41:00Z')).toISOString(), '2026-03-10T13:00:00.000Z');   // after the change
    assert.equal(sendTime(new Date('2026-11-24T15:00:00Z')).toISOString(), '2026-11-24T15:10:00.000Z');   // late: 10 min on
    assert.equal(weekName(new Date('2026-11-24T10:41:00Z')), 'swc-video-of-the-week-2026-11-24');
});

test('the email: our links tagged, Resend\'s unsubscribe, nothing unescaped', () => {
    assert.equal(tagged('https://www.youtube.com/shorts/b2', 'c'), 'https://www.youtube.com/shorts/b2');
    assert.match(tagged('https://projectprofound.org', 'c'), /utm_source=newsletter&utm_medium=email&utm_campaign=c/);
    const videos = parseChannelFeed(channel);
    const email = weeklyEmail({ video: { ...videos[1], title: 'A <b>bold</b> title' }, episode: { title: 'Ep', description: 'About it.', published: null } })!;
    const html = weeklyHtml(email, 'swc-video-of-the-week-2026-11-24');
    assert.match(html, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/);
    assert.match(html, /https:\/\/www\.youtube\.com\/shorts\/b2/);
    assert.match(html, /projectprofound\.org\/\?utm_source=newsletter/);
    assert.ok(html.includes('A &lt;b&gt;bold&lt;/b&gt; title'));
    assert.ok(!html.includes('<b>bold</b>'));
    assert.match(welcomeHtml(), /Every Tuesday morning/);
});

test('makes Tuesday\'s email ahead, from Monday, scheduled for 9:00 am ET (Tom, 2026-11-24)', () => {
    // Monday 2026-11-30, 6:00 pm EST (Cloud Scheduler): Tuesday 9:00 am EST.
    assert.deepEqual(nextSend(new Date('2026-11-30T23:00:00Z')), { day: '2026-12-01', at: new Date('2026-12-01T14:00:00Z') });
    // GitHub's Monday run, even hours late, is within 36 hours.
    assert.equal(nextSend(new Date('2026-11-30T10:41:00Z'))?.day, '2026-12-01');
    // Earlier in the week: nothing yet.
    assert.equal(nextSend(new Date('2026-11-29T15:00:00Z')), null);
    assert.equal(nextSend(new Date('2026-11-25T15:00:00Z')), null);
    assert.equal(nextSend(new Date('2026-11-25T15:00:00Z'), undefined, undefined, Infinity)?.day, '2026-12-01');
    // On Tuesday: 9:00, or ten minutes after a late run.
    assert.equal(nextSend(new Date('2026-12-01T10:41:00Z'))?.at.toISOString(), '2026-12-01T14:00:00.000Z');
    assert.equal(nextSend(new Date('2026-12-01T16:00:00Z'))?.at.toISOString(), '2026-12-01T16:10:00.000Z');
    // Across the spring clock change: Tuesday 9:00 am EDT.
    assert.deepEqual(nextSend(new Date('2027-03-15T22:00:00Z')), { day: '2027-03-16', at: new Date('2027-03-16T13:00:00Z') });
});
