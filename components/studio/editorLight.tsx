// Why: Editor Light (spec 015) panel moved out of the show notes page, so the show
// notes page imports it and the full-page editor reuses it with workspace. It loads
// the edit via GET, saves via PUT with useAutosave, and renders the Editor component.
// `workspace` is the Studio editor (spec 020 item E1), with `heading` for its bar: there saving and
// Render sit in the bar, and the render's result is a panel beside the preview.
// Part I: it also loads the Studio's captions setting and the overlay image links for the full-page
// editor, and gives the editor Claude's suggestions for a tighter edit (retakes and more, spec 019 item 1.3)
// as a toolbar tool. The Studio editor also loads its timeline's waveform and thumbnails (item E2).
// Words retyped in the editor (spec 019 item 2.3) are saved through the words route, which publishes
// them to the accepted transcript; the editor's words are swapped for the corrected ones.
// Spec 019 item 2.6: unsaved changes are also kept in this browser, and offered back on the next load
// when the saved edit has not moved on since (lib/localDraft.ts).
// Spec 020 item E5: the Studio editor loads the episode's media bin with the edit, and before the editor
// first draws, turns an edit without layers into one with them: its overlays, and the notes plan's b-roll
// (as the render draws it). That is saved only with the producer's next change. Without the bin, layers
// cannot be changed, so a save could never drop the b-roll.

"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Editor } from '@/components/studio/editor';
import { hint as small, primary, secondary } from '@/components/studio/ui';
import { useAutosave } from '@/components/studio/useAutosave';
import { mmss, type SpokenWord } from '@/lib/showNotes';
import type { EpisodeEdit, Silence } from '@/lib/edit';
import type { EditRenderView } from '@/lib/server/editRender';
import { studioFetch, studioFetchBytes } from '@/lib/studioClient';
import type { ThumbSheets } from '@/lib/thumbs';
import type { TimelineMedia } from '@/components/studio/timeline';
import type { SectionJoins } from '@/lib/transitions';
import type { CaptionChoice } from '@/lib/onScreen';
import { addRetakes, kindCounts, retakeNotes } from '@/lib/retakes';
import { brandOf, type StudioSettings } from '@/lib/studioSettings';
import type { RetakesView, WordFixResult } from '@/types/studio';
import { spliceWords, type FixOp } from '@/lib/wordFixes';
import { draftToOffer, localDrafts, type LocalDraft } from '@/lib/localDraft';
import { brollLayer, layersOf, type BinItem, type Brand } from '@/lib/layers';

// An edit as the Studio editor works on it: with layers, the notes plan's b-roll among them.
function withLayers(edit: EpisodeEdit, bin: BinItem[]): EpisodeEdit {
    if (edit.layers) return edit;
    const layers = layersOf(edit);
    const have = new Set(layers.flatMap(l => (l.kind === 'text' ? [] : [l.media.path])));
    for (const b of bin) {
        if (b.source !== 'broll' || have.has(b.path) || b.startMs === undefined) continue;
        layers.push(brollLayer({ index: b.index ?? 0, startMs: b.startMs, durationSeconds: b.seconds ?? 6, path: b.path, idea: b.name }));
    }
    return { ...edit, layers, overlays: [] };
}
import { QualityReport } from '@/components/studio/qualityReport';
import { VoiceChoice } from '@/components/studio/voice';
import { EditFiles } from '@/components/studio/editFiles';
import { SpeakerTracks } from '@/components/studio/speakerTracks';

