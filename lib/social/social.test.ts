// Social publishing (docs/specs/026-social-publishing.md): the times, which Shorts qualify, YouTube's word on a Short,
// the captions and the Upload-Post forms.
// Run: npx tsx --test lib/social/social.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    actionsFor, autopostOn, canEdit, easternDay, easternToUtc, facebookMediaType, feedPostAt, feedSlot, nextDay, postId,
    reelPostAt, scheduleFor, socialStart, statusFromResults, tooLate, whyNot, youtubeVerdict,
} from './plan';
import { creditLine, fit, hashtags, INSTAGRAM_CAPTION_MAX, reelCaptions, tagged } from './captions';
import { missingSettings, parseResults, patchBody, photoForm, reason, reelForm } from './uploadPost';
import { findLimitedWords, scrubDescription } from './limitedWords';
import { renderInputs, DEFAULT_ASPECT } from '../shorts';
import type { ShortItem } from '../../types/episode';

const H = 3_600_000;

test('easternToUtc: 7 pm ET is 00:00 UTC in winter and 23:00 UTC in summer', () => {
    assert.equal(new Date(easternToUtc('2026-11-24', '19:00')).toISOString(), '2026-11-25T00:00:00.000Z');
    assert.equal(new Date(easternToUtc('2026-07-01', '19:00')).toISOString(), '2026-07-01T23:00:00.000Z');
    // Either side of the November change (1 Nov 2026).
    assert.equal(new Date(easternToUtc('2026-10-31', '19:00')).toISOString(), '2026-10-31T23:00:00.000Z');
    assert.equal(new Date(easternToUtc('2026-11-01', '19:00')).toISOString(), '2026-11-02T00:00:00.000Z');
});

test('easternDay and nextDay', () => {
    assert.equal(easternDay(Date.parse('2026-11-25T03:00:00Z')), '2026-11-24');
    assert.equal(nextDay('2026-11-30'), '2026-12-01');
    assert.equal(nextDay('2026-12-31'), '2027-01-01');
});

test('reelPostAt: 3 hours after YouTube publishes', () => {
    const publish = Date.parse('2026-11-24T14:00:00Z');
    assert.equal(reelPostAt(publish), publish + 3 * H);
});

test('feedSlot: carousels at 7 pm ET, image posts at 7:30', () => {
    assert.equal(new Date(feedSlot('carousel', '2026-11-24')).toISOString(), '2026-11-25T00:00:00.000Z');
    assert.equal(new Date(feedSlot('image', '2026-11-24')).toISOString(), '2026-11-25T00:30:00.000Z');
});

test('feedPostAt: one a day per kind, after the last taken, never before the Reel or now', () => {
    const now = Date.parse('2026-11-24T12:00:00Z');                 // 7 am ET
    const reelAt = Date.parse('2026-11-24T17:00:00Z');              // noon ET
    // Nothing taken: today at 7 pm ET.
    assert.equal(new Date(feedPostAt('carousel', { lastTaken: null, reelAt, now })).toISOString(), '2026-11-25T00:00:00.000Z');
    // The kind took today: tomorrow.
    assert.equal(new Date(feedPostAt('carousel', { lastTaken: feedSlot('carousel', '2026-11-24'), reelAt, now })).toISOString(), '2026-11-26T00:00:00.000Z');
    // Taken days ahead: the day after that.
    assert.equal(new Date(feedPostAt('image', { lastTaken: feedSlot('image', '2026-12-03'), reelAt, now })).toISOString(), '2026-12-05T00:30:00.000Z');
    // A Reel at 9 pm ET: its feed posts wait for the next day.
    const lateReel = Date.parse('2026-11-25T02:00:00Z');
    assert.equal(new Date(feedPostAt('carousel', { lastTaken: null, reelAt: lateReel, now })).toISOString(), '2026-11-26T00:00:00.000Z');
    // Planned at 8 pm ET: today's 7 pm has gone.
    const evening = Date.parse('2026-11-25T01:00:00Z');
    assert.equal(new Date(feedPostAt('image', { lastTaken: null, reelAt, now: evening })).toISOString(), '2026-11-26T00:30:00.000Z');
});

