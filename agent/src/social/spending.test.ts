// Social posts' share of the Studio's daily spending limit (docs/specs/026-social-publishing.md).
// Run: npx tsx --test agent/src/social/spending.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_LIMIT_USD, SOCIAL_DAILY_USD, socialDailyUsd } from './spending';

test('socialDailyUsd: the repo variable, else $5, never above the whole limit', () => {
    assert.equal(socialDailyUsd(undefined), SOCIAL_DAILY_USD);
    assert.equal(socialDailyUsd('5'), 5);
    assert.equal(socialDailyUsd('nonsense'), SOCIAL_DAILY_USD);
    assert.equal(socialDailyUsd('0'), SOCIAL_DAILY_USD);
    assert.equal(socialDailyUsd('500'), DAILY_LIMIT_USD);
});
