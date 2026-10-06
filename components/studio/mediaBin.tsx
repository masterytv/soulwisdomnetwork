"use client";

// Why: the Studio editor's Media panel (spec 020 item E5, "Media"): the episode's bin
// (lib/server/mediaBin.ts). What the episode already has (the notes plan's b-roll stills, the teaser
// clips, the intro, the logo) and what was uploaded for it. Add an item at the playhead, or drag it onto
// the timeline. Uploads are measured here first (a picture's size, a video's or sound's length), since
// they are short files and no job needs to look at them. Sounds wait for music and effects (item E7).

import { useState } from 'react';
import type { BinItem, BinSource } from '@/lib/layers';
import { studioFetch } from '@/lib/studioClient';
import { hint, secondary } from '@/components/studio/ui';
import { typeOf, uploadFile } from '@/components/studio/upload';

export const BIN_DRAG_TYPE = 'application/x-swc-media';

const GROUPS: { title: string; sources: BinSource[] }[] = [
    { title: 'Uploaded for this episode', sources: ['upload'] },
    { title: 'B-roll from the show notes', sources: ['broll'] },
    { title: 'Teasers and intro', sources: ['teaser', 'intro'] },
    { title: 'The Studio\'s logo', sources: ['logo'] },
];
const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.m4a,.mp3,.wav';

const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// A file's size and length, read in the browser before it is sent.
function measure(file: File): Promise<{ durationMs?: number; width?: number; height?: number }> {
    const type = typeOf(file);
    const url = URL.createObjectURL(file);
    const done = <T,>(v: T) => { URL.revokeObjectURL(url); return v; };
    return new Promise(resolve => {
        if (type.startsWith('image/')) {
            const img = new Image();
            img.onload = () => resolve(done({ width: img.naturalWidth, height: img.naturalHeight }));
            img.onerror = () => resolve(done({}));
            img.src = url;
            return;
        }
        const el = document.createElement(type.startsWith('video/') ? 'video' : 'audio');
        el.preload = 'metadata';
        el.onloadedmetadata = () => resolve(done({
            durationMs: Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined,
            ...(el instanceof HTMLVideoElement ? { width: el.videoWidth, height: el.videoHeight } : {}),
        }));
        el.onerror = () => resolve(done({}));
        el.src = url;
    });
}

function Thumb({ item }: { item: BinItem }) {
    const box = 'w-16 h-9 shrink-0 rounded bg-black/40 overflow-hidden flex items-center justify-center text-gray-400';
    if (item.kind === 'audio' || !item.url) return <span className={box} aria-hidden>{item.kind === 'audio' ? '♪' : '▢'}</span>;
    // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
    if (item.kind === 'image') return <span className={box}><img src={item.url} alt="" draggable={false} className="w-full h-full object-cover" /></span>;
    return <span className={box}><video src={`${item.url}#t=0.5`} preload="metadata" muted className="w-full h-full object-cover" /></span>;
}

