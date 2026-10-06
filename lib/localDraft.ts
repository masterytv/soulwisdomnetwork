// Why: autosave that survives a closed tab (docs/specs/019-editor-light-v2.md item 2.6; the idea from
// Rescript's MIT tree, docs/licences/rescript.md). Each unsaved change is also kept in this browser's
// localStorage, with the saved version it was made on. On the next load the editor offers it back only
// if that version is still the saved one: the server's version check (409) still decides, so a copy
// overtaken by a newer save is dropped, never written over it.

export interface LocalDraft<T> { value: T; version: number; at: number }

// Which local copy to offer, given the saved version on the server: the copy, 'stale' when a newer save
// overtook it (drop it), or null when there is none or it cannot be read.
export function draftToOffer<T>(raw: string | null, serverVersion: number): LocalDraft<T> | 'stale' | null {
    if (!raw) return null;
    try {
        const d = JSON.parse(raw) as LocalDraft<T>;
        if (!d || typeof d !== 'object' || typeof d.version !== 'number' || typeof d.at !== 'number' || d.value === undefined) return null;
        return d.version === serverVersion ? d : 'stale';
    } catch {
        return null;
    }
}

// localStorage can be missing, full or blocked (a private window, cleared site data): every call is
// wrapped, and the page works without it.
export const localDrafts = {
    read(key: string): string | null {
        try { return window.localStorage.getItem(key); } catch { return null; }
    },
    write<T>(key: string, draft: LocalDraft<T>) {
        try { window.localStorage.setItem(key, JSON.stringify(draft)); } catch { /* full or blocked: the server save still runs */ }
    },
    clear(key: string) {
        try { window.localStorage.removeItem(key); } catch { /* nothing to clear */ }
    },
};