// "Suggest a tighter edit" in the toolbar: ask Claude to read the transcript, then add what it found as
// suggested cuts to review (kind Retakes in the counts). `onNotes` gets each suggestion's kind and why,
// for the review row.
function TightenTool({ episodeId, edit, onAdd, onNotes }: {
    episodeId: string; edit: EpisodeEdit; onAdd: (e: EpisodeEdit) => void; onNotes: (notes: Record<string, string>) => void;
}) {
    const [view, setView] = useState<RetakesView | null>(null);
    const [error, setError] = useState('');
    const load = useCallback(() => {
        studioFetch<RetakesView>(`/api/studio/episodes/${episodeId}/retakes`).then(setView).catch(e => setError((e as Error).message));
    }, [episodeId]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { onNotes(retakeNotes(view?.found ?? [])); }, [view, onNotes]);
    const running = view?.status === 'queued' || view?.status === 'working';
    useEffect(() => {
        if (!running) return;
        const timer = setInterval(load, 15_000);
        return () => clearInterval(timer);
    }, [running, load]);
    const start = async () => {
        setError('');
        try {
            await studioFetch(`/api/studio/episodes/${episodeId}/retakes`, { method: 'POST' });
            load();
        } catch (e) {
            setError((e as Error).message);
        }
    };
    const have = new Set(edit.cuts.map(c => `${c.startMs}-${c.endMs}`));
    const fresh = (view?.found ?? []).filter(r => !have.has(`${r.startMs}-${r.endMs}`));
    return (
        <>
            <button type="button" onClick={() => void start()} disabled={running} className={secondary}
                title="Claude reads the transcript for retakes, false starts, restarts, verbal tics, housekeeping and tangents, leaving key quotes and teaser clips alone (up to about $0.50)">
                {running ? 'Claude is reading for a tighter edit…' : view?.status === 'ready' ? 'Suggest a tighter edit again' : 'Suggest a tighter edit'}
            </button>
            {view?.status === 'ready' && fresh.length > 0 && (
                <button type="button" className={primary} onClick={() => onAdd({ ...edit, cuts: addRetakes(edit.cuts, fresh) })}
                    title={kindCounts(fresh)}>
                    Add {fresh.length} suggestion{fresh.length === 1 ? '' : 's'} to review
                </button>
            )}
            {view?.status === 'ready' && fresh.length > 0 && <span className={small}>{kindCounts(fresh)}</span>}
            {view?.status === 'ready' && view.found.length === 0 && <span className={small}>Claude found nothing to tighten.</span>}
            {view?.status === 'failed' && <span className="text-sm text-red-300">Tighter edit: {view.error}</span>}
            {error && <span className="text-sm text-red-300">{error}</span>}
        </>
    );
}

