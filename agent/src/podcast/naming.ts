// Zoom names recordings like
//   GMT20251028-152049_SWC - Recording_1920x1044-The meaning of Life.mp4
// Keep the human part as the title and the GMT stamp as the recording date.

const ZOOM_PREFIX = /^GMT(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_(?:.*?Recording(?:_\d+x\d+)?-?)?/i;

function baseName(fileName: string) {
    return fileName.replace(/\.[^.]+$/, '').replace(/^Copy of /i, '').trim();
}

// What's left of a Zoom name with no topic, e.g. "gallery_1280x720" or "1920x1044".
const ZOOM_LEFTOVER = /^(?:[a-z_ ]*?)?\d+x\d+$/i;

export function episodeTitle(fileName: string): string {
    const base = baseName(fileName);
    const rest = base.replace(ZOOM_PREFIX, '');
    if (rest !== base && (rest.trim() === '' || ZOOM_LEFTOVER.test(rest.trim()) || /Recording/i.test(rest))) {
        return `Recording ${recordedAt(fileName)!.slice(0, 10)}`;
    }
    return rest.replace(/_+/g, ' ').replace(/^[\s-]+/, '').replace(/\s+/g, ' ').trim() || base;
}

export function recordedAt(fileName: string): string | null {
    const m = baseName(fileName).match(ZOOM_PREFIX);
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}