export function MediaPanel({ episodeId, items, error, canEdit, onItems, onAdd }: {
    episodeId: string;
    items: BinItem[] | null;            // null while loading
    error: string;
    canEdit: boolean;
    onItems: (items: BinItem[]) => void;
    onAdd: (item: BinItem, srcMs: number | null) => void;   // null: at the playhead
}) {
    const [share, setShare] = useState<number | null>(null);
    const [problem, setProblem] = useState('');

    async function upload(file: File | undefined) {
        if (!file || !items) return;
        setProblem('');
        setShare(0);
        try {
            const size = await measure(file);
            const { path } = await uploadFile('media', file, setShare, episodeId);
            const { item } = await studioFetch<{ item: BinItem }>(`/api/studio/episodes/${episodeId}/media`, {
                method: 'POST', body: JSON.stringify({ path, name: file.name.slice(0, 150), ...size }),
            });
            onItems([item, ...items]);
        } catch (e) {
            setProblem((e as Error).message);
        } finally {
            setShare(null);
        }
    }

    async function remove(item: BinItem) {
        if (!items || !confirm(`Remove "${item.name}" from this episode's media? The file is deleted.`)) return;
        setProblem('');
        try {
            await studioFetch(`/api/studio/episodes/${episodeId}/media?mediaId=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
            onItems(items.filter(i => i.id !== item.id));
        } catch (e) {
            setProblem((e as Error).message);
        }
    }

    return (
        <section aria-label="Media" className="flex flex-col gap-3">
            <div>
                <h2 className="text-sm font-semibold text-gray-200">Media</h2>
                <p className={hint}>Add a file at the playhead, or drag it onto the timeline. Pictures and video go on V2; text is in the On screen panel.</p>
            </div>
            <label className={`${secondary} cursor-pointer self-start ${!canEdit || !items ? 'opacity-40 pointer-events-none' : ''}`}>
                {share !== null ? `Uploading… ${Math.round(share * 100)}%` : '+ Upload a picture, video or sound'}
                <input type="file" accept={ACCEPT} className="hidden" disabled={share !== null || !canEdit || !items}
                    onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <p className={hint}>Pictures up to 20 MB (PNG, JPEG, WebP), video up to 2 GB (MP4, MOV), sounds up to 200 MB (MP3, M4A, WAV).</p>
            {(problem || error) && <p className="text-sm text-red-300">{problem || error}</p>}
            {!items && !error && <p className={hint}>Loading the media…</p>}
            {items && GROUPS.map(g => {
                const inGroup = items.filter(i => g.sources.includes(i.source));
                if (!inGroup.length) return null;
                return (
                    <div key={g.title} className="flex flex-col gap-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{g.title}</h3>
                        <ul className="flex flex-col gap-1">
                            {inGroup.map(item => (
                                <li key={item.id} draggable={canEdit && item.kind !== 'audio'}
                                    onDragStart={e => { e.dataTransfer.setData(BIN_DRAG_TYPE, item.id); e.dataTransfer.setData('text/plain', item.name); e.dataTransfer.effectAllowed = 'copy'; }}
                                    aria-label={`${item.name} (${item.kind})`}
                                    className={`flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-1.5 ${canEdit && item.kind !== 'audio' ? 'cursor-grab' : ''}`}>
                                    <Thumb item={item} />
                                    <span className="flex flex-col min-w-0 grow">
                                        <span className="text-xs text-gray-200 truncate" title={item.name}>{item.name}</span>
                                        <span className="text-[11px] text-gray-500">
                                            {item.kind === 'image' ? 'Picture' : item.kind === 'video' ? 'Video' : 'Sound'}
                                            {item.durationMs ? `, ${clock(item.durationMs)}` : ''}
                                            {item.source === 'broll' && item.startMs !== undefined ? `, planned at ${clock(item.startMs)}` : ''}
                                        </span>
                                    </span>
                                    {item.kind === 'audio' ? (
                                        <span className="text-[11px] text-gray-500 shrink-0" title="Music and effects come with item E7">Sound: later</span>
                                    ) : (
                                        <span className="flex flex-col gap-1 shrink-0">
                                            <button type="button" disabled={!canEdit} onClick={() => onAdd(item, null)} className={`${secondary} px-2 py-0.5`}>+ At playhead</button>
                                            {item.source === 'broll' && item.startMs !== undefined && (
                                                <button type="button" disabled={!canEdit} onClick={() => onAdd(item, item.startMs!)} className={`${secondary} px-2 py-0.5`}
                                                    title="Where the show notes planned it">+ As planned</button>
                                            )}
                                        </span>
                                    )}
                                    {item.source === 'upload' && (
                                        <button type="button" aria-label={`Remove ${item.name}`} title="Remove from this episode's media" onClick={() => void remove(item)}
                                            className={`${secondary} px-1.5 py-0.5 shrink-0`}>×</button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
            {items && !items.length && <p className={hint}>Nothing yet: upload a file, or make b-roll on the show notes page.</p>}
        </section>
    );
}
