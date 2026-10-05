// Studio settings for the GitHub Actions jobs (lib/studioSettings.ts), read from Firestore with
// the defaults filled in, and the jobs' Storage bucket.

import type { Firestore } from 'firebase-admin/firestore';
import { SETTINGS_DOC, withDefaults, type StudioSettings } from '../../../lib/studioSettings';

export async function loadSettings(db: Firestore): Promise<StudioSettings> {
    return withDefaults((await db.collection(SETTINGS_DOC.collection).doc(SETTINGS_DOC.id).get()).data());
}

export function storageBucket(): string {
    return process.env.PODCAST_STORAGE_BUCKET || 'soulwisdomnetwork.firebasestorage.app';
}
