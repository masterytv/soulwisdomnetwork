// The show library (docs/specs/020-studio-editor.md item E7, "Music and sound effects: licences"): music
// beds, effects and stingers used in every episode, each with the licence record the team keeps by hand.
// Entries are in `studio/media/items` (Admin SDK only), files under `library/` in Storage. Only admins add,
// change, check and remove them; everyone in the Studio sees them. A file whose licence nobody checked
// cannot be placed (the edit route) or rendered (the render job); changing its licence clears the check.

import { FieldValue } from 'firebase-admin/firestore';
import {
    EMPTY_LICENCE, LIBRARY_KINDS, LIBRARY_MAX, LicenceSchema, licenceMissing, licenceProblem,
    type LibraryEntry, type LibraryKind, type LibraryUse, type Licence,
} from '@/lib/audio';
import { adminBucket, adminDb } from './firebaseAdmin';
import { HttpError } from './staff';
import { checkUploaded } from './uploads';

const LINK_MS = 6 * 3600_000;
const items = () => adminDb().collection('studio').doc('media').collection('items');

type Doc = Omit<LibraryEntry, 'id' | 'url' | 'proofUrl'> & { addedAt?: unknown; addedBy?: string };

const signed = (path: string | null | undefined) => path
    ? adminBucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + LINK_MS }).then(([u]) => u).catch(() => null)
    : Promise.resolve(null);

function entryOf(id: string, d: Doc): LibraryEntry {
    return {
        id, kind: d.kind, path: d.path, name: d.name, durationMs: d.durationMs ?? null,
        licence: { ...EMPTY_LICENCE, ...d.licence }, checked: d.checked ?? null, uses: d.uses ?? [],
    };
}

// Every entry, newest first, with links to play the file and see the licence snapshot.
export async function listLibrary(): Promise<LibraryEntry[]> {
    const snap = await items().orderBy('addedAt', 'desc').limit(LIBRARY_MAX).get();
    return Promise.all(snap.docs.map(async d => {
        const e = entryOf(d.id, d.data() as Doc);
        const [url, proofUrl] = await Promise.all([signed(e.path), signed(e.licence.proofPath)]);
        return { ...e, url, proofUrl };
    }));
}

// Every entry, without links (the media bin signs what it lists).
export async function libraryAll(): Promise<LibraryEntry[]> {
    const snap = await items().orderBy('addedAt', 'desc').limit(LIBRARY_MAX).get();
    return snap.docs.map(d => entryOf(d.id, d.data() as Doc));
}

// The entries a set of sounds use, by id (the edit route and the render job).
export async function libraryEntries(ids: string[]): Promise<Map<string, LibraryEntry>> {
    const unique = [...new Set(ids)].filter(id => /^[\w-]{1,40}$/.test(id));
    if (!unique.length) return new Map();
    const snaps = await adminDb().getAll(...unique.map(id => items().doc(id)));
    return new Map(snaps.filter(s => s.exists).map(s => [s.id, entryOf(s.id, s.data() as Doc)]));
}

function parseLicence(raw: unknown, before: Licence = EMPTY_LICENCE): Licence {
    const r = LicenceSchema.safeParse({ ...before, ...(raw && typeof raw === 'object' ? raw : {}) });
    if (!r.success) throw new HttpError(400, `Licence: ${r.error.issues[0]?.message ?? 'not valid'}`);
    const problem = licenceProblem(r.data);
    if (problem) throw new HttpError(400, `This file cannot go in the library: ${problem}.`);
    return r.data;
}

const kindOf = (v: unknown): LibraryKind => (LIBRARY_KINDS.includes(v as LibraryKind) ? v as LibraryKind : 'music');
const nameOf = (v: unknown, fallback: string) => String(v ?? '').trim().slice(0, 150) || fallback;

