// Drive access for the website, as the App Hosting service account. It must be a
// Content manager on the pipeline shared drive (docs/specs/006-podcast-studio.md).

import { auth, drive as driveApi, type drive_v3 } from '@googleapis/drive';

let client: drive_v3.Drive | undefined;

export function studioDrive() {
    client ??= driveApi({
        version: 'v3',
        auth: new auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] }),
    });
    return client;
}

export const DRIVE_FOLDERS = {
    backlog: process.env.DRIVE_BACKLOG_FOLDER_ID || '',
    toProcess: process.env.DRIVE_TO_PROCESS_FOLDER_ID || '',
    processed: process.env.DRIVE_PROCESSED_FOLDER_ID || '',
};
