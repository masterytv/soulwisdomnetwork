// Step 3 on the show notes page when the Studio editor makes the final cut ("Build edit package", spec 020 item E15):
// sets up the episode's edit on the server, exactly as the Studio editor sets one up when it first opens an episode
// (item E10, lib/programme.ts firstEdit): every filler word, stammer, missed "um" and long pause cut, each one a cut
// that can be brought back, the teasers from the approved notes, and the notes plan's b-roll as layers
// (lib/layers.ts withLayers). The intro and outro are the Studio's unless the episode has its own. "Build for Studio
// editor" then opens the editor; "Build and export" also starts the render (lib/server/editRender.ts), which is the
// final cut. An episode that already has a saved edit keeps it: nothing is rebuilt, so the producer's changes stay,
// unless the producer asks for "Rebuild the edit package" (`rebuild`, Tom, 10 November 2026): the saved edit is then
// thrown away and set up again from the notes and b-roll as they are now, as the next version, so an editor still open
// on the old one cannot save over it.

import { FieldValue } from 'firebase-admin/firestore';
import type { Episode } from '@/types/episode';
import { SilencesFileSchema, type EpisodeEdit, type Silence } from '@/lib/edit';
import { motionGraphics, withLayers } from '@/lib/layers';
import { spaceFirstEdit } from '@/lib/textLane';
import { firstEdit, teasersFromNotes, withBuiltOpening } from '@/lib/programme';
import { openingMusicDefault } from '@/lib/audio';
import { brollBlock } from '@/lib/brollGate';
import { adminBucket, adminDb } from './firebaseAdmin';
import { binItems } from './mediaBin';
import { acceptedWords } from './notes';
import { HttpError } from './staff';
import { runningJobs } from '@/lib/episodeReset';
import { getSettings } from './studioSettings';
import { requestEditRender } from './editRender';
import { requestHighlights } from './claudeEdits';

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
// The jobs that read or write the saved edit: a rebuild waits for them.
const EDIT_JOBS = ['Render', 'Highlights', 'Retakes', 'Translations'];

export async function buildEdit(id: string, uid: string, { render, rebuild = false }: { render: boolean; rebuild?: boolean }): Promise<BuildResult> {
    const ref = episodeRef(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    if (episode.notes?.status !== 'approved') throw new HttpError(409, 'Approve the show notes first');
    const held = brollBlock(episode);
    if (held) throw new HttpError(409, held);
    let result: BuildResult = { built: false, counts: {}, teasers: episode.edit?.teasers?.length ?? 0, broll: 0, rendering: false };
    const base = episode.edit?.version ?? 0;
    if (rebuild) {
        if (!episode.edit) throw new HttpError(409, 'There is no edit to rebuild yet: build it instead');
        const busy = runningJobs(episode).filter(j => EDIT_JOBS.includes(j));
        if (busy.length) throw new HttpError(409, `Wait for ${busy.join(' and ').toLowerCase()} to finish: ${busy.length === 1 ? 'it works' : 'they work'} on the saved edit`);
    }
    if (!episode.edit || rebuild) {
        if (!episode.review?.reviewedPath) throw new HttpError(409, 'Accept the transcript first');
        const settings = await getSettings();
        const [words, silences, bin] = await Promise.all([acceptedWords(episode), loadSilences(episode), binItems(id, episode, settings)]);
        const notes = episode.notes.approved;
        const teasers = settings.teasers && notes ? teasersFromNotes(notes.teaserClips ?? []) : [];
        const blank: EpisodeEdit = { cuts: [], version: 0 };
        const setUp = firstEdit(blank, { words, silences, teasers });
        // Spec 022 stage 3b: the opening built as the editor builds it on first opening, with the music Build would pick.
        const library = bin.flatMap(i => (i.source === 'library' && i.sound ? [{ id: i.id.replace(/^lib-/, ''), kind: i.sound.kind, path: i.path, name: i.name, checked: i.sound.checked }] : []));
        const music = openingMusicDefault({ remembered: settings.openingMusic, old: settings.teaserMusic, library });
        const edit = withLayers(withBuiltOpening(setUp.edit, { teasers, sections: settings.joins, music }), bin);
        // The motion graphics (spec 021 M2, on by default — the Studio setting turns them off, item M5):
        // placed once, with the b-roll, on a fresh edit.
        if (settings.motionGraphics) {
            edit.layers = [...(edit.layers ?? []), ...motionGraphics({
                title: notes?.titles?.[notes.chosenTitle] ?? notes?.titles?.[0] ?? '',
                show: settings.showName,
                words,
                chapters: notes?.chapters ?? [],
                hosts: settings.hosts,
                logoBug: settings.placeLogoBug,
            })];
            // None overlaps another on V3 once the first cuts close the gaps (lib/textLane.ts).
            edit.layers = spaceFirstEdit(edit, edit.layers, words);
        }
        await adminDb().runTransaction(async tx => {
            const now = (await tx.get(ref)).data() as Episode | undefined;
            // Someone opened the editor meanwhile, which set up and saved its own: that one stays. For a rebuild, an
            // edit saved since the button was pressed is not thrown away unseen.
            if (now?.edit && !rebuild) return;
            if (rebuild && (now?.edit?.version ?? 0) !== base) throw new HttpError(409, 'The edit was saved while it was being rebuilt: reload the page and try again');
            tx.update(ref, {
                edit: {
                    cuts: edit.cuts, version: base + 1, updatedAt: new Date().toISOString(), updatedBy: uid,
                    overlays: [], layers: edit.layers ?? [], captions: null, voice: null, speakerTracks: null, order: null,
                    intro: null, outro: null, teasers: edit.teasers ?? null, programme: edit.programme ?? null, splits: [], joins: [],
                },
                updatedAt: FieldValue.serverTimestamp(),
            });
            result = {
                built: true, counts: setUp.counts, teasers: edit.teasers?.length ?? 0,
                broll: (edit.layers ?? []).filter(l => l.id.startsWith('broll-')).length, rendering: false,
            };
        });
        // "Suggest highlights when the edit is built" (spec 021, Tom's D3 chose off by default): started
        // best-effort — a build never fails because the suggestion run could not start.
        if (result.built && settings.suggestOnBuild && settings.highlightDensity !== 'off') {
            await requestHighlights(id).catch(error => console.warn(`Highlights were not suggested with the build: ${(error as Error).message}`));
        }
    }
    if (render) {
        await requestEditRender(id);
        result = { ...result, rendering: true };
    }
    return result;
}