test('scheduleFor and tooLate', () => {
    const now = 1_000_000_000;
    assert.equal(scheduleFor(now + 10 * 60_000, now), now + 10 * 60_000);
    assert.equal(scheduleFor(now + 60_000, now), null);
    assert.equal(tooLate(now - 5 * H, now), false);
    assert.equal(tooLate(now - 7 * H, now), true);
});

test('settings: autopost and the start', () => {
    assert.equal(autopostOn(undefined), true);
    assert.equal(autopostOn('off'), false);
    assert.equal(autopostOn(' No '), false);
    assert.equal(autopostOn('on'), true);
    assert.equal(socialStart('2026-12-01T00:00:00Z'), Date.parse('2026-12-01T00:00:00Z'));
    assert.equal(socialStart('nonsense'), Date.parse('2026-11-24T05:00:00Z'));
    assert.equal(postId('ep1', 's1', 'reel'), 'ep1_s1_reel');
});

function short(over: Partial<ShortItem> = {}): ShortItem {
    const base = {
        id: 's1', quoteIndex: 0, speaker: 'Jo Ann', startMs: 1000, endMs: 40_000, headline: 'Home', title: 'Coming home',
        synthetic: false,
    };
    const finalAt = 500;
    return {
        ...base,
        render: { ...renderInputs(base, DEFAULT_ASPECT, finalAt), path: 'r.mp4', renderedAt: 10, durationMs: 39_000 },
        approved: { by: { uid: 'u', name: 'Tom' }, at: 11, renderedAt: 10 },
        youtube: { videoId: 'v1', url: 'https://youtube.com/shorts/v1', publishAt: Date.parse('2026-12-01T14:00:00Z'), uploadedAt: 12 },
        ...over,
    };
}

test('whyNot: every Short approved at Checkpoint E and scheduled on YouTube, after the start', () => {
    const o = { finalAt: 500, start: Date.parse('2026-11-24T05:00:00Z') };
    assert.equal(whyNot(short(), o), null);
    assert.equal(whyNot(short({ approved: null }), o), 'Not approved at Checkpoint E');
    assert.equal(whyNot(short({ approved: { by: { uid: 'u', name: 'Tom' }, at: 11, renderedAt: 9 } }), o), 'Changed since it was approved');
    assert.equal(whyNot(short({ headline: 'Changed' }), o), 'Changed since it was approved');
    assert.equal(whyNot(short({ youtube: null }), o), 'Not on YouTube yet');
    assert.equal(whyNot(short({ youtube: { videoId: 'v', url: 'u', publishAt: Date.parse('2026-11-20T14:00:00Z'), uploadedAt: 1 } }), o),
        'Released on YouTube before social posting began');
});

test('youtubeVerdict: keep public and scheduled, move a moved one, cancel the rest', () => {
    const at = Date.parse('2026-12-01T14:00:00Z');
    assert.deepEqual(youtubeVerdict({ privacyStatus: 'public', publishAt: null }, at), { verdict: 'keep' });
    assert.deepEqual(youtubeVerdict({ privacyStatus: 'private', publishAt: at }, at), { verdict: 'keep' });
    assert.deepEqual(youtubeVerdict({ privacyStatus: 'private', publishAt: at + 86_400_000 }, at), { verdict: 'move', publishAt: at + 86_400_000 });
    assert.deepEqual(youtubeVerdict({ privacyStatus: 'private', publishAt: null }, at), { verdict: 'cancel', reason: 'Unscheduled on YouTube' });
    assert.deepEqual(youtubeVerdict({ privacyStatus: 'unlisted', publishAt: null }, at), { verdict: 'cancel', reason: 'Set to unlisted on YouTube' });
    assert.deepEqual(youtubeVerdict(undefined, at), { verdict: 'cancel', reason: 'Deleted from YouTube' });
});

