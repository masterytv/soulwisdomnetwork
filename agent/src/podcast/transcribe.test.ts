// What ingest sends AssemblyAI (spec 019 item 2.4: names and terms to spell right).
// Run: npx tsx --test agent/src/podcast/transcribe.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitTranscription, type createAssemblyAI } from './transcribe';

function fakeClient() {
    const sent: Record<string, unknown>[] = [];
    const client = {
        files: { upload: async () => 'https://upload/audio' },
        transcripts: { submit: async (params: Record<string, unknown>) => { sent.push(params); return { id: 't1' }; } },
    } as unknown as ReturnType<typeof createAssemblyAI>;
    return { client, sent };
}

test('the names and terms go as keyterms_prompt, beside the speakers and disfluencies', async () => {
    const { client, sent } = fakeClient();
    assert.equal(await submitTranscription(client, 'a.m4a', ['universal-3-5-pro', 'universal-2'], ['Tom Wood'], ['Soul Wisdom Collective', 'Tom Wood']), 't1');
    assert.deepEqual(sent[0].keyterms_prompt, ['Soul Wisdom Collective', 'Tom Wood']);
    assert.equal(sent[0].disfluencies, true);
    assert.equal(sent[0].speaker_labels, true);
    assert.deepEqual(sent[0].speech_models, ['universal-3-5-pro', 'universal-2']);
    assert.deepEqual((sent[0].speech_understanding as { request: { speaker_identification: unknown } }).request.speaker_identification,
        { speaker_type: 'name', known_values: ['Tom Wood'] });
});

test('with none, no keyterms_prompt is sent', async () => {
    const { client, sent } = fakeClient();
    await submitTranscription(client, 'a.m4a', ['universal-2'], []);
    assert.equal('keyterms_prompt' in sent[0], false);
});
