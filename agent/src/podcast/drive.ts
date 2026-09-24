import { drive as driveApi, auth, drive_v3 } from '@googleapis/drive';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { PermanentError, withRetry } from './errors';

// Folders live in a shared drive, so every call needs the all-drives flags.
const ALL_DRIVES = { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'allDrives' } as const;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|mkv|webm)$/i;

export type DriveFile = drive_v3.Schema$File;

export function createDrive(serviceAccount: { client_email: string; private_key: string }) {
    const jwt = new auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return driveApi({ version: 'v3', auth: jwt });
}

type Drive = ReturnType<typeof createDrive>;

async function listChildren(drive: Drive, parentId: string, extraQuery = ''): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
        const res = await withRetry('Drive list', () => drive.files.list({
            ...ALL_DRIVES,
            q: `'${parentId}' in parents and trashed = false${extraQuery}`,
            fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)',
            pageSize: 100,
            pageToken,
        }));
        files.push(...(res.data.files ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return files;
}

// Listing a folder the service account cannot see returns nothing rather than an error,
// which looks exactly like an empty inbox. Opening it directly fails loudly instead.
export async function checkFolderAccess(drive: Drive, folderId: string, label: string) {
    try {
        const res = await withRetry('Drive get folder', () => drive.files.get({
            fileId: folderId, supportsAllDrives: true, fields: 'id, name, mimeType',
        }));
        if (res.data.mimeType !== FOLDER_MIME) throw new PermanentError(`${label} (${folderId}) is not a folder`);
        return res.data.name ?? folderId;
    } catch (error) {
        if (error instanceof PermanentError) throw error;
        const e = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
        const status = Number(e.status ?? e.response?.status ?? e.code);
        if (status === 404 || status === 403) {
            // 403 also covers "Drive API not enabled", so pass Google's own reason through.
            const reason = (error as Error).message;
            throw new PermanentError(`Cannot open ${label} folder ${folderId} (${status}: ${reason}). Check the ` +
                'folder ID, that the Google Drive API is enabled in the project, and that the folder is shared ' +
                'with the service account as Editor');
        }
        throw error;
    }
}

export function listSubfolders(drive: Drive, parentId: string) {
    return listChildren(drive, parentId, ` and mimeType = '${FOLDER_MIME}'`);
}

export function listFolderFiles(drive: Drive, folderId: string) {
    return listChildren(drive, folderId, ` and mimeType != '${FOLDER_MIME}'`);
}

export function isVideo(file: DriveFile) {
    return (file.mimeType ?? '').startsWith('video/') || VIDEO_EXTENSIONS.test(file.name ?? '');
}

export async function downloadFile(drive: Drive, fileId: string, dest: string) {
    await withRetry('Drive download', async () => {
        const res = await drive.files.get(
            { fileId, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' },
        );
        await pipeline(res.data as Readable, fs.createWriteStream(dest));
    });
}

export async function moveItem(drive: Drive, fileId: string, fromParent: string, toParent: string) {
    await withRetry('Drive move', () => drive.files.update({
        fileId,
        addParents: toParent,
        removeParents: fromParent,
        supportsAllDrives: true,
        fields: 'id',
    }));
}

// Converts plain text into a Google Doc. Fails in a My Drive folder: service accounts have
// no Drive storage of their own, so they can only create files inside a shared drive.
export async function createGoogleDoc(drive: Drive, parentId: string, name: string, text: string) {
    const res = await withRetry('Drive create doc', () => drive.files.create({
        supportsAllDrives: true,
        requestBody: { name, parents: [parentId], mimeType: 'application/vnd.google-apps.document' },
        media: { mimeType: 'text/plain', body: text },
        fields: 'id, webViewLink',
    }));
    return res.data.webViewLink ?? `https://docs.google.com/document/d/${res.data.id}`;
}

export async function parentOf(drive: Drive, fileId: string) {
    const res = await withRetry('Drive get parent', () => drive.files.get({ fileId, supportsAllDrives: true, fields: 'parents' }));
    const parent = res.data.parents?.[0];
    if (!parent) throw new PermanentError(`Cannot find the folder that contains ${fileId}`);
    return parent;
}

const escapeQuery = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// The folder called `name` inside `parentId`, created if it is not there yet.
export async function ensureFolder(drive: Drive, parentId: string, name: string) {
    const found = (await listSubfolders(drive, parentId)).find(f => f.name === name);
    if (found?.id) return found.id;
    const res = await withRetry('Drive create folder', () => drive.files.create({
        supportsAllDrives: true,
        requestBody: { name, parents: [parentId], mimeType: FOLDER_MIME },
        fields: 'id',
    }));
    return res.data.id!;
}

export async function findFile(drive: Drive, folderId: string, name: string) {
    const files = await listChildren(drive, folderId, ` and name = '${escapeQuery(name)}' and mimeType != '${FOLDER_MIME}'`);
    return files[0];
}

// Uploads a local file into `folderId`, replacing the contents of a file with the same
// name so a rebuilt package keeps its links.
export async function putFile(drive: Drive, folderId: string, name: string, mimeType: string, localPath: string) {
    const existing = await findFile(drive, folderId, name);
    const media = () => ({ mimeType, body: fs.createReadStream(localPath) });
    if (existing?.id) {
        await withRetry('Drive replace file', () => drive.files.update({ fileId: existing.id!, supportsAllDrives: true, media: media(), fields: 'id' }));
        return existing.id;
    }
    const res = await withRetry('Drive upload file', () => drive.files.create({
        supportsAllDrives: true, requestBody: { name, parents: [folderId] }, media: media(), fields: 'id',
    }));
    return res.data.id!;
}

// A server-side copy: nothing is downloaded, however large the file.
export async function copyFile(drive: Drive, fileId: string, folderId: string, name: string) {
    const res = await withRetry('Drive copy', () => drive.files.copy({
        fileId, supportsAllDrives: true, requestBody: { name, parents: [folderId] }, fields: 'id',
    }));
    return res.data.id!;
}

export async function trashFile(drive: Drive, fileId: string) {
    await withRetry('Drive trash', () => drive.files.update({ fileId, supportsAllDrives: true, requestBody: { trashed: true }, fields: 'id' }));
}

