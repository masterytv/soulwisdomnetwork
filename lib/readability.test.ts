import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastOn, DEFAULT_READABILITY, parseReadability, stepText } from './readability';

test('nothing stored, or something broken, gives the default', () => {
    assert.deepEqual(parseReadability(null), DEFAULT_READABILITY);
    assert.deepEqual(parseReadability('not json'), DEFAULT_READABILITY);
    assert.deepEqual(parseReadability('null'), DEFAULT_READABILITY);
    assert.deepEqual(parseReadability('{"highContrast":"yes","text":"huge"}'), DEFAULT_READABILITY);
});

test('a stored choice is read back', () => {
    assert.deepEqual(parseReadability('{"highContrast":true,"text":"larger"}'), { highContrast: true, text: 'larger' });
    assert.deepEqual(parseReadability('{"highContrast":false}'), { highContrast: false, text: 'normal' });
});

test('high contrast follows the computer until the person chooses', () => {
    assert.equal(contrastOn({ highContrast: null, text: 'normal' }, true), true);
    assert.equal(contrastOn({ highContrast: null, text: 'normal' }, false), false);
    assert.equal(contrastOn({ highContrast: false, text: 'normal' }, true), false);
    assert.equal(contrastOn({ highContrast: true, text: 'normal' }, false), true);
});

test('text size steps stay within normal and larger', () => {
    assert.equal(stepText('normal', 1), 'large');
    assert.equal(stepText('large', 1), 'larger');
    assert.equal(stepText('larger', 1), 'larger');
    assert.equal(stepText('normal', -1), 'normal');
    assert.equal(stepText('larger', -1), 'large');
});
