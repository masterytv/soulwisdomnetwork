// Why: one track per speaker, optional (docs/specs/019-editor-light-v2.md item 3.3, decision D5). Zoom can record a
// separate audio file for each participant, and when it did, the render builds the voice from those (each cleaned
// and gated on its own, so one person's room noise or cross-talk does not ride under another's voice) instead of
// the single mixed track. An episode without them works exactly as before. This file holds what the Studio, the
// ingest job and the render share: which files are speaker tracks, and their names.

// At most this many tracks per episode (Zoom's separate files are one per participant).
export const MAX_TRACKS = 8;

export interface SpeakerTrack {
    path: string;                 // Cloud Storage, under episodes/{id}/source/tracks/
    name: string;                 // who it is, from the file's name (the producer can rename it)
    fileName: string;             // as it was named
}

const AUDIO = /\.(m4a|mp3|wav|aac|flac|ogg|opus)$/i;
export const isAudioName = (name: string) => AUDIO.test(name);

// A person's name from a Zoom file name: "audioTomWood11234567890.m4a" (a local recording's "Audio Record"
// folder) gives "Tom Wood"; "GMT20261006-100000_Recording_separate1_Ana Example.m4a" gives "Ana Example".
// Anything else: the name without its extension.
export function trackName(fileName: string): string {
    const stem = fileName.replace(/\.[^.]+$/, '');
    const local = stem.match(/^audio([A-Za-z][A-Za-z_\- ]*?)\d{5,}$/);
    if (local) return local[1].replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    const cloud = stem.match(/_separate\d+_(.+)$/i);
    if (cloud) return cloud[1].replace(/_/g, ' ').trim();
    return stem.trim().slice(0, 60);
}

// The speaker tracks among the files in a recording's folder in the Drive inbox. Zoom's local recording puts the
// mixed sound beside the video and each participant's in a subfolder ("Audio Record"): the subfolders' audio files
// are the tracks. With no subfolder audio, two or more audio files beside the video are taken as tracks; a single
// one is the mix, not a track.
export function pickTracks<F extends { name?: string | null }>(top: F[], inSubfolders: F[]): F[] {
    const audio = (fs: F[]) => fs.filter(f => isAudioName(f.name ?? ''));
    const sub = audio(inSubfolders);
    if (sub.length) return sub.slice(0, MAX_TRACKS);
    const beside = audio(top);
    return beside.length >= 2 ? beside.slice(0, MAX_TRACKS) : [];
}

// Whether a render uses the tracks: when the episode has them, unless its edit turned them off.
export function usesTracks(tracks: SpeakerTrack[] | undefined, edit: { speakerTracks?: boolean | null } | undefined): boolean {
    return !!tracks?.length && edit?.speakerTracks !== false;
}
