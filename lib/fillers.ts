// Hesitations such as "um", "uhh", "erm" and "mhm". AssemblyAI writes them out because the
// ingest job turns on `disfluencies`. The editor suggests cutting them. Quote matching and
// re-timing skip them, because Claude leaves them out of quotes and the final cut's transcript
// does not have them.
const FILLER = /^(u+m+|u+h+|u+h+m+|e+r+m*|h+m+|m+h+m+)$/;

// `token` is a word already lower-cased with punctuation removed.
export const isFiller = (token: string) => FILLER.test(token);

// Whether a transcript has its fillers written out: true for episodes transcribed with
// `disfluencies` on (from 5 October 2026), whose "um"s are words. The editor then has no need to
// guess where they were from silences (Mark hesitations). An hour of talk without a single one
// does not happen.
export const hasFillers = (words: { text: string }[]) =>
    words.some(w => isFiller(w.text.toLowerCase().replace(/[^a-z0-9']+/g, '')));
