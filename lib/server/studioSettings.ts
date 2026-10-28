// Studio settings on the server (lib/studioSettings.ts): read with the defaults filled in, saved
// by an admin, and shown to the Settings page with short-lived links to the logo and intro.

import { FieldValue } from 'firebase-admin/firestore';
import { SETTINGS_DOC, StudioSettingsSchema, toStored, withDefaults, type StudioSettings } from '@/lib/studioSettings';
import { adminBucket, adminDb } from './firebaseAdmin';
import { HttpError } from './staff';
import { checkUploaded } from './uploads';
import { libraryEntries } from './library';

const LINK_MS = 60 * 60_000;

const ref = () => adminDb().collection(SETTINGS_DOC.collection).doc(SETTINGS_DOC.id);

export async function getSettings(): Promise<StudioSettings> {
    return withDefaults((await ref().get()).data());
}

export interface SettingsView {
    settings: StudioSettings;
    logoUrl: string | null;          // signed link to the uploaded logo, if any
    introUrl: string | null;         // signed link to the uploaded intro, if any
    artUrl: string | null;           // signed link to the podcast feed's uploaded artwork, if any
}

const signed = (path: string | null) => path
    ? adminBucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + LINK_MS }).then(([u]) => u).catch(() => null)
    : Promise.resolve(null);

export async function getSettingsView(): Promise<SettingsView> {
    const settings = await getSettings();
    const [logoUrl, introUrl, artUrl] = await Promise.all([signed(settings.logoPath), signed(settings.introPath), signed(settings.podcastArtPath)]);
    return { settings, logoUrl, introUrl, artUrl };
}

// Uploaded logos and intros live under settings/ (lib/server/uploads.ts); nothing else may be named.
const ownFile = (path: string | null) => path === null || /^settings\/(logo|intro)-\d+\.(png|jpg|jpeg|mp4|mov)$/i.test(path);

// A setting the page did not send (a page loaded before the setting existed, still open after a deploy) keeps its saved
// value, so saving from it never fails or resets what it does not show.
export async function saveSettings(input: unknown, uid: string): Promise<StudioSettings> {
    const sent = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const parsed = StudioSettingsSchema.safeParse({ ...(await getSettings()), ...sent });
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
    const s = parsed.data;
    if (!ownFile(s.logoPath) || !ownFile(s.introPath)) throw new HttpError(400, 'Upload the logo and intro on the Settings page');
    if (s.intro === 'custom' && !s.introPath) throw new HttpError(400, 'Upload your intro video, or choose another intro option');
    if (s.logoPath) await checkUploaded('logo', s.logoPath);
    if (s.introPath) await checkUploaded('intro', s.introPath);
    // The teasers' music and whoosh: show library files of the right kind, with their licences checked.
    const sounds = ([['teaserMusic', 'music', 'The teasers\' music'], ['teaserWhoosh', 'effect', 'The teasers\' whoosh']] as const)
        .flatMap(([key, kind, label]) => (s[key] ? [{ t: s[key]!, kind, label }] : []));
    if (sounds.length) {
        const entries = await libraryEntries(sounds.map(x => x.t.library));
        for (const { t, kind, label } of sounds) {
            const e = entries.get(t.library);
            if (!e || e.path !== t.path) throw new HttpError(400, `${label}: "${t.name}" is not in the show library`);
            if (e.kind !== kind) throw new HttpError(400, `${label}: "${t.name}" is in the library as ${kind === 'music' ? 'an effect' : 'music'}`);
            if (!e.checked) throw new HttpError(400, `${label}: "${t.name}" has no licence check yet`);
        }
    }
    await ref().set({ ...toStored(s), updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    return s;
}
