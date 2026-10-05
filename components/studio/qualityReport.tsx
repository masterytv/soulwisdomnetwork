// The quality report on a finished episode (docs/specs/019-editor-light-v2.md, item 0.2):
// loudness, true peak and length in one line, then anything worth checking before it goes to
// YouTube. Shown under the Editor Light render and the final cut.

import { mmss } from '@/lib/showNotes';
import type { RenderQc } from '@/types/episode';

export function QualityReport({ qc }: { qc?: RenderQc | null }) {
    if (!qc) return null;
    const numbers = [
        qc.integratedLufs !== null ? `${qc.integratedLufs.toFixed(1)} LUFS` : null,
        qc.truePeakDb !== null ? `peak ${qc.truePeakDb.toFixed(1)} dBTP` : null,
        qc.durationSeconds !== null ? mmss(qc.durationSeconds * 1000) : null,
    ].filter(Boolean).join(' · ');
    return (
        <div className="mt-2 text-xs" aria-label="Quality check">
            <p className={qc.warnings.length ? 'text-amber-200' : 'text-gray-400'}>
                Quality check{numbers ? `: ${numbers}` : ''}{qc.warnings.length ? ` · ${qc.warnings.length} to look at` : ' · nothing to look at'}
            </p>
            {qc.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-amber-300">
                    {qc.warnings.map(w => <li key={w}>{w}</li>)}
                </ul>
            )}
        </div>
    );
}
