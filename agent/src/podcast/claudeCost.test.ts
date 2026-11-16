// Prompt caching's cost: cache writes and reads are priced apart from plain input.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cachedText, claudeUsd, priceOf } from './claudeCost';

const opus = priceOf('claude-opus-5-5');

test('claudeUsd: plain input and output, nothing cached', () => {
    assert.equal(claudeUsd({ input_tokens: 1_000_000, output_tokens: 100_000 }, opus), 4 + 2);
    assert.equal(claudeUsd({ input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null }, opus), 4);
});

test('claudeUsd: 5-minute writes at 1.25x, 1-hour writes at 2x, reads at the cache-read price', () => {
    const usd = claudeUsd({
        input_tokens: 0, output_tokens: 0,
        cache_creation_input_tokens: 3_000_000,
        cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 2_000_000 },
        cache_read_input_tokens: 1_000_000,
    }, opus);
    assert.equal(usd, 4 * 1.25 + 4 * 2 * 2 + 0.2);
});

test('claudeUsd: writes without the per-TTL breakdown are priced as 5-minute writes', () => {
    assert.equal(claudeUsd({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 }, opus), 5);
});

test('priceOf: the first model with a price', () => {
    assert.deepEqual(priceOf('claude-something-else', 'claude-opus-5-5'), opus);
    assert.deepEqual(priceOf(undefined, 'claude-opus-5', 'claude-opus-5-5'), { input: 5, output: 25, cacheRead: 0.5 });
    assert.throws(() => priceOf('claude-something-else'));
});

test('cachedText: 5-minute by default, 1-hour when asked', () => {
    assert.deepEqual(cachedText('x').cache_control, { type: 'ephemeral' });
    assert.deepEqual(cachedText('x', '1h').cache_control, { type: 'ephemeral', ttl: '1h' });
});
