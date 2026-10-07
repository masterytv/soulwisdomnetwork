"use client";

// Editor Light (spec 015), phase 3: the transcript editor component.
// A controlled component with no data fetching: words, video, and edit state
// come from props. The transcript is grouped by speaker; cut words are
// struck through and dimmed; long pauses show as chips; the video preview
// skips cut ranges. Selection, delete, undo/redo, suggest/clear, search,
// review suggestions, and follow-video are wired.
// Part I: in the full-page editor, text and images show over the video and the "On screen" panel
// edits them; `tools` adds buttons to the toolbar (Claude's tighter edit), and `cutNotes` says why
// Claude suggested a cut, beside it in the review row.
// Spec 019 item 2.3: double-click a word to retype a misheard one, or replace a name everywhere
// (`onFixWords`, saved with speaker review's corrections).
// Spec 020 item E5: layers (lib/layers.ts) in place of the overlays: the Media panel adds pictures and
// video from the episode's bin, the preview draws them and drags them into place, the On screen panel
// sets each one's look, and the timeline's V2 and V3 tracks move and trim them.
// Spec 020 item E8: the YouTube caption track (lib/captions.ts editCues) on the timeline's CC lane, over the
// preview with CC, and in the Captions panel (components/studio/captions.tsx), which also holds Part I's
// burned-in option; Ctrl or ⌘ + C, X and V copy, cut and paste a layer or sound at the playhead; J, K and L
// shuttle (K with J or L steps a frame).
// Spec 020 item E10: the whole video, teasers, intro, episode and outro, on the timeline's Programme row and in the
// preview (components/studio/programme.tsx), from `programme` (what the page loaded for it).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpokenWord } from '@/lib/showNotes';
import type { Cut, EpisodeEdit, Silence } from '@/lib/edit';
import {
    keepRanges, orderAfterSplit, orderAfterUnsplit, suggestCuts, replaceSuggestions, cutSection, restoreSection, savedByReason, unspokenSpans, SUGGESTED_REASONS, HESITATION_REASONS,
    keptBounds,
    type UnspokenSpan,
} from '@/lib/edit';
import { hasFillers } from '@/lib/fillers';
import { primary, secondary, hint } from '@/components/studio/ui';
import { Timeline, type TimelineMedia, type TimelineSelection } from '@/components/studio/timeline';
import { SPEEDS } from '@/lib/studioUi';
import { captionLook, DEFAULT_CAPTION_STYLE, type CaptionChoice } from '@/lib/onScreen';
import { OnScreenPanel, OnScreenPreview } from '@/components/studio/onScreen';
import { CaptionsPanel, CaptionTrackPreview } from '@/components/studio/captions';
import { ReversePlay, useStudioKeys } from '@/components/studio/editorKeys';
import { editCues } from '@/lib/captions';
import { LayersPreview } from '@/components/studio/layers';
import { MediaPanel } from '@/components/studio/mediaBin';
import { ElementsPanel } from '@/components/studio/elements';
import { PropertiesPanel } from '@/components/studio/properties';
import { SoundProperties, SoundsPreview } from '@/components/studio/sounds';
import { soundBlocked } from '@/components/studio/mediaBin';
import { newSound, uploadKind, type Sound } from '@/lib/audio';
import { layerFromBin, layersOf, type BinItem, type Brand, type Layer } from '@/lib/layers';
import { DEFAULT_BRAND } from '@/lib/studioSettings';
import { ShortcutSheet, Workspace, type WorkspacePanel } from '@/components/studio/workspace';
import { playStep, previewRanges, sequenceLength, sequenceOf, timelineTime } from '@/lib/sequence';
import { joinKey, studioOnlySummary, TRANSITION_LABELS, type SectionJoins } from '@/lib/transitions';
import { TransitionsPanel } from '@/components/studio/transitionsPanel';
import { TransitionPreview, type PreviewJoin } from '@/components/studio/transitionPreview';
import { CutBridge } from '@/components/studio/cutBridge';
import { PartsPanel } from '@/components/studio/partsPanel';
import { FindReplace } from '@/components/studio/review/FindReplace';
import { fixGroup, fixOp, isUnsure, putBackOp, unsureTitle, type FixOp } from '@/lib/wordFixes';
import { ProgrammePlayer, ProgrammeStrip, useProgramme, type ProgrammeSetup } from '@/components/studio/programme';

// No media videos: one array, so the Parts panel does not redraw on every render.
const NO_VIDEOS: BinItem[] = [];
// No splits yet: one array, so the timeline does not redraw on every render.
const NO_SPLITS: number[] = [];
const NO_SOUNDS: Sound[] = [];

interface SpeakerPara {
    speaker: string;
    words: { word: SpokenWord; index: number }[];
}

// Group words into paragraphs by speaker.
function groupBySpeaker(words: SpokenWord[]): SpeakerPara[] {
    const paras: SpeakerPara[] = [];
    let current: SpeakerPara | null = null;
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (!current || current.speaker !== w.speaker) {
            current = { speaker: w.speaker, words: [] };
            paras.push(current);
        }
        current.words.push({ word: w, index: i });
    }
    return paras;
}

// Check if a word index is inside any cut.
function isCut(index: number, words: SpokenWord[], cuts: Cut[]): boolean {
    if (index >= words.length) return false;
    const start = words[index].start;
    const end = words[index].end;
    return cuts.some(c => start >= c.startMs && end <= c.endMs);
}

// Find the cut that covers a word, if any.
function findCut(index: number, words: SpokenWord[], cuts: Cut[]): Cut | undefined {
    if (index >= words.length) return undefined;
    return cuts.find(c => words[index].start >= c.startMs && words[index].end <= c.endMs);
}

// Which cut covers each word, and which cuts sit in the silence before each word, worked out
// once per edit. Checking every word against every cut on each render is too slow for a
// two-hour episode with hundreds of cuts. Words are in time order; with overlapping cuts the
// first in the list wins, as findCut does.
function cutMaps(words: SpokenWord[], cuts: Cut[]) {
    const wordCut: (Cut | undefined)[] = new Array(words.length);
    const gapCuts: Cut[][] = Array.from({ length: words.length }, () => []);
    const firstStartingAtOrAfter = (ms: number) => {
        let lo = 0, hi = words.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (words[mid].start < ms) lo = mid + 1; else hi = mid; }
        return lo;
    };
    for (const c of cuts) {
        for (let i = firstStartingAtOrAfter(c.startMs); i < words.length && words[i].start < c.endMs; i++) {
            if (words[i].end <= c.endMs && !wordCut[i]) wordCut[i] = c;
        }
        // The gap before word i holds the cut when the cut lies between words[i-1] and words[i]
        // (50 ms slack either side, as the transcript shows it).
        for (let i = Math.max(1, firstStartingAtOrAfter(c.endMs - 50)); i < words.length && c.startMs >= words[i - 1].end - 50; i++) {
            gapCuts[i].push(c);
        }
    }
    return { wordCut, gapCuts };
}

