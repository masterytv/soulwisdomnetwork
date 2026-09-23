export function ago(when: number | string | null) {
    if (!when) return "";
    const ms = Date.now() - (typeof when === "number" ? when : Date.parse(when));
    const min = Math.round(ms / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)} days ago`;
}

export function minutes(seconds: number | null) {
    return seconds ? `${Math.round(seconds / 60)} min` : "";
}

export function megabytes(bytes: number) {
    return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export function usd(n: number) {
    return `$${n.toFixed(2)}`;
}

export const STAGE_LABEL: Record<string, string> = {
    copy: "Copying from Drive",
    media: "Making preview and audio",
    transcribe: "Transcribing",
    finalize: "Finishing up",
};