// After an admin has sent a file: check it and list it, with whatever licence details are known yet. A
// licence the Studio cannot use is refused here, and the file deleted.
export async function addEntry(body: Record<string, unknown>, uid: string): Promise<LibraryEntry> {
    const path = String(body.path ?? '');
    if (!/^library\/s[a-z0-9]{6,}\.(mp3|m4a|wav)$/.test(path)) throw new HttpError(400, 'Not a library upload');
    if ((await items().count().get()).data().count >= LIBRARY_MAX) throw new HttpError(400, `The library holds at most ${LIBRARY_MAX} files`);
    let licence: Licence;
    try {
        licence = parseLicence(body.licence);
    } catch (e) {
        await adminBucket().file(path).delete().catch(() => {});
        throw e;
    }
    if (licence.proofPath) await checkUploaded('licence', licence.proofPath);
    await checkUploaded('library', path);
    const durationMs = typeof body.durationMs === 'number' && Number.isFinite(body.durationMs) && body.durationMs > 0 ? Math.round(body.durationMs) : null;
    const doc: Doc = { kind: kindOf(body.kind), path, name: nameOf(body.name, path.slice(8)), durationMs, licence, checked: null, uses: [] };
    const ref = items().doc();
    await ref.set({ ...doc, addedBy: uid, addedAt: FieldValue.serverTimestamp() });
    return { ...entryOf(ref.id, doc), url: await signed(path), proofUrl: await signed(licence.proofPath) };
}

async function entryRef(id: string) {
    if (!/^[\w-]{1,40}$/.test(id)) throw new HttpError(400, 'Not a library entry');
    const ref = items().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Not in the library');
    return { ref, entry: entryOf(id, snap.data() as Doc) };
}

// Changes the name, kind or licence. A changed licence must be checked again.
export async function updateEntry(id: string, body: Record<string, unknown>): Promise<LibraryEntry> {
    const { ref, entry } = await entryRef(id);
    const licence = body.licence !== undefined ? parseLicence(body.licence, entry.licence) : entry.licence;
    if (licence.proofPath && licence.proofPath !== entry.licence.proofPath) await checkUploaded('licence', licence.proofPath);
    const changed = JSON.stringify(licence) !== JSON.stringify(entry.licence);
    const next = {
        kind: body.kind !== undefined ? kindOf(body.kind) : entry.kind,
        name: body.name !== undefined ? nameOf(body.name, entry.name) : entry.name,
        licence,
        checked: changed ? null : entry.checked,
    };
    await ref.update(next);
    if (changed && entry.licence.proofPath && entry.licence.proofPath !== licence.proofPath) {
        await adminBucket().file(entry.licence.proofPath).delete().catch(() => {});
    }
    return { ...entry, ...next, url: await signed(entry.path), proofUrl: await signed(licence.proofPath) };
}

// An admin's word that the licence was read and allows this use (or taking that back).
export async function checkEntry(id: string, uid: string, checked: boolean): Promise<LibraryEntry> {
    const { ref, entry } = await entryRef(id);
    let mark = null;
    if (checked) {
        const missing = licenceMissing(entry.licence);
        if (missing.length) throw new HttpError(400, `Fill in ${missing.join(', ')} first`);
        const problem = licenceProblem(entry.licence);
        if (problem) throw new HttpError(400, problem);
        const who = await adminDb().collection('users').doc(uid).get();
        mark = { by: uid, name: String(who.get('displayName') ?? '').slice(0, 100) || 'An admin', on: new Date().toISOString().slice(0, 10) };
    }
    await ref.update({ checked: mark });
    return { ...entry, checked: mark, url: await signed(entry.path), proofUrl: await signed(entry.licence.proofPath) };
}

// Takes a file out of the library and deletes it, unless a render has used it: its record is then the
// proof behind that episode, so it stays.
export async function removeEntry(id: string) {
    const { ref, entry } = await entryRef(id);
    if (entry.uses.length) throw new HttpError(409, 'A rendered episode used this file, so its licence record stays');
    await ref.delete();
    await Promise.all([entry.path, entry.licence.proofPath].filter((p): p is string => !!p)
        .map(p => adminBucket().file(p).delete().catch(() => {})));
}

// Notes a use on each entry (the render job and the Shorts job do the same with their own Firestore).
export async function logUses(ids: string[], use: LibraryUse) {
    await Promise.all([...new Set(ids)].map(id => items().doc(id).update({ uses: FieldValue.arrayUnion(use) }).catch(() => {})));
}
