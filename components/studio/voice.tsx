"use client";

// Why: an episode's own voice clean-up for the render (spec 019 item 3.2, lib/voice.ts), in the Render panel.
// Auphonic is only on its free plan (decision D1), so the hours used this month, and what this edit would use,
// are shown beside it; the server refuses a render that would go over, and this says so before Render is pressed.

import { AUPHONIC_FREE_SECONDS, hm, VOICE_CLEANUPS, VOICE_LABELS, VOICE_SHORT, voiceFor, type VoiceCleanup } from "@/lib/voice";
import { hint } from "@/components/studio/ui";
import type { EditRenderView } from "@/lib/server/editRender";

export function VoiceChoice({ voice, view, disabled, onChange }: {
    voice: VoiceCleanup | null | undefined;      // the edit's own choice (null: the Studio's)
    view: Pick<EditRenderView, "voice" | "auphonic">;
    disabled: boolean;
    onChange: (voice: VoiceCleanup | null) => void;
}) {
    const next = voiceFor({ voice }, view.voice.studio);
    const { usedSeconds, needSeconds } = view.auphonic;
    const left = Math.max(0, AUPHONIC_FREE_SECONDS - usedSeconds);
    const tooLong = next === "auphonic" && needSeconds !== null && needSeconds > left;
    return (
        <div className="flex flex-col gap-1">
            <label className="flex flex-wrap items-center gap-2 text-sm text-gray-200">
                Voice clean-up
                <select aria-label="Voice clean-up for this episode" value={voice ?? ""} disabled={disabled}
                    onChange={e => onChange(e.target.value ? e.target.value as VoiceCleanup : null)}
                    className="rounded border border-white/10 bg-[#1a1036] px-2 py-1 text-sm text-gray-200">
                    <option value="">Studio setting ({VOICE_SHORT[view.voice.studio]})</option>
                    {VOICE_CLEANUPS.map(v => <option key={v} value={v}>{VOICE_LABELS[v]}</option>)}
                </select>
            </label>
            {next === "auphonic" && (
                <span className={tooLong ? "text-xs text-red-300" : hint}>
                    Auphonic&apos;s free plan: {hm(left)} left of {hm(AUPHONIC_FREE_SECONDS)} this month
                    {needSeconds !== null && `; this edit sends ${hm(needSeconds)}`}.
                    {tooLong && " Not enough: choose Standard or DeepFilterNet, or wait for next month."}
                </span>
            )}
            {view.voice.rendered && view.voice.rendered !== next && (
                <span className={hint}>The current render used {VOICE_SHORT[view.voice.rendered]}; render again to hear {VOICE_SHORT[next]}.</span>
            )}
        </div>
    );
}