export function EditorLightStage({ episodeId, words: accepted, videoUrl, workspace = false, heading }: {
    episodeId: string; words: SpokenWord[]; videoUrl: string; workspace?: boolean; heading?: React.ReactNode;
}) {
    // The accepted transcript's words, with the corrections made here since the page loaded.
    const [words, setWords] = useState(accepted);
    const [fixBusy, setFixBusy] = useState(false);
    const [fixNote, setFixNote] = useState('');
    const fixWords = useCallback(async (ops: FixOp[]): Promise<FixOp[] | null> => {
        setFixBusy(true);
        setFixNote('');
        try {
            const res = await studioFetch<WordFixResult>(`/api/studio/episodes/${episodeId}/words`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ops }),
            });
            setWords(w => spliceWords(w, res.spans));
            setFixNote(res.docError ? `Corrected; the transcript Doc was not updated: ${res.docError}` : 'Corrected; render again to put it in the captions.');
            return res.undo;
        } catch (e) {
            setFixNote(`⚠️ Not corrected: ${(e as Error).message}`);
            return null;
        } finally {
            setFixBusy(false);
        }
    }, [episodeId]);
    const [edit, setEdit] = useState<EpisodeEdit>({ cuts: [], version: 0 });
    // Why editing is held: the b-roll images are neither made nor skipped (lib/brollGate.ts).
    const [brollHeld, setBrollHeld] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    // Links to the overlay images, and the Studio's captions setting, for the full-page editor's preview.
    const [overlayUrls, setOverlayUrls] = useState<Record<string, string>>({});
    const [studioCaptions, setStudioCaptions] = useState<CaptionChoice | undefined>(undefined);
    // The Studio's transitions between sections (spec 020 item E4), for the Transitions panel.
    const [studioJoins, setStudioJoins] = useState<SectionJoins | null>(null);
    // The Studio's colours, font and hosts, for titles, lower thirds and the logo bug (spec 020 item E6).
    const [brand, setBrand] = useState<Brand | undefined>(undefined);
    // The audio's silences measured at ingest (null before then), for the pause suggestions.
    const [silences, setSilences] = useState<Silence[] | null>(null);
    // Claude's kind and why for each suggestion it made, shown in the review row.
    const [cutNotes, setCutNotes] = useState<Record<string, string>>({});
    // The episode's media bin (Studio editor only): null while loading or when it failed (`binError`).
    const [bin, setBin] = useState<BinItem[] | null>(null);
    const [binError, setBinError] = useState('');
    // Unsaved changes found in this browser from an earlier visit (spec 019 item 2.6), and a note when
    // some were dropped because a newer save overtook them.
    const draftKey = `swc-studio-edit:${episodeId}`;
    const [localDraft, setLocalDraft] = useState<LocalDraft<EpisodeEdit> | null>(null);
    const [draftNote, setDraftNote] = useState('');
    const { change, reset, flush, saveState, saveError } = useAutosave<EpisodeEdit>(
        async (value, version) => {
            const res = await studioFetch<{ version: number }>(`/api/studio/episodes/${episodeId}/edit`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ edit: value, version }),
            });
            return res.version;
        },
        800,
        draftKey,
    );

    useEffect(() => {
        const binLoad = workspace
            ? studioFetch<{ items: BinItem[] }>(`/api/studio/episodes/${episodeId}/media`).then(v => v.items, e => { setBinError(`The media did not load: ${(e as Error).message}`); return null; })
            : Promise.resolve(null);
        Promise.all([
            studioFetch<{ edit: EpisodeEdit; overlayUrls?: Record<string, string>; silences?: Silence[] | null; brollBlock?: string | null }>(`/api/studio/episodes/${episodeId}/edit`),
            binLoad,
        ])
            .then(([data, items]) => {
                setBin(items);
                setBrollHeld(data.brollBlock ?? null);
                setEdit(workspace && items ? withLayers(data.edit, items) : data.edit);
                setOverlayUrls(data.overlayUrls ?? {});
                setSilences(data.silences ?? null);
                reset(data.edit.version);
                const found = draftToOffer<EpisodeEdit>(localDrafts.read(draftKey), data.edit.version);
                if (found === 'stale') {
                    localDrafts.clear(draftKey);
                    setDraftNote('Changes left unsaved in this browser were older than the saved edit, so the saved edit is shown.');
                } else if (found) setLocalDraft(found);
                setLoaded(true);
            })
            .catch(() => { setLoaded(true); });
    }, [episodeId, reset, draftKey, workspace]);

    // The Studio editor's timeline media, made at ingest: thumbnail links, then the waveform's peaks.
    // Either may be missing on an episode the ingest catch-up has not reached yet.
    const [timelineMedia, setTimelineMedia] = useState<TimelineMedia | null>(null);
    useEffect(() => {
        if (!workspace) return;
        let gone = false;
        studioFetch<{ thumbs: ThumbSheets | null; peaks: boolean }>(`/api/studio/episodes/${episodeId}/timeline`)
            .then(async v => {
                const peaks = v.peaks
                    ? await studioFetchBytes(`/api/studio/episodes/${episodeId}/peaks`).then(b => new Int8Array(b), () => null)
                    : null;
                if (!gone) setTimelineMedia({ thumbs: v.thumbs, peaks });
            })
            .catch(() => { if (!gone) setTimelineMedia({ thumbs: null, peaks: null }); });
        return () => { gone = true; };
    }, [workspace, episodeId]);

    // The Studio's captions setting, read once for the full-page editor.
    useEffect(() => {
        if (!workspace) return;
        studioFetch<{ settings: StudioSettings }>('/api/studio/settings')
            .then(v => { setStudioCaptions({ on: v.settings.burnCaptions, style: v.settings.captionStyle }); setStudioJoins(v.settings.joins); setBrand(brandOf(v.settings)); })
            .catch(() => {});
    }, [workspace]);

    // The render of the saved edit: checked on load and every 15 s while it runs.
    const [render, setRender] = useState<EditRenderView | null>(null);
    const [renderError, setRenderError] = useState('');
    const loadRender = useCallback(() => {
        studioFetch<EditRenderView>(`/api/studio/episodes/${episodeId}/edit-render`)
            .then(setRender)
            .catch(e => setRenderError((e as Error).message));
    }, [episodeId]);
    useEffect(() => { loadRender(); }, [loadRender]);
    const rendering = !!render?.status && ['queued', 'downloading', 'rendering', 'saving'].includes(render.status);
    useEffect(() => {
        if (!rendering) return;
        const timer = setInterval(loadRender, 15_000);
        return () => clearInterval(timer);
    }, [rendering, loadRender]);

    // Saves any pending change first, so the render uses the edit as it is on screen.
    const startRender = async () => {
        setRenderError('');
        if (!(await flush())) return;
        try {
            await studioFetch(`/api/studio/episodes/${episodeId}/edit-render`, { method: 'POST' });
            loadRender();
        } catch (e) {
            setRenderError((e as Error).message);
        }
    };

    // Watch the finished render: toggles a video player for the render's video.
    const [watching, setWatching] = useState(false);

    if (!loaded) return <p className={small}>Loading editor…</p>;

    // A local copy from an earlier visit: put it back (it saves against the version it was made on), or drop it.
    const restoreDraft = () => {
        if (!localDraft) return;
        const restored = { ...(workspace && bin ? withLayers(localDraft.value, bin) : localDraft.value), version: edit.version };
        setEdit(restored);
        change(restored);
        setLocalDraft(null);
    };
    const draftBanner = (localDraft || draftNote) && (
        <div role="status" className={`${workspace ? 'inline-flex' : 'flex mb-2'} flex-wrap items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-100`}>
            {localDraft ? (
                <>
                    <span>This browser has changes to this edit that were not saved ({new Date(localDraft.at).toLocaleString()}).</span>
                    <button type="button" onClick={restoreDraft} className={primary}>Restore them</button>
                    <button type="button" onClick={() => { localDrafts.clear(draftKey); setLocalDraft(null); }} className={secondary}>Discard</button>
                </>
            ) : (
                <>
                    <span>{draftNote}</span>
                    <button type="button" onClick={() => setDraftNote('')} className={secondary}>OK</button>
                </>
            )}
        </div>
    );

    // Save status in plain words, same labels and colours as the show notes autosave.
    const saveStatus = (
        <p className={`${small} ${workspace ? '' : 'mb-2'} ${saveState === 'error' ? 'text-red-300 font-bold' : saveState === 'saved' ? 'text-green-300' : 'text-gray-400'}`}>
            {{ saved: '✓ Saved', unsaved: 'Unsaved changes…', saving: 'Saving…', error: 'Not saved' }[saveState]}
            {saveState === 'error' && `: ${saveError}`}
            {fixNote && <span className={`ml-2 ${fixNote.startsWith('⚠️') ? 'text-red-300' : 'text-sky-300'}`}>{fixNote}</span>}
        </p>
    );

    // Render this edit: GitHub Actions makes the finished video and saves it to "04 Final".
    const renderControls = (
        <div className={`${workspace ? '' : 'mt-4'} flex flex-wrap items-center gap-3`}>
            {/* In the Studio editor the button is in the bar. */}
            {!workspace && (
                <button onClick={() => { void startRender(); }} disabled={rendering || render?.canStart === false} className={primary}>
                    {render?.status === 'ready' ? 'Render this edit again' : 'Render this edit'}
                </button>
            )}
            {render?.status === 'ready' && render.videoUrl && (
                <button onClick={() => setWatching(w => !w)} className={secondary}>
                    {watching ? 'Hide the render' : '▶ Watch the render'}
                </button>
            )}
            {rendering && <span className={small}>Rendering ({render?.status})… this can take a few hours for a long episode.</span>}
            {render?.status === 'ready' && (render.driveUrl || render.videoUrl) && (
                <span className={small}>
                    Rendered{render.durationSeconds !== null && ` (${mmss(render.durationSeconds * 1000)}, ${render.cuts ?? 0} cuts)`}:{' '}
                    {/* Drive when it is set up; otherwise a short-lived link to the video in Cloud Storage. */}
                    <a href={render.driveUrl ?? render.videoUrl ?? undefined} target="_blank" rel="noreferrer" className="text-amber-300 underline">
                        {render.driveUrl ? 'open in Drive' : 'watch or download'}
                    </a>
                    {render.stale && ' · the edit or its words have changed since; render again to include the changes'}
                </span>
            )}
            {render?.status === 'failed' && <span className="text-sm text-red-300">Render failed: {render.error}</span>}
            {renderError && <span className="text-sm text-red-300">{renderError}</span>}
        </div>
    );

    // This episode's voice clean-up (spec 019 item 3.2), saved with the edit like its other choices.
    const voiceChoice = render && (
        <VoiceChoice voice={edit.voice} view={render} disabled={rendering}
            onChange={voice => { const e = { ...edit, voice }; setEdit(e); change(e); }} />
    );

    // Speaker tracks (spec 019 item 3.3), whether the render uses them saved with the edit.
    const speakerTracks = (
        <SpeakerTracks episodeId={episodeId} use={edit.speakerTracks !== false} rendered={render?.tracks ?? null}
            onUse={use => { const e = { ...edit, speakerTracks: use }; setEdit(e); change(e); }} />
    );

    // The Studio editor's bar: the Render button and a few words on where the render stands; the
    // rest is in the Render panel.
    const renderBar = (
        <>
            {rendering && <span className={small}>Rendering…</span>}
            {render?.status === 'ready' && <span className={small}>{render.stale ? 'Rendered, before the latest changes' : 'Rendered'}</span>}
            {render?.status === 'failed' && <span className="text-sm text-red-300">Render failed (see the Render panel)</span>}
            {renderError && <span className="text-sm text-red-300">{renderError}</span>}
            <button onClick={() => { void startRender(); }} disabled={rendering || render?.canStart === false} className={primary}>
                {render?.status === 'ready' ? 'Render again ▸' : 'Render ▸'}
            </button>
        </>
    );

    // The render player and the warnings list.
    const renderResult = (
        <>
            {watching && render?.status === 'ready' && render.videoUrl && (
                <video src={render.videoUrl} controls preload="metadata" aria-label="The finished render" className="mt-3 w-full max-w-3xl rounded-lg bg-black" />
            )}
            {render?.status === 'ready' && render.warnings.length > 0 && (
                <ul className={`${small} mt-2 list-disc pl-5`}>
                    {render.warnings.map(w => <li key={w}>{w}</li>)}
                </ul>
            )}
            {render?.status === 'ready' && <QualityReport qc={render.qc} />}
            {render?.status === 'ready' && <EditFiles files={render.exports} />}
        </>
    );

    // The Studio editor's Render panel: the render's state and links, the player and the report.
    const renderPanel = (
        <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-gray-200">Render</h2>
            <p className={small}>GitHub Actions makes the finished video from the saved edit{render?.status === 'ready' ? '' : ': press Render ▸ in the bar'}.</p>
            {voiceChoice}
            {speakerTracks}
            {renderControls}
            {renderResult}
        </div>
    );

    // The editor component.
    const editor = (
        <Editor
            words={words}
            videoUrl={videoUrl}
            edit={edit}
            workspace={workspace}
            studioCaptions={studioCaptions}
            overlayUrls={overlayUrls}
            cutNotes={cutNotes}
            silences={silences}
            tools={<TightenTool episodeId={episodeId} edit={edit} onAdd={e => { setEdit(e); change(e); }} onNotes={setCutNotes} />}
            onChange={(e) => { setEdit(e); change(e); }}
            heading={heading}
            status={<>{saveStatus}{workspace && draftBanner}</>}
            actions={workspace ? renderBar : undefined}
            panels={workspace ? [{ id: 'render', label: 'Render', node: renderPanel }] : []}
            timelineMedia={timelineMedia}
            studioJoins={studioJoins}
            brand={brand}
            onFixWords={fixWords}
            media={workspace ? { episodeId, items: bin, error: binError, onItems: setBin } : undefined}
            layersEditable={!workspace || !!bin}
            fixBusy={fixBusy}
        />
    );

    // Held until the b-roll images are made or skipped: what to do instead of the editor.
    if (brollHeld) {
        const note = (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-4 flex flex-col gap-2 text-sm text-gray-200 max-w-2xl">
                <p className="font-semibold text-amber-300">Finish or skip the b-roll first</p>
                <p>{brollHeld}</p>
                <Link href={`/admin/podcast/${episodeId}/notes#broll`} className="text-amber-300 hover:underline self-start">Go to the b-roll images →</Link>
            </div>
        );
        if (!workspace) return note;
        return (
            <div className="min-h-screen bg-[#0d0720] text-gray-100 p-4 sm:p-6">
                <div className="border-b border-white/10 pb-3 mb-4 flex items-center gap-3 flex-wrap">{heading}</div>
                {note}
            </div>
        );
    }

    if (workspace) return editor;

    return (
        <>
            {saveStatus}
            {draftBanner}
            {editor}
            <div className="mt-4 flex flex-col gap-3">{voiceChoice}{speakerTracks}</div>
            {renderControls}
            {renderResult}
        </>
    );
}