test('statusFromResults and facebookMediaType', () => {
    const ok = { ok: true, url: 'u', postId: 'p', error: null }, bad = { ok: false, url: null, postId: null, error: 'x' };
    assert.equal(statusFromResults(['instagram', 'facebook'], { instagram: ok, facebook: ok }), 'posted');
    assert.equal(statusFromResults(['instagram', 'facebook'], { instagram: ok, facebook: bad }), 'partial');
    assert.equal(statusFromResults(['instagram', 'facebook'], {}), 'failed');
    assert.equal(facebookMediaType(60), 'REELS');
    assert.equal(facebookMediaType(120), 'VIDEO');
});

test('actionsFor and canEdit', () => {
    const now = 1_000_000_000;
    const ahead = { postAt: now + H, uploadPost: { jobId: 'j', requestId: 'r', scheduled: true, sentAt: now, sends: 1 } };
    assert.deepEqual(actionsFor({ ...ahead, status: 'sent' }, now), ['hold', 'cancel']);
    assert.deepEqual(actionsFor({ ...ahead, status: 'sent', postAt: now + 30_000 }, now), []);
    assert.deepEqual(actionsFor({ ...ahead, status: 'waiting', uploadPost: null }, now), ['post', 'hold', 'cancel']);
    assert.deepEqual(actionsFor({ ...ahead, status: 'held' }, now), ['post', 'cancel']);
    assert.deepEqual(actionsFor({ ...ahead, status: 'failed', postAt: now - 7 * H }, now), ['cancel']);
    assert.deepEqual(actionsFor({ ...ahead, status: 'posted' }, now), []);
    assert.equal(canEdit({ ...ahead, status: 'sent' }, now), true);
    assert.equal(canEdit({ ...ahead, status: 'posted' }, now), false);
});

test('captions: the title, the speaker credited, the episode linked and tagged, hashtags kept, limited words dropped', () => {
    const c = reelCaptions({
        title: 'Heaven felt like home', speaker: 'Jo Ann H', show: 'Soul Wisdom Collective',
        spoken: 'I was standing in a light. He had an overdose that night. It felt like home.',
        episode: { url: 'https://soulwisdomcollective.com/videos', linkText: 'Full episodes' }, shortId: 's1',
        hashtags: ['nde', '#afterlife', 'light', 'extra'], credits: ['Music: "Calm" by A (CC BY)'],
    });
    assert.ok(c.instagramCaption.startsWith('Heaven felt like home\n\n— Jo Ann H, on Soul Wisdom Collective'));
    assert.match(c.instagramCaption, /Full episodes: https:\/\/soulwisdomcollective\.com\/videos\?utm_source=instagram&utm_medium=reels&utm_campaign=s1/);
    assert.match(c.facebookDescription, /utm_source=facebook/);
    assert.ok(c.instagramCaption.endsWith('#nde #afterlife #light #soulwisdom'));
    assert.equal(findLimitedWords(c.instagramCaption).length, 0);
    assert.equal(findLimitedWords(c.facebookDescription).length, 0);
    assert.match(c.instagramCaption, /Music and sound/);
    assert.equal(c.facebookTitle, 'Heaven felt like home');

    const long = reelCaptions({
        title: 'T', speaker: 'S', show: 'Show', spoken: 'word '.repeat(2000), episode: { url: 'https://youtu.be/x', linkText: 'Watch the full conversation' },
        shortId: 's', hashtags: [], credits: [],
    });
    assert.ok(long.instagramCaption.length <= INSTAGRAM_CAPTION_MAX);
    assert.ok(long.instagramCaption.endsWith('#soulwisdom'));
    assert.match(long.instagramCaption, /Watch the full conversation: https:\/\/youtu\.be\/x\n/);
});

test('captions helpers', () => {
    assert.equal(tagged('https://youtube.com/watch?v=1', 'instagram', 'reels', 's'), 'https://youtube.com/watch?v=1');
    assert.equal(tagged('not a url', 'instagram', 'reels', 's'), 'not a url');
    assert.equal(hashtags([]), '#soulwisdom');
    assert.equal(creditLine('  ', 'Soul Wisdom'), 'Our guest, on Soul Wisdom');
    assert.equal(fit('one two three', 8), 'one two');
    assert.equal(scrubDescription('Fine line. He was abused. Next.'), 'Fine line. Next.');
});

