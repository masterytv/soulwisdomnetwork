// The quote card's picture (docs/specs/026-social-publishing.md; Tom, 2026-11-23): a guest's own frame; a host's own
// frame one image post in five, else the episode's b-roll.
// Run: npx tsx --test lib/social/picture.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseCardPicture, hostFrameAllowed, isHost, originalMsOf, pictureCredit } from './picture';
import { imageCaptions } from './captions';
import { photoForm } from './uploadPost';
import type { BrollImage } from '../../types/episode';

const hosts = ['Daniel Endy', 'Tom Wood'];

function img(over: Partial<BrollImage>): BrollImage {
    return { index: 0, idea: 'x', startMs: 0, durationSeconds: 5, prompt: 'p', model: 'm', quality: 'q', size: 's', path: 'p.png', usd: 0, createdAt: null, ...over };
}

test('isHost: full names, or a first name alone; guests are not hosts', () => {
    assert.equal(isHost('Tom Wood', hosts), true);
    assert.equal(isHost('tom', hosts), true);
    assert.equal(isHost('Daniel Endy ', hosts), true);
    assert.equal(isHost('Jo Ann H', hosts), false);
    assert.equal(isHost('Tom Smith', hosts), false);
    assert.equal(isHost('', hosts), false);
});

test('hostFrameAllowed: one image post in five may show a host', () => {
    assert.equal(hostFrameAllowed([]), true);
    assert.equal(hostFrameAllowed(['speaker', 'broll', 'broll', 'none']), true);
    assert.equal(hostFrameAllowed(['broll', 'broll', 'host', 'broll']), false);
    assert.equal(hostFrameAllowed(['broll', 'broll', 'broll', 'broll', 'host']), true);   // the fifth back no longer counts
});

test('chooseCardPicture: a guest always gets their own frame', () => {
    assert.deepEqual(chooseCardPicture({ speaker: 'Jo Ann H', hosts, images: [img({})], at: null, used: [], hostFrameAllowed: false }), { kind: 'speaker' });
});

test('chooseCardPicture: a host gets their frame when allowed, else the nearest unused AI b-roll, then stock photos', () => {
    const images = [
        img({ index: 0, path: 'a.png', startMs: 10_000 }),
        img({ index: 1, path: 'b.png', startMs: 50_000 }),
        img({ index: 2, path: 'c.jpg', startMs: 49_000, source: 'pexels', credit: { name: 'Ann', url: null } }),
        img({ index: 3, path: 'd.mp4', startMs: 50_000, source: 'pexels', kind: 'video' }),
    ];
    const base = { speaker: 'Tom', hosts, images, at: 48_000, used: [] as string[] };
    assert.deepEqual(chooseCardPicture({ ...base, hostFrameAllowed: true }), { kind: 'host' });
    assert.deepEqual(chooseCardPicture({ ...base, hostFrameAllowed: false }), { kind: 'broll', path: 'b.png', source: 'ai', credit: null });
    assert.deepEqual(chooseCardPicture({ ...base, used: ['b.png'], hostFrameAllowed: false }), { kind: 'broll', path: 'a.png', source: 'ai', credit: null });
    assert.deepEqual(chooseCardPicture({ ...base, used: ['a.png', 'b.png'], hostFrameAllowed: false }),
        { kind: 'broll', path: 'c.jpg', source: 'pexels', credit: { name: 'Ann', url: null } });
    // Footage is never a card's picture; nothing left: the plain brand background.
    assert.deepEqual(chooseCardPicture({ ...base, used: ['a.png', 'b.png', 'c.jpg'], hostFrameAllowed: false }), { kind: 'none' });
    // With no place known, the b-roll in its own order.
    assert.equal((chooseCardPicture({ ...base, at: null, hostFrameAllowed: false }) as { path: string }).path, 'a.png');
});

test('originalMsOf: the Short\'s place in the original recording, by its key quote', () => {
    assert.equal(originalMsOf({ startMs: 105_000, quoteIndex: 1 }, [{ originalMs: 0, startMs: 0 }, { originalMs: 200_000, startMs: 100_000 }]), 205_000);
    assert.equal(originalMsOf({ startMs: 105_000, quoteIndex: null }, []), null);
    assert.equal(originalMsOf({ startMs: 105_000, quoteIndex: 4 }, undefined), null);
});

test('pictureCredit and the captions: AI pictures said, stock credited; the AI label on the post', () => {
    const ai = { kind: 'broll' as const, path: 'a.png', source: 'ai' as const, credit: null };
    assert.equal(pictureCredit(ai), 'Background image created with AI.');
    assert.equal(pictureCredit({ kind: 'broll', path: 'c', source: 'pexels', credit: { name: 'Ann', url: null } }), 'Background photo by Ann on Pexels.');
    assert.equal(pictureCredit({ kind: 'host' }), null);
    const c = imageCaptions({ quote: 'It was all love.', speaker: 'Tom Wood', show: 'Soul Wisdom Collective', episode: { url: '', linkText: '' }, shortId: 's', hashtags: [], pictureCredit: pictureCredit(ai) });
    assert.match(c.instagramCaption, /— Tom Wood, on Soul Wisdom Collective\n\nBackground image created with AI\./);
    const f = photoForm({ profile: 'p', facebookPageId: '1', requestId: 'r', platforms: ['instagram'], imageUrls: ['u'], title: 'T', instagramCaption: 'I', facebookCaption: 'F', aiPicture: true, at: null });
    assert.equal(f.get('is_ai_generated'), 'true');
});
