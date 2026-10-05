"use client";

// Why: the Studio editor's Transitions panel (spec 020 item E4). The transition at each place where
// sections meet: the start and end of the video, between the teasers, the intro, the episode and the
// outro (the Studio settings choose them for every episode; an episode can choose its own), and at
// each split inside the episode. Dissolve and Fade come first; the rest are ffmpeg's xfade kinds.

import { tickText } from '@/lib/timeline';
import {
    JOIN_LENGTHS, JOIN_MS, SECTION_JOIN_LABELS, SECTION_JOINS, TRANSITION_LABELS, TRANSITIONS, joinKey, setJoin,
    type Join, type JoinAt, type SectionJoins, type Transition, type TransitionKind,
} from '@/lib/transitions';
import { field, hint, secondary } from '@/components/studio/ui';

const seconds = (ms: number) => `${ms / 1000} s`;
const small = `${field} !w-auto !py-1 !px-2 text-xs`;

function Choice({ label, value, inherited, onChange, warning, onJump, highlight }: {
    label: React.ReactNode;
    value: Transition | null;          // this episode's own choice; null when it follows the default
    inherited: Transition | null;      // the Studio's choice, for section joins
    onChange: (t: Transition | null) => void;
    warning?: string;
    onJump?: () => void;
    highlight?: boolean;
}) {
    const shown = value ?? inherited ?? { transition: 'cut' as const, durationMs: JOIN_MS.default };
    return (
        <li className={`flex flex-col gap-1 rounded-lg px-2 py-1.5 ${highlight ? 'bg-amber-500/10 ring-1 ring-amber-400/50' : ''}`}>
            <div className="flex items-center gap-2 flex-wrap">
                {onJump
                    ? <button type="button" onClick={onJump} className="text-xs text-amber-300 hover:underline font-mono" title="Jump there">{label}</button>
                    : <span className="text-xs text-gray-300 grow">{label}</span>}
                {onJump && <span className="grow" />}
                <select aria-label="Transition" className={small}
                    value={value ? value.transition : inherited ? '' : 'cut'}
                    onChange={e => {
                        const v = e.target.value;
                        if (v === '') onChange(null);
                        else onChange({ transition: v as TransitionKind, durationMs: shown.durationMs });
                    }}>
                    {inherited && <option value="">Studio setting: {TRANSITION_LABELS[inherited.transition]}{inherited.transition !== 'cut' ? `, ${seconds(inherited.durationMs)}` : ''}</option>}
                    {TRANSITIONS.map(t => <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>)}
                </select>
                {shown.transition !== 'cut' && (
                    <select aria-label="Length" className={small} value={shown.durationMs} disabled={!value}
                        title={value ? 'How long the transition lasts' : 'The Studio setting\'s length'}
                        onChange={e => onChange({ transition: shown.transition, durationMs: Number(e.target.value) })}>
                        {[...new Set([...JOIN_LENGTHS, shown.durationMs])].sort((a, b) => a - b).map(ms => <option key={ms} value={ms}>{seconds(ms)}</option>)}
                    </select>
                )}
            </div>
            {warning && <p className="text-xs text-amber-300">{warning}</p>}
        </li>
    );
}

export function TransitionsPanel({ joins, splits, studio, warnings = {}, focus, hasTeasers = true, hasIntro = true, onJoins, onSeek }: {
    joins: Join[];
    splits: number[];
    studio: SectionJoins | null;            // the Studio settings' choices; null until they load
    warnings?: Record<string, string>;      // by joinKey: a transition that will play as a cut, and why
    focus?: number | null;                  // a split to show first (chosen on the timeline)
    hasTeasers?: boolean;
    hasIntro?: boolean;
    onJoins: (joins: Join[]) => void;
    onSeek: (ms: number) => void;
}) {
    const own = new Map(joins.map(j => [joinKey(j.at), { transition: j.transition, durationMs: j.durationMs }] as const));
    const set = (at: JoinAt) => (t: Transition | null) => onJoins(setJoin(joins, at, t));
    const sectionJoins = SECTION_JOINS.filter(k =>
        (k !== 'betweenTeasers' && k !== 'afterTeasers') || hasTeasers).filter(k => (k !== 'afterIntro' && k !== 'beforeOutro') || hasIntro);
    return (
        <div className="flex flex-col gap-3">
            <div>
                <h2 className="text-sm font-semibold text-gray-200">Transitions</h2>
                <p className={hint}>
                    A transition overlaps the two sides it joins, so the video gets shorter by its length; chapters,
                    captions and on-screen items move with it. The preview shows the ones at splits; the render
                    shows them all, and can look slightly different.
                </p>
            </div>

            <section aria-label="At splits" className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">At splits</h3>
                {splits.length === 0 ? (
                    <p className={hint}>Split the timeline (S, or the Blade) to put a transition between two sections.</p>
                ) : (
                    <ul className="flex flex-col gap-0.5">
                        {splits.map(s => (
                            <Choice key={s} label={tickText(s, 100)} value={own.get(joinKey({ atSplit: s })) ?? null} inherited={null}
                                onChange={set({ atSplit: s })} onJump={() => onSeek(s)} highlight={focus === s}
                                warning={warnings[joinKey({ atSplit: s })]} />
                        ))}
                    </ul>
                )}
            </section>

            <section aria-label="Sections" className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Start, teasers, intro and end</h3>
                <p className={hint}>The Studio settings choose these for every episode; this episode can choose its own.</p>
                <ul className="flex flex-col gap-0.5">
                    {sectionJoins.map(k => (
                        <Choice key={k} label={SECTION_JOIN_LABELS[k]} value={own.get(k) ?? null} inherited={studio?.[k] ?? null}
                            onChange={set(k)} warning={warnings[k]} />
                    ))}
                </ul>
            </section>
            {joins.length > 0 && (
                <button type="button" onClick={() => onJoins([])} className={`${secondary} self-start`}>
                    Back to straight cuts and the Studio settings
                </button>
            )}
        </div>
    );
}
