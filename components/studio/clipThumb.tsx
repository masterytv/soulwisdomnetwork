"use client";

// A clip's "Soul Wisdom Clips" thumbnail on the show notes page (docs/specs/025-clips.md, step 4): the moments the
// job found (the main speaker's most expressive faces that fit the title, cut out), the one the thumbnail uses, its
// background and speaker, "Use this moment" for a frame picked on the player, and the thumbnail drawn as it will be
// uploaded (components/studio/clipThumbnail.ts), saved with Save thumbnail.

import { useEffect, useRef, useState } from "react";
import { drawClipThumbnail } from "@/components/studio/clipThumbnail";
import { canvasJpeg } from "@/components/studio/thumbnailCanvas";
import { chosen, primary, secondary } from "@/components/studio/ui";
import { THUMB_BACKGROUNDS, type ClipEdit, type ThumbBackground } from "@/lib/clips";
import { momentInputs, sameMoments } from "@/lib/clipThumbs";
import { auth } from "@/lib/firebase/config";
import { mmss } from "@/lib/showNotes";
import { studioFetch } from "@/lib/studioClient";
import { DEFAULT_SETTINGS, type StudioSettings } from "@/lib/studioSettings";
import { THUMB_HEIGHT, THUMB_MAX_BYTES, THUMB_WIDTH } from "@/lib/thumbnail";
import type { SettingsView } from "@/lib/server/studioSettings";
import type { ClipItemView } from "@/types/studio";

export interface Brand { family: string; colors: StudioSettings["colors"]; logo: ImageBitmap | null }

// The heading font, the Studio settings' colours and logo, loaded once for every clip's thumbnail.
export function useBrand(): Brand {
    const [brand, setBrand] = useState<Brand>({ family: "", colors: DEFAULT_SETTINGS.colors, logo: null });
    useEffect(() => {
        let cancelled = false;
        const outfit = getComputedStyle(document.body).getPropertyValue("--font-outfit").trim() || "sans-serif";
        document.fonts.load(`900 100px ${outfit}`).catch(() => []).then(() => { if (!cancelled) setBrand(b => ({ ...b, family: outfit })); });
        studioFetch<SettingsView>("/api/studio/settings")
            .then(v => { if (!cancelled) setBrand(b => ({ ...b, colors: v.settings.colors })); return v.logoUrl ?? "/logo.png"; })
            .catch(() => "/logo.png")
            .then(src => fetch(src)).then(r => r.blob()).then(b => createImageBitmap(b))
            .then(logo => { if (!cancelled) setBrand(b => ({ ...b, logo })); }).catch(() => {});
        return () => { cancelled = true; };
    }, []);
    return brand;
}

// An image from the Studio API (it needs the sign-in token, so not a plain <img src>).
async function fetchImage(url: string) {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!res.ok) throw new Error(`Could not load an image (${res.status})`);
    const blob = await res.blob();
    return { bitmap: await createImageBitmap(blob), src: URL.createObjectURL(blob) };
}
type Loaded = { bitmap: ImageBitmap; src: string };

const BACKGROUND_LABELS: Record<ThumbBackground, string> = { brand: "Brand", clip: "From the clip" };

