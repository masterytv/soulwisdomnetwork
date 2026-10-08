// Step 3 on the show notes page when the Studio editor makes the final cut ("Build edit package", spec 020 item E15):
// sets up the episode's edit on the server, exactly as the Studio editor sets one up when it first opens an episode
// (item E10, lib/programme.ts firstEdit): every filler word, stammer, missed "um" and long pause cut, each one a cut
// that can be brought back, the teasers from the approved notes, and the notes plan's b-roll as layers
// (lib/layers.ts withLayers). The intro and outro are the Studio's unless the episode has its own. "Build for Studio
// editor" then opens the editor; "Build and export" also starts the render (lib/server/editRender.ts), which is the
// final cut. An episode that already has a saved edit keeps it: nothing is rebuilt, so the producer's changes stay.

import { FieldValue } from 'firebase-admin/firestore';
import type { Episode } from '@/types/episode';
import { SilencesFileSchema, type EpisodeEdit, type Silence } from '@/lib/edit';
import { withLayers } from '@/lib/layers';
import { firstEdit, teasersFromNotes } from '@/lib/programme';
import { brollBlock } from '@/lib/brollGate';
import { adminBucket, adminDb } from './firebaseAdmin';
import { binItems } from './mediaBin';
import { acceptedWords } from './notes';
import { HttpError } from './staff';
import { getSettings } from './studioSettings';
import { requestEditRender } from './editRender';

export interface BuildView {
    edited: boolean;                  // the episode has a saved edit (built here or in the editor)
    editVersion: number;
    notesApproved: boolean;
    brollBlock: string | null;        // why the edit waits for the b-roll images (lib/brollGate.ts)
}

export interface BuildResult {
    built: boolean;                   // false: the saved edit was kept as it is
    counts: Partial<Record<'filler' | 'repeat' | 'pause', number>>;
    teasers: number;
    broll: number;
    rendering: boolean;
}

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

// The silences measured at ingest; null for an episode not measured yet, so the cuts use the gaps between words.
export async function loadSilences(episode: Episode): Promise<Silence[] | null> {
    if (!episode.media?.silencesPath) return null;
    const raw = await adminBucket().file(episode.media.silencesPath).download().then(([b]) => JSON.parse(b.toString('utf8'))).catch(() => null);
    const parsed = SilencesFileSchema.safeParse(raw);
    return parsed.success ? parsed.data.silences : null;
}

export async function getBuild(id: string): Promise<BuildView> {
    const snap = await episodeRef(id).get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    return {
        edited: !!episode.edit,
        editVersion: episode.edit?.version ?? 0,
        notesApproved: episode.notes?.status === 'approved',
        brollBlock: brollBlock(episode),
    };
}

// Sets up the edit when there is none, and with `render`, starts rendering the saved edit.
export async function buildEdit(id: string, uid: string, { render }: { render: boolean }): Promise<BuildResult> {
    const ref = episodeRef(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    if (episode.notes?.status !== 'approved') throw new HttpError(409, 'Approve the show notes first');
    const held = brollBlock(episode);
    if (held) throw new HttpError(409, held);
    let result: BuildResult = { built: false, counts: {}, teasers: episode.edit?.teasers?.length ?? 0, broll: 0, rendering: false };
    if (!episode.edit) {
        if (!episode.review?.reviewedPath) throw new HttpError(409, 'Accept the transcript first');
        const settings = await getSettings();
        const [words, silences, bin] = await Promise.all([acceptedWords(episode), loadSilences(episode), binItems(id, episode, settings)]);
        const notes = episode.notes.approved;
        const teasers = settings.teasers && notes ? teasersFromNotes(notes.teaserClips ?? []) : [];
        const blank: EpisodeEdit = { cuts: [], version: 0 };
        const setUp = firstEdit(blank, { words, silences, teasers });
        const edit = withLayers(setUp.edit, bin);
        await adminDb().runTransaction(async tx => {
            const now = (await tx.get(ref)).data() as Episode | undefined;
            // Someone opened the editor meanwhile, which set up and saved its own: that one stays.
            if (now?.edit) return;
            tx.update(ref, {
                edit: {
                    cuts: edit.cuts, version: 1, updatedAt: new Date().toISOString(), updatedBy: uid,
                    overlays: [], layers: edit.layers ?? [], captions: null, voice: null, speakerTracks: null, order: null,
                    intro: null, outro: null, teasers: edit.teasers ?? null, splits: [], joins: [],
                },
                updatedAt: FieldValue.serverTimestamp(),
            });
            result = {
                built: true, counts: setUp.counts, teasers: edit.teasers?.length ?? 0,
                broll: (edit.layers ?? []).filter(l => l.id.startsWith('broll-')).length, rendering: false,
            };
        });
    }
    if (render) {
        await requestEditRender(id);
        result = { ...result, rendering: true };
    }
    return result;
}