// Format mm:ss from ms.
function mmss(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Scroll the transcript box so the target element sits one third from the top.
// Never scrolls the page — only the box's scrollTop.
function scrollBoxTo(box: HTMLElement, target: HTMLElement) {
    const boxTop = box.scrollTop;
    const boxBottom = boxTop + box.clientHeight;
    const elTop = target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const elBottom = elTop + target.offsetHeight;
    // If the target is already visible, do nothing.
    if (elTop >= boxTop && elBottom <= boxBottom) return;
    // Position the target one third from the top of the box.
    box.scrollTop = Math.max(0, elTop - box.clientHeight / 3);
}

// workspace: the Studio editor (spec 020 item E1) — the same pieces in components/studio/workspace.tsx.
// studioCaptions: the Studio's captions setting; overlayUrls: links to the overlay images (both Part I).
// cutNotes: by `${startMs}-${endMs}`, a suggestion's kind and why ("False start: changed tack").
// silences: the audio's measured silences, for the pause suggestions (null: not measured, use word gaps).
// The Studio editor (workspace, spec 020 item E1) also takes the bar's `heading` (back link and title),
// `status` (saving) and `actions` (render), and `panels` beside the On screen panel; `timelineMedia`
// is its timeline's waveform and thumbnails (item E2; null while they load), and `studioJoins` the
// Studio's transitions between sections, for the Transitions panel (item E4).
// onFixWords: saves word corrections and resolves with the ops that undo them (null when it failed).
// media: the episode's bin for the Media panel (item E5); `layersEditable` is false when the bin could not
// load, so a save could never drop the notes plan's b-roll (the Studio editor adds it as layers on opening).
// brand: the Studio's colours, font and hosts for the Elements panel's titles, lower thirds and logo bug (item E6).
export function Editor({
    words, videoUrl, edit, onChange, workspace = false, studioCaptions, overlayUrls = {}, tools, cutNotes = {}, silences = null,
    heading, status, actions, panels = [], timelineMedia = null, studioJoins = null, onFixWords, fixBusy = false, media, layersEditable = true,
    brand = DEFAULT_BRAND, programme = null,
}: {
    words: SpokenWord[];
    videoUrl: string;
    edit: EpisodeEdit;
    onChange: (e: EpisodeEdit) => void;
    workspace?: boolean;
    studioCaptions?: CaptionChoice;
    overlayUrls?: Record<string, string>;
    tools?: React.ReactNode;
    cutNotes?: Record<string, string>;
    silences?: Silence[] | null;
    heading?: React.ReactNode;
    status?: React.ReactNode;
    actions?: React.ReactNode;
    panels?: WorkspacePanel[];
    timelineMedia?: TimelineMedia | null;
    studioJoins?: SectionJoins | null;
    onFixWords?: (ops: FixOp[]) => Promise<FixOp[] | null>;
    fixBusy?: boolean;
    media?: { episodeId: string; items: BinItem[] | null; error: string; onItems: (items: BinItem[]) => void };
    layersEditable?: boolean;
    brand?: Brand;
    programme?: ProgrammeSetup | null;
}) {
    const studio = studioCaptions ?? { on: false, style: DEFAULT_CAPTION_STYLE };
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const transcriptRef = useRef<HTMLDivElement>(null);
    const [selectedRange, setSelectedRange] = useState<[number, number] | null>(null);
    const [dragStart, setDragStart] = useState<number | null>(null);
    const historyRef = useRef<EpisodeEdit[]>([edit]);
    const historyIdx = useRef(0);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const rafRef = useRef<number>(0);
    const [currentWord, setCurrentWord] = useState(-1);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMatches, setSearchMatches] = useState<number[]>([]);
    const [searchCursor, setSearchCursor] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    // A misheard word being retyped: the words it covers (one correction's words) and the text.
    const [fixing, setFixing] = useState<{ from: number; to: number; text: string } | null>(null);
    const [replaceOpen, setReplaceOpen] = useState(false);
    // Words can be corrected here once the transcript was accepted with word refs (spec 019 item 2.3).
    const canFix = !!onFixWords && words.some(w => w.ref);

    // Review suggestions state.
    const [reviewIdx, setReviewIdx] = useState(0);
    const [reviewKind, setReviewKind] = useState<string | null>(null);
    const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const chipRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const autoScrollPauseRef = useRef(0);

    // Play mode: 'edited' skips the cuts, 'original' plays everything, so the producer can compare.
    const [playMode, setPlayMode] = useState<'edited' | 'original'>('edited');
    // Playback speed: one of SPEEDS, applied to the video element.
    const [speed, setSpeed] = useState(1);
    // Help panel: opened by the "?" button, holding the editing and shortcuts help.
    const [helpOpen, setHelpOpen] = useState(false);
    // The Studio editor's panel on the right, chosen on its rail.
    const [panelId, setPanelId] = useState('on-screen');
    // What is selected on the Studio editor's timeline (a stretch of time, or a cut). It and the
    // selected words exclude each other, so Delete always means one thing.
    const [timelineSel, setTimelineSel] = useState<TimelineSelection | null>(null);
    // The V2 track's eye: on-screen items hidden in the preview (never in the render).
    const [overlaysHidden, setOverlaysHidden] = useState(false);
    // The layer chosen on the preview, the timeline or the On screen panel (item E5).
    const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
    // Hear it: while a preview runs, cuts are played (not skipped) and playback pauses at endMs.
    const previewRef = useRef<{ endMs: number } | null>(null);

    const paras = useMemo(() => groupBySpeaker(words), [words]);
    const cutsByWord = useMemo(() => cutMaps(words, edit.cuts), [words, edit.cuts]);
    // Speech the transcript missed (spec 019 item 1.2), by the word it comes before: shown as … in
    // the gap, and cut with a click. Only with measured silences.
    const unspokenByWord = useMemo(() => {
        const by = new Map<number, UnspokenSpan[]>();
        for (const s of silences?.length ? unspokenSpans(words, silences) : []) by.set(s.before, [...by.get(s.before) ?? [], s]);
        return by;
    }, [words, silences]);
    const [videoDuration, setVideoDuration] = useState(0);
    // The play order (lib/sequence.ts): with transitions at splits (spec 020 item E4) the parts
    // overlap, so the edited length is shorter, and the preview plays the start of each later part
    // on a second video over the end of the one before (TransitionPreview), so one video skips it.
    const sequence = useMemo(() => sequenceOf(
        { cuts: edit.cuts, splits: edit.splits, joins: edit.joins, order: edit.order },
        videoDuration || (words.length > 0 ? words[words.length - 1].end : 0),
        words,
    ), [videoDuration, words, edit.cuts, edit.splits, edit.joins, edit.order]);
    const kept = sequence.clips;
    const ranges = useMemo(() => workspace ? previewRanges(sequence)
        : keepRanges(videoDuration || (words.length > 0 ? words[words.length - 1].end : 0), edit.cuts, 40, words),
    [workspace, sequence, videoDuration, words, edit.cuts]);
    const editedMs = useMemo(() => sequenceLength(kept), [kept]);
    // The YouTube caption track (item E8): the cues the render's .srt will have, on the edited timeline. CC
    // shows them over the preview.
    const cues = useMemo(() => workspace ? editCues(words, kept) : [], [workspace, words, kept]);
    const previewJoins = useMemo<PreviewJoin[]>(() => sequence.joins.map(j => ({
        aEndMs: j.aEndMs, bStartMs: j.bStartMs, durationMs: j.durationMs, transition: j.transition,
    })), [sequence.joins]);
    // Item 4.3 (CutBridge): cuts where a transition plays are left to TransitionPreview.
    const bridgeSkips = useMemo(() => sequence.joins.map(j => j.aEndMs), [sequence.joins]);
    // The split whose transition the Transitions panel shows first (chosen on the timeline).
    const [joinFocus, setJoinFocus] = useState<number | null>(null);

    // One total for both numbers: videoDuration || last word end.
    const totalMs = videoDuration || (words.length > 0 ? words[words.length - 1].end : 0);
    const timeSavedMs = Math.max(0, totalMs - editedMs);

    // Push edit to history when it changes.
    useEffect(() => {
        if (historyRef.current[historyIdx.current] !== edit) {
            historyRef.current = historyRef.current.slice(0, historyIdx.current + 1);
            historyRef.current.push(edit);
            historyIdx.current = historyRef.current.length - 1;
        }
        setCanUndo(historyIdx.current > 0);
        setCanRedo(historyIdx.current < historyRef.current.length - 1);
    }, [edit]);

    // Apply the chosen playback speed to the video whenever it changes.
    useEffect(() => {
        if (videoRef.current) videoRef.current.playbackRate = speed;
    }, [speed]);

    const updateEdit = useCallback((updater: (e: EpisodeEdit) => EpisodeEdit) => {
        onChange(updater({ ...edit, version: edit.version }));
    }, [edit, onChange]);

    // Layers (item E5): the edit's own, or its overlays converted until it has them. Changing them saves
    // them as layers for good. Links to their files come from the edit and the bin.
    const layers = useMemo(() => layersOf(edit), [edit]);
    const setLayers = useCallback((next: Layer[]) => {
        if (layersEditable) updateEdit(prev => ({ ...prev, layers: next, overlays: [] }));
    }, [layersEditable, updateEdit]);
    const mediaUrls = useMemo(() => {
        const urls: Record<string, string> = { ...overlayUrls };
        for (const it of media?.items ?? []) if (it.url && !urls[it.path]) urls[it.path] = it.url;
        return urls;
    }, [overlayUrls, media?.items]);
    // The whole video (item E10): teasers, intro, this episode and outro.
    const prog = useProgramme({ setup: workspace ? programme : null, edit, urls: mediaUrls, studioJoins, src: videoUrl, editedMs });
    const programmeControl = prog?.control;
    // Choosing a layer on the preview or the timeline keeps the keys with the editor (Delete removes it),
    // even when the element that was clicked goes away. Not from the panel, whose fields need the keys.
    const pickLayer = useCallback((id: string | null) => {
        setSelectedLayer(id);
        if (id) containerRef.current?.focus({ preventScroll: true });
    }, [setSelectedLayer]);
    // A layer chosen on the preview, the timeline or a panel's list, shown in the Properties panel (item E6).
    const openLayer = useCallback((id: string | null) => {
        pickLayer(id);
        if (id) setPanelId('properties');
    }, [pickLayer, setPanelId]);
    // Removed from a panel: the editor keeps the keys, so Ctrl+Z brings it back (the button that was pressed
    // goes away with it).
    const removeLayer = useCallback((id: string) => {
        if (layers.some(l => l.id === id)) setLayers(layers.filter(l => l.id !== id));
        else updateEdit(prev => ({ ...prev, audio: (prev.audio ?? []).filter(s => s.id !== id) }));
        setSelectedLayer(s => (s === id ? null : s));
        containerRef.current?.focus({ preventScroll: true });
    }, [layers, setLayers, updateEdit, setSelectedLayer]);
    // Elements (item E6): added, and the first opened in Properties so its text can be typed straight away.
    const addLayers = useCallback((made: Layer[]) => {
        if (!layersEditable || !made.length) return;
        setLayers([...layers, ...made]);
        setSelectedLayer(made[0].id);
        setPanelId('properties');
    }, [layers, layersEditable, setLayers, setSelectedLayer, setPanelId]);
    // Music and effects (item E7): the edit's sounds, on A2 and A3.
    const sounds = edit.audio ?? NO_SOUNDS;
    const setSounds = useCallback((next: Sound[]) => updateEdit(prev => ({ ...prev, audio: next })), [updateEdit]);
    // A bin item as a layer or a sound: at a moment of the recording, or at the playhead. A sound whose
    // licence is not checked, or whose rights nobody declared, cannot be placed.
    const addFromBin = useCallback((itemId: string, srcMs: number | null) => {
        const item = media?.items?.find(i => i.id === itemId);
        if (!item) return;
        const at = srcMs ?? (videoRef.current?.currentTime ?? 0) * 1000;
        if (item.kind === 'audio') {
            if (soundBlocked(item)) return;
            const kind = item.sound?.kind ?? uploadKind(item.durationMs);
            const sound = newSound({ path: item.path, name: item.name, durationMs: item.durationMs, ...(item.source === 'library' ? { library: item.id.replace(/^lib-/, '') } : {}) },
                kind, { srcMs: at, atMs: timelineTime(kept, at, true) ?? 0 });
            setSounds([...sounds, sound]);
            pickLayer(sound.id);
            return;
        }
        const layer = layerFromBin(item, at);
        if (!layer || !layersEditable) return;
        setLayers([...layers, layer]);
        pickLayer(layer.id);
    }, [media?.items, layers, layersEditable, setLayers, pickLayer, sounds, setSounds, kept]);
    // The sound tracks muted in the preview (the timeline's A2 and A3 speakers).
    const [mutedTracks, setMutedTracks] = useState<number[]>([]);

    // CC: the caption track over the preview (item E8; the CC button, the CC lane's header, the Captions panel).
    const [ccShown, setCcShown] = useState(false);

    // J, K and L, and copy and paste (item E8, components/studio/editorKeys.tsx). `reverse`: playing backwards.
    const [reverse, setReverse] = useState(0);
    useStudioKeys({
        container: containerRef, video: videoRef, enabled: workspace, clips: kept, layers, sounds, layersEditable,
        selected: selectedLayer, busy: !!selectedRange || !!timelineSel, setLayers, setSounds, pick: pickLayer, remove: removeLayer,
        setReverse, setSpeed,
    });

    const undo = useCallback(() => {
        if (historyIdx.current > 0) {
            historyIdx.current--;
            onChange(historyRef.current[historyIdx.current]);
            setCanUndo(historyIdx.current > 0);
            setCanRedo(historyIdx.current < historyRef.current.length - 1);
        }
    }, [onChange]);

    const redo = useCallback(() => {
        if (historyIdx.current < historyRef.current.length - 1) {
            historyIdx.current++;
            onChange(historyRef.current[historyIdx.current]);
            setCanUndo(historyIdx.current > 0);
            setCanRedo(historyIdx.current < historyRef.current.length - 1);
        }
    }, [onChange]);

    // Cuts the selected words (Delete, Backspace or the Cut selected button). Returns false when
    // there was nothing left to cut, as when every selected word is cut already.
    const cutSelection = useCallback((): boolean => {
        if (!selectedRange) return false;
        const [start, end] = selectedRange;
        let anyUncut = false;
        for (let i = start; i <= end; i++) {
            if (!isCut(i, words, edit.cuts)) { anyUncut = true; break; }
        }
        if (!anyUncut) return false;
        const startMs = words[start]?.start ?? 0;
        const endMs = words[end]?.end ?? startMs;
        // Never add a cut that matches an existing one.
        if (!edit.cuts.some(c => c.startMs === startMs && c.endMs === endMs)) {
            updateEdit(prev => ({ ...prev, cuts: [...prev.cuts, { startMs, endMs, reason: 'manual' }] }));
        }
        setSelectedRange(null);
        return true;
    }, [selectedRange, words, edit.cuts, updateEdit, setSelectedRange]);

    // Splits (full-page editor): set at the playhead; each one once, in order.
    const addSplit = useCallback((ms: number) => {
        updateEdit(prev => (prev.splits ?? []).includes(ms) ? prev
            : { ...prev, splits: [...(prev.splits ?? []), ms].sort((a, b) => a - b), order: orderAfterSplit(prev.order, prev.splits ?? [], ms) });
    }, [updateEdit]);

    // Keyboard: Delete/Backspace to cut, Ctrl/Cmd+Z for undo/redo, Space to play/pause.
    // When focus is in a text box (INPUT, TEXTAREA, contentEditable), only Delete is
    // handled (it cuts the selected match). Typing, Backspace, Space and Ctrl/Cmd+Z
    // then work normally in the box.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            // Retyping a word: its keys are its own.
            if (target.closest('[data-word-fix]')) return;
            const inTextBox = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            // In a text box, only handle Delete (cut the selected match).
            if (inTextBox) {
                if (e.key === 'Delete' && selectedRange) {
                    e.preventDefault();
                    const [start, end] = selectedRange;
                    const startMs = words[start]?.start ?? 0;
                    const endMs = words[end]?.end ?? startMs;
                    // Never add a cut that matches an existing one.
                    if (!edit.cuts.some(c => c.startMs === startMs && c.endMs === endMs)) {
                        updateEdit(prev => ({
                            ...prev,
                            cuts: [...prev.cuts, { startMs, endMs, reason: 'manual' }],
                        }));
                    }
                    setSelectedRange(null);
                }
                return;
            }
            // Outside a text box, handle all keys.
            // ? opens and closes the Studio editor's shortcut sheet; Esc closes it.
            if (workspace && e.key === '?') {
                e.preventDefault();
                setHelpOpen(o => !o);
                return;
            }
            if (workspace && e.key === 'Escape') {
                setHelpOpen(false);
                setTimelineSel(null);
                return;
            }
            if (e.key === ' ') {
                e.preventDefault();
                const video = videoRef.current;
                if (!video || programmeControl?.toggle()) return;
                if (reverse) setReverse(0);
                else if (video.paused) video.play(); else video.pause();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
                return;
            }
            // A layer chosen on the preview, the timeline or the panel: Delete removes it.
            if (workspace && selectedLayer && !selectedRange && !timelineSel && (e.key === 'Delete' || e.key === 'Backspace')) {
                e.preventDefault();
                if (sounds.some(s => s.id === selectedLayer)) setSounds(sounds.filter(s => s.id !== selectedLayer));
                else setLayers(layers.filter(l => l.id !== selectedLayer));
                setSelectedLayer(null);
                containerRef.current?.focus({ preventScroll: true });
                return;
            }
            if (selectedRange && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (cutSelection()) e.preventDefault();
                return;
            }
            // A stretch of time chosen on the timeline: Delete cuts it.
            if (timelineSel?.kind === 'range' && (e.key === 'Delete' || e.key === 'Backspace')) {
                e.preventDefault();
                const { startMs, endMs } = timelineSel;
                updateEdit(prev => ({ ...prev, cuts: [...prev.cuts, { startMs, endMs, reason: 'manual' }] }));
                setTimelineSel(null);
                return;
            }
            // A section selected on the timeline: Delete cuts it whole (unless it is cut already).
            if (timelineSel?.kind === 'section' && (e.key === 'Delete' || e.key === 'Backspace')) {
                e.preventDefault();
                const section = { startMs: timelineSel.startMs, endMs: timelineSel.endMs };
                if (keptBounds(edit.cuts, section)) updateEdit(prev => ({ ...prev, cuts: cutSection(prev.cuts, section) }));
                return;
            }
            // Arrows step a frame (with Shift, a second) in the Studio editor, except on a divider,
            // whose arrows resize.
            if (workspace && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.metaKey && !e.altKey
                && !target.closest('[role="separator"]')) {
                const video = videoRef.current;
                if (!video) return;
                e.preventDefault();
                const step = (e.shiftKey ? 1 : 1 / 30) * (e.key === 'ArrowLeft' ? -1 : 1);
                video.pause();
                video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + step));
                return;
            }
            // S splits at the playhead in the full-page editor.
            if (workspace && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 's') {
                const video = videoRef.current;
                if (!video) return;
                e.preventDefault();
                addSplit(Math.round(video.currentTime * 1000));
            }
        };
        el.addEventListener('keydown', handler);
        return () => el.removeEventListener('keydown', handler);
    }, [selectedRange, words, edit.cuts, updateEdit, undo, redo, cutSelection, addSplit, workspace, timelineSel, layers, selectedLayer, setLayers, sounds, setSounds,
        reverse, programmeControl]);

    // Video time mapping: skip cut ranges during playback, in play order (lib/sequence.ts playStep: with moved
    // sections, spec 020 item E9, the next stretch can be anywhere in the recording). `playIdx`: the stretch playing.
    const playIdx = useRef(-1);
    // Also track the word being spoken for the amber underline.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTimeUpdate = () => {
            const t = video.currentTime * 1000;
            if (playMode === 'edited' && !previewRef.current) {
                const step = playStep(ranges, t, playIdx.current);
                playIdx.current = step.index;
                if (step.seekTo !== null) video.currentTime = step.seekTo / 1000;
            }
            // Find the word being spoken — the last word whose [start, end) contains t.
            let cw = -1;
            for (let i = 0; i < words.length; i++) {
                if (t >= words[i].start && t < words[i].end) { cw = i; break; }
            }
            if (cw !== currentWord) setCurrentWord(cw);
        };
        video.addEventListener('timeupdate', onTimeUpdate);
        return () => video.removeEventListener('timeupdate', onTimeUpdate);
    }, [ranges, words, currentWord, playMode]);

    // RAF loop for more precise cut-skipping.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const tick = () => {
            if (!video.paused) {
                const t = video.currentTime * 1000;
                // Hear it: stop at the end of the preview window.
                if (previewRef.current && t >= previewRef.current.endMs) {
                    video.pause();
                    previewRef.current = null;
                }
                if (playMode === 'edited' && !previewRef.current) {
                    const step = playStep(ranges, t, playIdx.current);
                    playIdx.current = step.index;
                    if (step.seekTo !== null) video.currentTime = step.seekTo / 1000;
                }
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [ranges, playMode]);

    // A pause by any means ends a Hear it preview, so the next play skips cuts again.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onPause = () => { previewRef.current = null; };
        video.addEventListener('pause', onPause);
        return () => video.removeEventListener('pause', onPause);
    }, []);

    // Auto-scroll the spoken word into view while playing, unless the user
    // scrolled the box by hand (pause auto-scroll for 4 seconds).
    // Never use scrollIntoView — scroll only the transcript box.
    useEffect(() => {
        if (currentWord < 0) return;
        if (Date.now() < autoScrollPauseRef.current) return;
        const el = wordRefs.current[currentWord];
        const box = transcriptRef.current;
        if (el && box) scrollBoxTo(box, el);
    }, [currentWord]);

    // Detect manual scroll on the transcript box via wheel and touchmove
    // (not 'scroll' — the helper's own scrolling must not pause it).
    useEffect(() => {
        const box = transcriptRef.current;
        if (!box) return;
        const onPause = () => { autoScrollPauseRef.current = Date.now() + 4000; };
        box.addEventListener('wheel', onPause, { passive: true });
        box.addEventListener('touchmove', onPause, { passive: true });
        return () => {
            box.removeEventListener('wheel', onPause);
            box.removeEventListener('touchmove', onPause);
        };
    }, []);

    // Seek to a word's time.
    const seekTo = useCallback((index: number) => {
        if (videoRef.current && words[index]) {
            videoRef.current.currentTime = words[index].start / 1000;
        }
    }, [words]);

    // Seek to a time in seconds, pausing first for the review flow.
    const seekToTime = useCallback((seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.currentTime = seconds;
    }, []);
    const seekToMs = useCallback((ms: number) => seekToTime(ms / 1000), [seekToTime]);

    // Word click: seek. Shift-click: extend selection. Double-click a cut word: bring it back.
    // A cut word is never selected — single click on a cut word seeks and clears selection.
    const onWordClick = (index: number, e: React.MouseEvent) => {
        const cut = isCut(index, words, edit.cuts);
        if (cut) {
            seekTo(index);
            setSelectedRange(null);
            return;
        }
        setTimelineSel(null);
        if (e.shiftKey && selectedRange) {
            const [start] = selectedRange;
            setSelectedRange([Math.min(start, index), Math.max(start, index)]);
        } else {
            setSelectedRange([index, index]);
            seekTo(index);
        }
    };

    // Double-click a cut word to bring it back, or a kept one to retype it (spec 019 item 2.3).
    const onWordDoubleClick = (index: number) => {
        const cut = findCut(index, words, edit.cuts);
        if (cut) { onCutClick(cut); return; }
        if (!canFix || !words[index].ref) return;
        const [from, to] = fixGroup(words, index);
        setSelectedRange(null);
        setFixing({ from, to, text: words.slice(from, to + 1).map(w => w.text).join(' ') });
    };
    const saveFix = async (op: FixOp | null) => {
        if (!op || !onFixWords) return;
        if (await onFixWords([op])) setFixing(null);
    };

    // Word drag start. A shift-click leaves the selection for the click to extend.
    const onWordMouseDown = (index: number, e: React.MouseEvent) => {
        if (e.shiftKey || isCut(index, words, edit.cuts)) return;
        setTimelineSel(null);
        setDragStart(index);
        setSelectedRange([index, index]);
    };

    // Word drag enter: extend selection.
    const onWordMouseEnter = (index: number) => {
        if (dragStart !== null) {
            setSelectedRange([Math.min(dragStart, index), Math.max(dragStart, index)]);
        }
    };

    // Drag end.
    useEffect(() => {
        const endDrag = () => setDragStart(null);
        document.addEventListener('mouseup', endDrag);
        return () => document.removeEventListener('mouseup', endDrag);
    }, []);

    // Click a cut to restore it.
    const onCutClick = useCallback((cut: Cut) => {
        updateEdit(prev => ({
            ...prev,
            cuts: prev.cuts.filter(c => !(c.startMs === cut.startMs && c.endMs === cut.endMs)),
        }));
    }, [updateEdit]);

    // Suggest filler words, repeats and long pauses; marking again replaces the earlier ones.
    const onSuggest = () => {
        updateEdit(prev => ({ ...prev, cuts: replaceSuggestions(prev.cuts, suggestCuts(words, { silences }), SUGGESTED_REASONS) }));
        setReviewIdx(0);
        setReviewKind(null);
    };

    // Hesitations: short silences inside a sentence where an "um" may have been. Guesses, so they
    // have their own button and their own group to review or clear.
    const onHesitations = () => {
        updateEdit(prev => ({ ...prev, cuts: replaceSuggestions(prev.cuts, suggestCuts(words, { gaps: true }), HESITATION_REASONS) }));
        setReviewIdx(0);
        setReviewKind('gap');
    };

    // Clears the suggestions of one kind (the group chosen in the counts).
    const onClearKind = (reason: string) => {
        updateEdit(prev => ({ ...prev, cuts: prev.cuts.filter(c => c.reason !== reason) }));
        setReviewIdx(0);
        setReviewKind(null);
    };

    // Clear suggestions (remove all non-manual cuts).
    const onClearSuggestions = () => {
        updateEdit(prev => ({ ...prev, cuts: prev.cuts.filter(c => c.reason === 'manual') }));
        setReviewIdx(0);
        setReviewKind(null);
    };

    // Search: typing highlights matching words, Enter jumps to the next match.
    const onSearchChange = (q: string) => {
        setSearchQuery(q);
        if (!q.trim()) {
            setSearchMatches([]);
            return;
        }
        const lower = q.toLowerCase();
        const matches: number[] = [];
        for (let i = 0; i < words.length; i++) {
            if (words[i].text.toLowerCase().includes(lower)) matches.push(i);
        }
        setSearchMatches(matches);
        setSearchCursor(-1); // -1 means "not yet navigated"; first Enter goes to match 0.
    };

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchMatches.length > 0) {
            e.preventDefault();
            const next = searchCursor < 0 ? 0 : (searchCursor + 1) % searchMatches.length;
            setSearchCursor(next);
            const idx = searchMatches[next];
            setSelectedRange([idx, idx]);
            seekTo(idx);
        }
    };

    // Clear search: empties the box and its matches, and keeps focus in the box for a new search.
    const clearSearch = () => {
        onSearchChange('');
        setSearchCursor(-1);
        searchRef.current?.focus();
    };

    // Search matches as a Set for O(1) lookup per word.
    const matchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

    // Count cuts by reason.
    const reasonCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const c of edit.cuts) counts[c.reason] = (counts[c.reason] || 0) + 1;
        return counts;
    }, [edit.cuts]);
    // What each kind saves on its own, beside its count.
    const reasonSaved = useMemo(() => savedByReason(edit.cuts) as Record<string, number>, [edit.cuts]);
    // Transcripts made with `disfluencies` on have their "um"s as words, so there is nothing to
    // guess from silences: Mark hesitations is only offered for older ones, and only before their
    // audio's silences are measured (then the missed speech is marked with the fillers instead).
    const fillersTranscribed = useMemo(() => hasFillers(words), [words]);

    // Suggested cuts (reason not 'manual'), sorted by start time.
    const suggestedCuts = useMemo(() =>
        edit.cuts.filter(c => c.reason !== 'manual').sort((a, b) => a.startMs - b.startMs),
    [edit.cuts]);

    // Filtered suggestions for the review row.
    const reviewCuts = useMemo(() =>
        reviewKind ? suggestedCuts.filter(c => c.reason === reviewKind) : suggestedCuts,
    [suggestedCuts, reviewKind]);

    // Review navigation: Previous/Next/Keep.
    const reviewCount = reviewCuts.length;

    // Clamp reviewIdx to the last valid item (after undo, redo, or a cut).
    const clampedReviewIdx = reviewCount > 0 ? Math.min(reviewIdx, reviewCount - 1) : 0;

    const reviewPrev = () => {
        if (reviewCount === 0) return;
        const idx = (clampedReviewIdx - 1 + reviewCount) % reviewCount;
        setReviewIdx(idx);
        const cut = reviewCuts[idx];
        seekToTime(Math.max(0, cut.startMs / 1000 - 1));
    };

    const reviewNext = () => {
        if (reviewCount === 0) return;
        const idx = (clampedReviewIdx + 1) % reviewCount;
        setReviewIdx(idx);
        const cut = reviewCuts[idx];
        seekToTime(Math.max(0, cut.startMs / 1000 - 1));
    };

    const reviewKeep = () => {
        if (reviewCount === 0) return;
        const cut = reviewCuts[clampedReviewIdx];
        onCutClick(cut);
        // Move to the next suggestion after removing this one.
        if (reviewCount > 1) setReviewIdx(Math.min(clampedReviewIdx, reviewCount - 2));
        else setReviewIdx(0);
    };

    // Scroll the reviewed cut's word or chip into view (box-only, never the page).
    useEffect(() => {
        if (reviewCount === 0) return;
        const cut = reviewCuts[clampedReviewIdx];
        if (!cut) return;
        // Find the word index at the cut start, or the chip just before it.
        let wordIdx = -1;
        for (let i = 0; i < words.length; i++) {
            if (words[i].start >= cut.startMs) { wordIdx = i; break; }
        }
        const box = transcriptRef.current;
        if (!box) return;
        if (wordIdx >= 0 && wordRefs.current[wordIdx]) {
            scrollBoxTo(box, wordRefs.current[wordIdx]!);
        }
    }, [clampedReviewIdx, reviewCuts, reviewCount, words]);

    // Check if a pause between words is long enough to show as a chip.
    const pauseThreshold = 800; // ms

    // The cut highlighted by the review row.
    const reviewCut = reviewCount > 0 ? reviewCuts[clampedReviewIdx] : null;

    // Hear it: play from 2 s before the reviewed mark to 2 s after it, the mark included,
    // so the producer hears it in context before choosing Keep this or Next.
    const hear = useCallback((startMs: number, endMs: number) => {
        const video = videoRef.current;
        if (!video) return;
        previewRef.current = { endMs };
        video.currentTime = Math.max(0, startMs) / 1000;
        void video.play();
    }, []);
    const hearCut = () => {
        if (reviewCut) hear(reviewCut.startMs - 2000, reviewCut.endMs + 2000);
    };

    // The reason button label for 'manual'.
    const reasonLabel = (reason: string): string =>
        reason === 'filler' ? 'Fillers' : reason === 'repeat' ? 'Repeats' : reason === 'pause' ? 'Pauses' : reason === 'manual' ? 'Your cuts' : reason === 'retake' ? 'Retakes' : reason === 'gap' ? 'Hesitations' : reason;

    const helpLine = 'Click a word, or drag across words, to select · Delete or Backspace cuts them · Double-click a cut word to bring it back, or a kept word to retype it · Space plays and pauses · Ctrl or ⌘ + Z undoes, Shift + Ctrl or ⌘ + Z (or Ctrl + Y) redoes';

    // The suggestion tools: mark, clear, cut the selection, and the page's own (Claude's tighter edit).
    const suggestTools = (
        <>
            <button onClick={onSuggest} className={primary}
                title={silences?.length ? 'Long pauses are measured from the audio' : 'Long pauses are the gaps between words (this recording\'s silences are not measured yet)'}>
                Mark filler words and long pauses
            </button>
            {!fillersTranscribed && !silences?.length && (
                <button onClick={onHesitations} className={secondary}
                    title="Short silences inside a sentence, where an um or uh may have been. The transcript leaves those words out, so these are guesses: check them with Hear it.">
                    Mark hesitations
                </button>
            )}
            <button onClick={onClearSuggestions} className={secondary}>
                Clear suggestions
            </button>
            {/* Cuts the selected words: the Delete key's job, as a button for phones and tablets. Always
                there, so selecting a word does not move the transcript (a double-click would miss it). */}
            <button onClick={cutSelection} disabled={!selectedRange} className={secondary}
                title={selectedRange ? undefined : 'Select words first'}>✂ Cut selected</button>
            {/* Extra tools from the page, such as Claude's tighter edit. */}
            {tools}
        </>
    );

    const history = (
        <>
            <button onClick={undo} className={secondary} disabled={!canUndo} title="Ctrl or ⌘ + Z">
                Undo
            </button>
            <button onClick={redo} className={secondary} disabled={!canRedo} title="Ctrl or ⌘ + Y">
                Redo
            </button>
        </>
    );

    const helpButton = (
        <button type="button" onClick={() => setHelpOpen(o => !o)} aria-expanded={helpOpen}
            aria-label={workspace ? 'Shortcuts' : 'Editing help'} title={workspace ? 'Shortcuts (?)' : undefined}
            className={helpOpen
                ? "text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 bg-amber-500/10"
                : `${secondary} px-2 py-0.5`}>
            {workspace ? '? Shortcuts' : '?'}
        </button>
    );

    const lengthLabel = (
        <span className={hint}>
            Edited length {mmss(editedMs)} · saves {mmss(timeSavedMs)}{prog && prog.pieces.length > 1 && ` · whole video ${mmss(prog.programme.lengthMs)}`}
        </span>
    );

    // Reason counts as buttons that filter the review, and Clear these for the chosen kind.
    const reasonButtons = (
        <>
            {/* Reason counts as buttons that filter the review. */}
            {Object.entries(reasonCounts).map(([reason, count]) => {
                const label = reasonLabel(reason);
                const isChosen = reviewKind === reason;
                return (
                    <button
                        key={reason}
                        onClick={() => { setReviewKind(isChosen ? null : reason); setReviewIdx(0); }}
                        className={isChosen
                            ? "text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 bg-amber-500/10"
                            : `${secondary} px-2 py-0.5`}
                    >
                        {label} {count}{reasonSaved[reason] ? ` · ${mmss(reasonSaved[reason])}` : ''}
                    </button>
                );
            })}
            {reviewKind && reviewKind !== 'manual' && reasonCounts[reviewKind] > 0 && (
                <button onClick={() => onClearKind(reviewKind)} className={`${secondary} px-2 py-0.5`}>
                    Clear these
                </button>
            )}
        </>
    );

    // Search box with a clear button that shows once there is text.
    const search = (
        <>
            <div className={`${workspace ? 'grow min-w-0' : 'ml-auto'} flex items-center gap-1`}>
                <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => onSearchChange(e.target.value)}
                    onKeyDown={onSearchKeyDown}
                    placeholder="Search transcript…"
                    className={`${workspace ? 'w-full min-w-0' : 'w-64'} px-3 py-1.5 text-sm rounded bg-white/5 text-gray-200 placeholder-gray-500 outline-none focus:ring-1 ring-amber-400/50`}
                />
                {searchQuery && (
                    <button type="button" onClick={clearSearch} aria-label="Clear search" title="Clear search" className={`${secondary} px-2 py-0.5`}>
                        ×
                    </button>
                )}
            </div>
            {searchMatches.length > 0 && (
                <span className={hint}>
                    {searchCursor < 0 ? `${searchMatches.length} matches` : `${searchCursor + 1}/${searchMatches.length}`}
                </span>
            )}
            {canFix && (
                <button type="button" onClick={() => setReplaceOpen(o => !o)} aria-expanded={replaceOpen}
                    className={`${secondary} px-2 py-0.5`} title="Correct a misheard name everywhere">
                    Replace
                </button>
            )}
        </>
    );

    // Find and replace a misheard name (spec 019 item 2.3), under the search box when opened.
    const replaceRow = canFix && replaceOpen && (
        <div data-word-fix className="flex flex-wrap items-center gap-2">
            <FindReplace words={words} onReplace={ops => onFixWords!(ops)} busy={fixBusy} />
            <span className={hint}>Saved with speaker review&apos;s corrections; render again to put it in the captions.</span>
        </div>
    );
    const oldTranscript = !!onFixWords && !canFix && words.length > 0 && (
        <p className={hint}>To correct words here, accept the transcript again in speaker review (it was accepted before word corrections).</p>
    );

    // Review suggestions row
    const reviewRow = reviewCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
            <button onClick={reviewPrev} className={secondary}>‹ Previous</button>
            <span className={hint}>{clampedReviewIdx + 1} of {reviewCount}</span>
            <button onClick={reviewNext} className={secondary}>Next ›</button>
            <button onClick={reviewKeep} className={secondary}>Keep this</button>
            <button onClick={hearCut} className={secondary} data-start-ms={reviewCut?.startMs} data-end-ms={reviewCut?.endMs}>Hear it</button>
            {reviewCut && cutNotes[`${reviewCut.startMs}-${reviewCut.endMs}`] && (
                <span className={hint}>{cutNotes[`${reviewCut.startMs}-${reviewCut.endMs}`]}</span>
            )}
        </div>
    );

    // The video, with the on-screen text and images over it in the full-page editor.
    const video = (
        <div className="relative" style={workspace
            // Scaled to fit the preview, leaving room for the play controls under it.
            ? { containerType: 'inline-size', width: 'min(100cqw, calc((100cqh - 3rem) * 16 / 9))', aspectRatio: '16 / 9', margin: '0 auto' }
            : { containerType: 'inline-size' }}>
            <video
                ref={videoRef}
                src={videoUrl}
                className={`w-full rounded-lg bg-black ${workspace ? 'h-full' : ''}`}
                controls
                onLoadedMetadata={e => { setVideoDuration(e.currentTarget.duration * 1000); e.currentTarget.playbackRate = speed; }}
            />
            {workspace && reverse > 0 && (
                <ReversePlay video={videoRef} rate={reverse} onStop={() => setReverse(0)} clips={kept} ranges={ranges} edited={playMode === 'edited'} />
            )}
            {workspace && <TransitionPreview video={videoRef} src={videoUrl} joins={previewJoins} active={playMode === 'edited'} />}
            {workspace && <CutBridge video={videoRef} src={videoUrl} ranges={ranges} transitionsAt={bridgeSkips} hold={previewRef} active={playMode === 'edited' && reverse === 0} />}
            {workspace && !overlaysHidden && (
                <LayersPreview layers={layers} clips={kept} editedMs={editedMs} video={videoRef} urls={mediaUrls}
                    selected={selectedLayer} onSelect={openLayer}
                    onChange={l => setLayers(layers.map(x => (x.id === l.id ? l : x)))} />
            )}
            {workspace && !overlaysHidden && <OnScreenPreview cues={cues} clips={kept} edit={edit} video={videoRef} studio={studio} />}
            {workspace && ccShown && !(captionLook(edit, { burnCaptions: studio.on, captionStyle: studio.style }) && !overlaysHidden) && (
                <CaptionTrackPreview cues={cues} clips={kept} video={videoRef} />
            )}
            {workspace && sounds.length > 0 && (
                <SoundsPreview sounds={sounds} clips={kept} editedMs={editedMs} video={videoRef} urls={mediaUrls} words={words} mutedTracks={mutedTracks} />
            )}
            {prog && <ProgrammePlayer view={prog} video={videoRef} ranges={ranges} hold={previewRef} active={playMode === 'edited'} />}
        </div>
    );

    // Play switch: Edited skips the cuts, Original plays everything.
    const playControls = (
        <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={hint}>Play:</span>
            {(['edited', 'original'] as const).map(mode => (
                <button
                    key={mode}
                    type="button"
                    aria-pressed={playMode === mode}
                    onClick={() => setPlayMode(mode)}
                    className={playMode === mode
                        ? "text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 bg-amber-500/10"
                        : `${secondary} px-2 py-0.5`}
                >
                    {mode === 'edited' ? 'Edited' : 'Original'}
                </button>
            ))}
            {/* Speed buttons: play at 0.75×, 1×, 1.25×, 1.5× or 2×. */}
            <span className={`${hint} ml-3`}>Speed:</span>
            {SPEEDS.map(rate => (
                <button
                    key={rate}
                    type="button"
                    aria-pressed={speed === rate}
                    aria-label={`Play at ${rate} times speed`}
                    onClick={() => setSpeed(rate)}
                    className={speed === rate
                        ? "text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 bg-amber-500/10"
                        : `${secondary} px-2 py-0.5`}
                >
                    {rate}×
                </button>
            ))}
            {workspace && (
                <button type="button" aria-pressed={ccShown} onClick={() => setCcShown(v => !v)}
                    title="Show the YouTube caption track over the preview (not burned in)"
                    className={`${ccShown ? "text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 bg-amber-500/10" : `${secondary} px-2 py-0.5`} ml-3`}>
                    CC
                </button>
            )}
            {reverse > 0 && <span className="text-xs text-amber-200" aria-live="polite">◀ Backwards {reverse}× (K stops)</span>}
        </div>
    );

    // Transcript
    const transcript = (
        <div ref={transcriptRef} className={`${workspace ? 'flex-1 min-h-0' : 'md:w-1/2 h-[calc(100vh-220px)] min-h-[400px]'} overflow-y-auto rounded-lg bg-[#130b29] p-4`}>
                {paras.map((para, pi) => (
                    <div key={pi} className="mb-4" style={{ contentVisibility: 'auto' }}>
                        <p className="text-sm font-bold text-amber-400 mb-1">
                            {para.speaker}
                            {/* Turn start time, so the producer can find a turn by its time. */}
                            <span className="ml-2 text-xs font-normal text-gray-400">{mmss(para.words[0].word.start)}</span>
                        </p>
                        <p className="text-sm leading-relaxed text-gray-200">
                            {para.words.map(({ word, index }, wi) => {
                                // Retyping: the box stands in for the correction's words.
                                if (fixing && index > fixing.from && index <= fixing.to) return null;
                                if (fixing && index === fixing.from) {
                                    const fixed = putBackOp(words, index);
                                    return (
                                        <span key={wi} data-word-fix className="inline-flex flex-wrap items-center gap-1 align-baseline mx-0.5">
                                            <input aria-label="Corrected words" autoFocus value={fixing.text} maxLength={200} disabled={fixBusy}
                                                size={Math.max(4, Math.min(40, fixing.text.length + 2))}
                                                onChange={e => setFixing({ ...fixing, text: e.target.value })}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') { e.preventDefault(); void saveFix(fixOp(words, fixing.from, fixing.to, fixing.text)); }
                                                    if (e.key === 'Escape') { e.preventDefault(); setFixing(null); containerRef.current?.focus(); }
                                                }}
                                                className="px-1 py-0 text-sm rounded bg-white/10 text-gray-100 outline-none ring-1 ring-sky-400/60" />
                                            <button type="button" disabled={fixBusy || !fixing.text.trim()} className="text-xs text-sky-300 hover:underline"
                                                onClick={() => void saveFix(fixOp(words, fixing.from, fixing.to, fixing.text))}>Save</button>
                                            {fixed && (
                                                <button type="button" disabled={fixBusy} className="text-xs text-gray-400 hover:underline" title={`Heard as "${word.heard}"`}
                                                    onClick={() => void saveFix(fixed)}>Put back &ldquo;{word.heard}&rdquo;</button>
                                            )}
                                            <button type="button" className="text-xs text-gray-400 hover:underline" onClick={() => setFixing(null)}>Cancel</button>
                                        </span>
                                    );
                                }
                                const wordCut = cutsByWord.wordCut[index];
                                const cut = !!wordCut;
                                const isManual = wordCut?.reason === 'manual';
                                const isSelected = selectedRange &&
                                    index >= selectedRange[0] && index <= selectedRange[1];
                                const isCurrent = index === currentWord;
                                const isMatch = matchSet.has(index);
                                const isReview = reviewCut && wordCut &&
                                    wordCut.startMs === reviewCut.startMs &&
                                    wordCut.endMs === reviewCut.endMs;
                                // The silence before this word, also across a change of speaker. It shows
                                // as a chip when it is long, or when a cut sits in it (a filler AssemblyAI
                                // left out of the transcript), so every suggestion can be seen and undone.
                                const prev = index > 0 ? words[index - 1] : null;
                                const prevGap = prev ? word.start - prev.end : 0;
                                const gapCuts = prev ? cutsByWord.gapCuts[index] : [];
                                const gapCut = gapCuts.length > 0;
                                const gapCutIsManual = gapCuts.every(c => c.reason === 'manual');
                                const gapCutIsReview = reviewCut && gapCuts.some(c =>
                                    c.startMs === reviewCut.startMs && c.endMs === reviewCut.endMs);
                                return (
                                    <span key={wi}>
                                        {prev && (prevGap > pauseThreshold || gapCut) && (
                                            <span
                                                ref={el => { chipRefs.current[index] = el; }}
                                                title={gapCut ? (gapCutIsManual ? 'Double-click to bring back' : 'Double-click to keep it') : 'Click to shorten this pause'}
                                                className={`inline-block mx-1 px-1.5 py-0.5 rounded text-xs cursor-pointer ${
                                                    gapCut
                                                        ? gapCutIsManual
                                                            ? 'line-through text-gray-400'
                                                            : 'line-through decoration-amber-400 text-amber-200/70 bg-amber-400/10'
                                                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                } ${gapCutIsReview ? ' ring-2 ring-amber-400' : ''}`}
                                                onDoubleClick={(e) => {
                                                    if (gapCut) {
                                                        e.stopPropagation();
                                                        updateEdit(cur => ({ ...cur, cuts: cur.cuts.filter(c => !gapCuts.includes(c)) }));
                                                    }
                                                }}
                                                onClick={(e) => {
                                                    if (!gapCut) {
                                                        e.stopPropagation();
                                                        updateEdit(cur => ({ ...cur, cuts: [...cur.cuts, {
                                                            startMs: Math.round(prev.end + Math.min(500, prevGap / 2)),
                                                            endMs: word.start,
                                                            reason: 'pause',
                                                        }] }));
                                                    }
                                                }}
                                            >
                                                {gapCut
                                                    // A cut silence between words is a hesitation ('gap', or 'filler' in
                                                    // edits marked before hesitations had their own kind), never a word.
                                                    ? (gapCuts.some(c => c.reason === 'filler' || c.reason === 'gap')
                                                        ? `hesitation ${(gapCuts.reduce((t, c) => t + Math.max(0, Math.min(c.endMs, word.start) - Math.max(c.startMs, prev.end)), 0) / 1000).toFixed(1)}s`
                                                        : `pause ${(prevGap / 1000).toFixed(1)}s → ${((prevGap - (gapCuts[0]?.endMs ?? 0) + (gapCuts[0]?.startMs ?? 0)) / 1000).toFixed(1)}s`)
                                                    : `pause ${(prevGap / 1000).toFixed(1)}s`}
                                            </span>
                                        )}
                                        {(unspokenByWord.get(index) ?? [])
                                            .filter(u => !gapCuts.some(c => c.startMs <= u.startMs + 50 && c.endMs >= u.endMs - 50))
                                            .map(u => (
                                                <span key={u.startMs}
                                                    title={`Sound the transcript has no words for (${((u.endMs - u.startMs) / 1000).toFixed(1)} s): often an um or a false start. Click to cut it; Hear it first if unsure.`}
                                                    className="inline-block mx-0.5 px-1 rounded text-xs cursor-pointer text-gray-400 bg-white/5 hover:bg-white/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateEdit(cur => ({ ...cur, cuts: [...cur.cuts, { startMs: u.startMs, endMs: u.endMs, reason: 'filler' }] }));
                                                    }}
                                                >…</span>
                                            ))}
                                        <span
                                            ref={el => { if (index < words.length) wordRefs.current[index] = el; }}
                                            className={`cursor-pointer select-none ${
                                                cut
                                                    ? isManual
                                                        ? 'line-through text-gray-400'
                                                        : 'line-through decoration-amber-400 text-amber-200/70'
                                                    : isSelected
                                                        ? 'bg-amber-500/30 rounded'
                                                        : 'text-gray-200'
                                            } ${isSelected ? 'ring-1 ring-amber-400/50' : ''} ${
                                                isCurrent && !cut ? 'underline decoration-amber-400 decoration-2 underline-offset-2' : ''
                                            } ${isMatch && !cut ? 'bg-amber-400/10' : ''} ${
                                                isReview ? ' ring-2 ring-amber-400' : ''
                                            } ${word.heard !== undefined ? 'underline decoration-dotted decoration-sky-400 underline-offset-2'
                                                : !cut && !isCurrent && isUnsure(word) ? 'underline decoration-dotted decoration-amber-400 underline-offset-2' : ''}`}
                                            title={cut ? 'Double-click to bring back' : word.heard !== undefined ? `Corrected; heard as "${word.heard}". Double-click to change it`
                                                : isUnsure(word) ? `${unsureTitle(word)}. Double-click to correct it` : undefined}
                                            onClick={(e) => onWordClick(index, e)}
                                            onDoubleClick={() => onWordDoubleClick(index)}
                                            onMouseDown={e => onWordMouseDown(index, e)}
                                            onMouseEnter={() => onWordMouseEnter(index)}
                                        >
                                            {word.text}
                                        </span>
                                        {' '}
                                    </span>
                                );
                            })}
                        </p>
                    </div>
                ))}
        </div>
    );

    // The Studio editor (spec 020 item E1): the same pieces in its layout, with the timeline along the
    // bottom and the On screen panel (Part I) beside the preview.
    if (workspace) {
        return (
            <div ref={containerRef} tabIndex={0} className="outline-none">
                <Workspace
                    header={<>
                        {heading}
                        {lengthLabel}
                        {status}
                        <span className="grow" />
                        {history}
                        {helpButton}
                        {actions}
                    </>}
                    script={<>
                        <div className="flex flex-wrap items-center gap-2">{suggestTools}</div>
                        {Object.keys(reasonCounts).length > 0 && <div className="flex flex-wrap items-center gap-2">{reasonButtons}</div>}
                        <div className="flex items-center gap-2">{search}</div>
                        {replaceRow}
                        {oldTranscript}
                        {reviewRow}
                        {transcript}
                    </>}
                    preview={<>
                        <div className="flex-1 min-h-0" style={{ containerType: 'size' }}>{video}{playControls}</div>
                    </>}
                    panels={[
                        ...(media ? [{
                            id: 'media',
                            label: 'Media',
                            node: (
                                <MediaPanel episodeId={media.episodeId} items={media.items} error={media.error} canEdit={layersEditable}
                                    onItems={media.onItems} onAdd={(item, srcMs) => addFromBin(item.id, srcMs)} />
                            ),
                        }] : []),
                        {
                            id: 'elements',
                            label: 'Elements',
                            node: (
                                <ElementsPanel words={words} layers={layers} brand={brand} video={videoRef} canEdit={layersEditable}
                                    logo={media?.items?.find(i => i.source === 'logo') ?? null}
                                    onAdd={addLayers} onOpen={id => { setSelectedLayer(id); setPanelId('properties'); }} />
                            ),
                        },
                        {
                            id: 'on-screen',
                            label: 'On screen',
                            node: (
                                <OnScreenPanel
                                    layers={layers}
                                    clips={kept}
                                    editedMs={editedMs}
                                    selected={selectedLayer}
                                    canEdit={layersEditable}
                                    onOpen={id => { setSelectedLayer(id); setPanelId('properties'); }}
                                    onRemove={removeLayer}
                                    onSeek={ms => seekToTime(ms / 1000)}
                                />
                            ),
                        },
                        {
                            id: 'captions',
                            label: 'Captions',
                            node: (
                                <CaptionsPanel
                                    cues={cues}
                                    clips={kept}
                                    edit={edit}
                                    studio={studio}
                                    shown={ccShown}
                                    onShown={setCcShown}
                                    onCaptions={captions => updateEdit(prev => ({ ...prev, captions }))}
                                    video={videoRef}
                                    onSeek={seekToMs}
                                />
                            ),
                        },
                        {
                            id: 'properties',
                            label: 'Properties',
                            node: sounds.some(s => s.id === selectedLayer) ? (
                                <SoundProperties
                                    sound={sounds.find(s => s.id === selectedLayer)!}
                                    clips={kept}
                                    editedMs={editedMs}
                                    video={videoRef}
                                    bin={media?.items ?? null}
                                    onChange={snd => setSounds(sounds.map(x => (x.id === snd.id ? snd : x)))}
                                    onRemove={removeLayer}
                                    onSeek={ms => seekToTime(ms / 1000)}
                                />
                            ) : (
                                <PropertiesPanel
                                    layer={layers.find(l => l.id === selectedLayer) ?? null}
                                    clips={kept}
                                    editedMs={editedMs}
                                    video={videoRef}
                                    brand={brand}
                                    canEdit={layersEditable}
                                    onChange={l => setLayers(layers.map(x => (x.id === l.id ? l : x)))}
                                    onRemove={removeLayer}
                                    onSeek={ms => seekToTime(ms / 1000)}
                                />
                            ),
                        },
                        {
                            id: 'parts',
                            label: 'Parts',
                            node: (
                                <PartsPanel edit={edit} totalMs={totalMs} clips={kept} words={words}
                                    videos={media?.items?.filter(i => i.kind === 'video') ?? NO_VIDEOS}
                                    onChange={patch => updateEdit(prev => ({ ...prev, ...patch }))}
                                    onSeek={ms => seekToTime(ms / 1000)} />
                            ),
                        },
                        {
                            id: 'transitions',
                            label: 'Transitions',
                            node: (
                                <TransitionsPanel
                                    joins={edit.joins ?? []}
                                    splits={edit.splits ?? NO_SPLITS}
                                    studio={studioJoins}
                                    warnings={sequence.skipped}
                                    focus={joinFocus}
                                    onJoins={joins => updateEdit(prev => ({ ...prev, joins }))}
                                    onSeek={ms => seekToTime(ms / 1000)}
                                />
                            ),
                        },
                        ...panels,
                    ]}
                    panelId={panelId}
                    onPanel={setPanelId}
                    timeline={
                        <Timeline
                            words={words}
                            cuts={edit.cuts}
                            ranges={kept}
                            layers={layers}
                            clips={kept}
                            editedMs={editedMs}
                            selectedLayer={selectedLayer}
                            onSelectLayer={id => { openLayer(id); if (id) { setTimelineSel(null); setSelectedRange(null); } }}
                            onLayers={layersEditable ? setLayers : undefined}
                            onDropMedia={addFromBin}
                            sounds={sounds}
                            onSounds={setSounds}
                            captions={cues}
                            captionsShown={ccShown}
                            onCaptionsShown={setCcShown}
                            mutedTracks={mutedTracks}
                            onMutedTracks={setMutedTracks}
                            totalMs={totalMs}
                            video={videoRef}
                            onSeek={ms => seekToTime(ms / 1000)}
                            media={timelineMedia}
                            selection={timelineSel}
                            onSelect={sel => { setTimelineSel(sel); if (sel) setSelectedRange(null); }}
                            onCuts={cuts => updateEdit(prev => ({ ...prev, cuts }))}
                            onHear={hear}
                            keys={containerRef}
                            overlaysHidden={overlaysHidden}
                            onOverlaysHidden={setOverlaysHidden}
                            transitions={(edit.splits ?? NO_SPLITS).map(splitMs => {
                                const j = (edit.joins ?? []).find(x => joinKey(x.at) === joinKey({ atSplit: splitMs }));
                                return {
                                    splitMs,
                                    label: j && j.transition !== 'cut' ? `${TRANSITION_LABELS[j.transition]}, ${j.durationMs / 1000} s` : null,
                                    playing: sequence.joins.some(x => x.splitMs === splitMs),
                                };
                            })}
                            overlaps={sequence.joins.flatMap(j => [{ fromMs: j.aFromMs, toMs: j.aEndMs }, { fromMs: j.bStartMs, toMs: j.bUntilMs }])}
                            onJoin={splitMs => { setJoinFocus(splitMs); setPanelId('transitions'); }}
                            programme={prog && (
                                <ProgrammeStrip view={prog} video={videoRef} clips={kept} editedMs={editedMs}
                                    onTeasers={teasers => updateEdit(prev => ({ ...prev, teasers }))} onParts={() => setPanelId('parts')} />
                            )}
                            split={{
                                splits: edit.splits ?? NO_SPLITS,
                                onSplit: addSplit,
                                // A split's transition goes with it.
                                onRemoveSplit: ms => updateEdit(prev => ({
                                    ...prev,
                                    splits: (prev.splits ?? []).filter(s => s !== ms),
                                    order: orderAfterUnsplit(prev.order, prev.splits ?? [], ms),
                                    joins: (prev.joins ?? []).filter(j => joinKey(j.at) !== joinKey({ atSplit: ms })),
                                })),
                                onCutSection: section => updateEdit(prev => ({ ...prev, cuts: cutSection(prev.cuts, section) })),
                                onRestoreSection: section => updateEdit(prev => ({ ...prev, cuts: restoreSection(prev.cuts, section) })),
                            }}
                        />
                    }
                />
                {helpOpen && <ShortcutSheet onClose={() => { setHelpOpen(false); containerRef.current?.focus(); }} />}
            </div>
        );
    }

    // The quick edit, in step 3 of the pipeline.
    return (
        <div ref={containerRef} tabIndex={0} className="flex flex-col gap-4 outline-none">
            {/* Help line: how to edit, and the keys on Undo and Redo. */}
            <p className={hint}>Click a word, or drag across words, to select · Delete or Backspace cuts them · Double-click a cut word to bring it back, or a kept word to retype it · Space plays and pauses · Ctrl or ⌘ + Z undoes, Ctrl or ⌘ + Y redoes</p>
            {/* What only the Studio editor shows (spec 020): it stays as it is, and word cuts still work here. */}
            {studioOnlySummary(edit) && (
                <p className={`${hint} text-amber-200/80`}>
                    Also in this edit, from the Studio editor: {studioOnlySummary(edit)}. They stay as they are; open the Studio editor to change them.
                </p>
            )}
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                {suggestTools}
                {history}
                {helpButton}
                {lengthLabel}
                {reasonButtons}
                {search}
            </div>
            {replaceRow}
            {oldTranscript}

            {/* Help panel: the editing help and the hint line, opened by the "?" button. */}
            {helpOpen && (
                <div className={`${hint} rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 flex flex-col gap-1`}>
                    <p>{helpLine}</p>
                    <p>Amber = suggested · Grey = your cuts · Enter in search: next match</p>
                </div>
            )}

            {reviewRow}

            <div className="flex flex-col gap-4 md:flex-row">
                {/* Video preview */}
                <div className="md:w-1/2 md:sticky md:top-4 self-start">
                    {video}
                    {/* Cuts map: every cut on one strip under the video; click a mark to jump there. */}
                    {totalMs > 0 && (
                        <div aria-label="Cuts map" className="relative mt-2 h-3 w-full rounded bg-white/5">
                            {edit.cuts.map((c, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    title={`Cut at ${mmss(c.startMs)}`}
                                    data-start-ms={c.startMs}
                                    data-end-ms={c.endMs}
                                    onClick={() => seekToTime(Math.max(0, c.startMs / 1000 - 1))}
                                    className={`absolute top-0 h-full rounded-sm ${c.reason === 'manual' ? 'bg-gray-400' : 'bg-amber-400'}`}
                                    style={{ left: `${(c.startMs / totalMs) * 100}%`, width: `max(2px, ${((c.endMs - c.startMs) / totalMs) * 100}%)` }}
                                />
                            ))}
                        </div>
                    )}
                    {playControls}
                </div>

                {transcript}
            </div>
        </div>
    );
}