export function ClipThumb({ episodeId, item, view, finalAt, brand, working, playerMs, onChange, onUseMoment, onSaved, onError }: {
    episodeId: string; item: ClipEdit; view: ClipItemView | undefined; finalAt: number; brand: Brand; working: boolean;
    playerMs: () => number | null; onChange: (patch: Partial<ClipEdit>) => void; onUseMoment: (atMs: number) => void;
    onSaved: () => void; onError: (message: string) => void;
}) {
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const [images, setImages] = useState<Record<string, Loaded>>({});
    const [saving, setSaving] = useState(false);
    // What was drawn when last saved here, to say when the drawing has changed since.
    const [savedAs, setSavedAs] = useState<string | null>(null);
    const moments = view?.moments ?? null;
    const found = moments?.found ?? [];
    const current = !!moments && sameMoments(moments.inputs, momentInputs(item, finalAt));
    const at = item.thumbMoment !== null && item.thumbMoment < found.length ? item.thumbMoment : found.length ? 0 : null;
    const moment = at !== null ? found[at] : null;
    const base = `/api/studio/episodes/${episodeId}/clips/${item.id}/image`;

    // Each moment's frame and cut-out, fetched once per search.
    useEffect(() => {
        if (!moments) return;
        const wanted = moments.found.flatMap((m, n) => [`frame-${n}`, ...(m.cutout ? [`cutout-${n}`] : [])])
            .filter(name => !images[`${name}:${moments.key}`]);
        if (!wanted.length) return;
        let cancelled = false;
        Promise.all(wanted.map(async name => [`${name}:${moments.key}`, await fetchImage(`${base}?name=${name}&v=${moments.key}`)] as const))
            .then(loaded => { if (!cancelled) setImages(prev => ({ ...prev, ...Object.fromEntries(loaded) })); })
            .catch(e => { if (!cancelled) onError((e as Error).message); });
        return () => { cancelled = true; };
    }, [moments, images, base, onError]);

    const image = (name: string) => (moments ? images[`${name}:${moments.key}`] : undefined);
    const frame = at !== null ? image(`frame-${at}`) : undefined;
    const cutout = at !== null && moment?.cutout ? image(`cutout-${at}`) : undefined;
    const drawing = `${item.thumbText}|${item.thumbBackground}|${moments?.key}|${at}`;

    useEffect(() => {
        const ctx = canvas.current?.getContext("2d");
        if (!ctx || !brand.family) return;
        drawClipThumbnail(ctx, {
            text: item.thumbText, family: brand.family, colors: brand.colors, background: item.thumbBackground, side: moment?.side ?? "right",
            images: { frame: frame?.bitmap ?? null, cutout: cutout?.bitmap ?? null, logo: brand.logo },
        });
    }, [brand, item.thumbText, item.thumbBackground, moment, frame, cutout]);

    async function save() {
        if (!canvas.current) return;
        setSaving(true);
        try {
            const image = await canvasJpeg(canvas.current, THUMB_MAX_BYTES);
            await studioFetch(`/api/studio/episodes/${episodeId}/clips/${item.id}/thumbnail`, { method: "PUT", body: JSON.stringify({ image }) });
            setSavedAs(drawing);
            onSaved();
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setSaving(false);
        }
    }

    function useFrame() {
        const ms = playerMs();
        if (ms === null || ms < item.startMs || ms > item.endMs) {
            onError(`Play or pause the player above somewhere inside this clip (${mmss(item.startMs)}–${mmss(item.endMs)}), then use that frame.`);
            return;
        }
        onUseMoment(ms);
    }

    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs text-gray-400">Thumbnail: Soul Wisdom Clips</span>
            {!item.thumbText.trim() ? (
                <p className="text-xs text-gray-400">Give the clip a thumbnail title (or have Claude write one), then Find thumbnail moments.</p>
            ) : !moments ? (
                <p className="text-xs text-gray-400">No moments yet: Find thumbnail moments looks for {item.thumbSpeaker ?? "the main speaker"}&apos;s most expressive faces that fit the title.</p>
            ) : !current ? (
                <p className="text-xs text-amber-300">The title, feeling, speaker or ends changed since these moments were found; find them again to match.</p>
            ) : !found.length ? (
                <p className="text-xs text-amber-300">No one could be cut out for this clip, so the thumbnail shows the title alone. Try Use this moment on a clear frame.</p>
            ) : null}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-3 items-start">
                <canvas ref={canvas} width={THUMB_WIDTH} height={THUMB_HEIGHT} className="w-full max-w-2xl rounded-lg border border-studio-line bg-black" />
                <div className="flex flex-col gap-2 text-xs text-gray-400">
                    {found.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <span>Moment</span>
                            <div className="grid grid-cols-2 gap-1.5">
                                {found.map((m, n) => {
                                    const src = image(`frame-${n}`)?.src;
                                    return (
                                        <button key={n} onClick={() => onChange({ thumbMoment: n })} aria-pressed={n === at}
                                            className={`flex flex-col items-stretch gap-0.5 rounded-lg p-1 border ${n === at ? "border-amber-400/70 bg-amber-500/10" : "border-studio-edge hover:bg-white/5"}`}>
                                            {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL of an image fetched with the sign-in token */}
                                            {src ? <img src={src} alt="" className="w-full aspect-video rounded object-cover" /> : <span className="w-full aspect-video rounded bg-black/40" />}
                                            <span className="text-gray-200">{m.chosenByHand ? "your frame" : m.emotion}</span>
                                            <span>{mmss(m.atMs)}{m.chosenByHand ? "" : ` · fit ${m.fit}/10`}{m.cutout ? "" : " · no cut-out"}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        <span>Background</span>
                        <div className="flex gap-1.5">
                            {THUMB_BACKGROUNDS.map(b => (
                                <button key={b} onClick={() => onChange({ thumbBackground: b })} aria-pressed={item.thumbBackground === b}
                                    className={item.thumbBackground === b ? chosen : secondary}>{BACKGROUND_LABELS[b]}</button>
                            ))}
                        </div>
                    </div>
                    {!!moments?.speakers.length && (
                        <label className="flex flex-col gap-1">
                            <span>Speaker on the thumbnail</span>
                            <select value={item.thumbSpeaker ?? ""} onChange={e => onChange({ thumbSpeaker: e.target.value || null })}
                                className="bg-black/30 border border-studio-line rounded-lg px-2 py-1 text-xs text-gray-200">
                                <option value="">Whoever speaks most ({moments.speakers[0]})</option>
                                {moments.speakers.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                    )}
                    <button onClick={useFrame} disabled={working} className={secondary}
                        title="Pause the player above on a frame inside this clip; that frame is cut out (the whole frame: with two people in it, both)">
                        Use the player&apos;s frame
                    </button>
                    <button onClick={save} disabled={saving || working || !brand.family} className={primary}>
                        {saving ? "Saving…" : view?.thumbnail && savedAs === drawing ? "Saved" : view?.thumbnail ? "Save thumbnail again" : "Save thumbnail"}
                    </button>
                    {view?.thumbnail && savedAs !== null && savedAs !== drawing && <span className="text-amber-300">Changed since saved.</span>}
                </div>
            </div>
        </div>
    );
}