const cfg = { profile: 'soul_wisdom_collective', facebookPageId: '123' };

test('reelForm: profile, platforms, captions, cover, AI labels, the time in UTC', () => {
    const at = Date.parse('2026-12-01T17:00:00Z');
    const f = reelForm({
        ...cfg, requestId: 'ep_s_reel', platforms: ['instagram', 'facebook'], videoUrl: 'https://v', coverUrl: 'https://c', seconds: 45,
        synthetic: true, title: 'T', instagramCaption: 'IG', facebookTitle: 'FT', facebookDescription: 'FD', at, facebookCover: new Blob(['x']),
    });
    assert.equal(f.get('user'), 'soul_wisdom_collective');
    assert.deepEqual(f.getAll('platform[]'), ['instagram', 'facebook']);
    assert.equal(f.get('media_type'), 'REELS');
    assert.equal(f.get('facebook_media_type'), 'REELS');
    assert.equal(f.get('cover_url'), 'https://c');
    assert.ok(f.get('facebook_thumbnail'));
    assert.equal(f.get('is_ai_generated'), 'true');
    assert.equal(f.get('scheduled_date'), '2026-12-01T17:00:00.000Z');
    assert.equal(f.get('timezone'), 'UTC');
    assert.equal(f.get('request_id'), 'ep_s_reel');
    assert.equal(f.get('async_upload'), null);

    const now = reelForm({ ...cfg, requestId: 'r', platforms: ['instagram'], videoUrl: 'v', coverUrl: 'https://c', seconds: 120, synthetic: false,
        title: 'T', instagramCaption: 'I', facebookTitle: 'F', facebookDescription: 'D', at: null });
    assert.equal(now.get('async_upload'), 'true');
    assert.equal(now.get('scheduled_date'), null);
    assert.equal(now.get('facebook_media_type'), 'VIDEO');
    assert.equal(now.get('thumbnail_url'), 'https://c');
    assert.equal(now.get('is_ai_generated'), null);
});

test('photoForm: several photos make a carousel', () => {
    const f = photoForm({ ...cfg, requestId: 'r', platforms: ['instagram', 'facebook'], imageUrls: ['a', 'b'], title: 'T', instagramCaption: 'I', facebookCaption: 'F', at: null });
    assert.deepEqual(f.getAll('photos[]'), ['a', 'b']);
    assert.equal(f.get('facebook_title'), 'F');
});

test('patchBody, parseResults, settings, refusals', () => {
    assert.deepEqual(patchBody({ at: Date.parse('2026-12-01T17:00:00Z') }), { scheduled_date: '2026-12-01T17:00:00', timezone: 'UTC' });
    assert.deepEqual(patchBody({ fields: { instagram_title: 'x' } }), { fields: { instagram_title: 'x' } });
    assert.deepEqual(patchBody({ fields: {} }), {});
    assert.deepEqual(parseResults({ instagram: { success: true, url: 'https://ig/p' }, facebook: { success: false, error: 'nope' } }), {
        instagram: { ok: true, url: 'https://ig/p', postId: null, error: null },
        facebook: { ok: false, url: null, postId: null, error: 'nope' },
    });
    assert.deepEqual(Object.keys(parseResults([{ platform: 'instagram', success: true, post_id: '9' }])), ['instagram']);
    assert.deepEqual(missingSettings({ UPLOAD_POST_API_KEY: 'k', UPLOAD_POST_PROFILE: ' ' }), ['UPLOAD_POST_PROFILE', 'FACEBOOK_PAGE_ID']);
    assert.match(reason(401, {}), /UPLOAD_POST_API_KEY/);
    assert.equal(reason(400, { message: 'bad caption' }), 'Upload-Post refused it (400): bad caption');
});
