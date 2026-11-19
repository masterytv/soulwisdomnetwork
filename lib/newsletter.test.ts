// The weekly email sign-up's request and messages (lib/newsletter.ts).
// Run: npx tsx --test lib/newsletter.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signupBody, signupEmail, signupMessage } from './newsletter';

test('signupBody: the address and the hidden field, for a real-looking address only', () => {
    assert.deepEqual(signupBody(' ann@example.com '), { email: 'ann@example.com', website: '' });
    assert.deepEqual(signupBody('ann@example.com', 'spam.biz'), { email: 'ann@example.com', website: 'spam.biz' });
    assert.equal(signupBody('ann@'), null);
    assert.equal(signupEmail(''), null);
    assert.equal(signupEmail(`${'a'.repeat(320)}@x.co`), null);
});

test('signupMessage: thanks, too many tries, a bad address, anything else', () => {
    assert.equal(signupMessage(200).ok, true);
    assert.match(signupMessage(429).text, /wait/);
    assert.match(signupMessage(400).text, /doesn’t look right/);
    assert.equal(signupMessage(500).ok, false);
});
