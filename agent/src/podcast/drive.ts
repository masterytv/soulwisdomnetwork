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
            throw new PermanentError(`Cannot open ${label} folder ${folderId}: check the folder ID and that the ` +
                `folder (or its shared drive) is shared with the service account as Editor/Content manager`);
        }
        throw error;
    }
}

export function listEpisodeFolders(drive: Drive, parentId: string) {
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

// participants.txt may be a plain text file or a Google Doc; either way, one name per line.
export async function readParticipants(drive: Drive, file: DriveFile): Promise<string[]> {
    const res = await withRetry('Drive read participants', () =>
        file.mimeType === 'application/vnd.google-apps.document'
            ? drive.files.export({ fileId: file.id!, mimeType: 'text/plain' }, { responseType: 'text' })
            : drive.files.get({ fileId: file.id!, alt: 'media', supportsAllDrives: true }, { responseType: 'text' }),
    );
    return String(res.data)
        .replace(/^﻿/, '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
}

export async function moveFolder(drive: Drive, folderId: string, fromParent: string, toParent: string) {
    await withRetry('Drive move', () => drive.files.update({
        fileId: folderId,
        addParents: toParent,
        removeParents: fromParent,
        supportsAllDrives: true,
        fields: 'id',
    }));
}
