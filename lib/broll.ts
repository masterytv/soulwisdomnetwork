// B-roll stills (spec 005 step 7; docs/specs/008-broll-images.md): how an approved idea
// becomes an image prompt, and what an image costs. Shared by the job and the Studio.

export const BROLL_MODEL = 'gpt-image-2';
export const BROLL_SIZE = '1536x1024';     // 3:2, leaves room to pan and crop to 16:9
export const BROLL_QUALITY = 'high';
// OpenAI's published price for one 1536x1024 image at this quality; for the cost record.
export const BROLL_USD_PER_IMAGE = 0.165;

export function brollPrompt(idea: string) {
    return [
        'A still photograph used as b-roll in a documentary-style podcast about near-death experiences, ' +
        'consciousness and the meaning of life. It will be shown full screen with a slow pan and zoom.',
        '',
        `Subject: ${idea.trim()}`,
        '',
        'Style: natural, cinematic photograph; soft natural light; calm and contemplative; landscape ' +
        'composition with the subject away from the edges.',
        'Do not include any text, captions, logos or watermarks. No recognisable real people. Do not depict ' +
        'God, angels, heaven or the afterlife literally; suggest them with light, nature and everyday things instead.',
    ].join('\n');
}
