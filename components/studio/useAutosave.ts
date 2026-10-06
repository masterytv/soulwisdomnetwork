"use client";

// Saves an edited value shortly after each change, one request at a time, with a version
// number so two people cannot silently overwrite each other (the server answers 409).
// Same approach as the speaker review page; see the comment on `flush`.
// With `localKey` (spec 019 item 2.6), each unsaved change is also kept in this browser
// (lib/localDraft.ts) until the server has it, and hiding or leaving the tab saves at once.

import { useCallback, useEffect, useRef, useState } from "react";
import { localDrafts } from "@/lib/localDraft";

export type SaveState = "saved" | "unsaved" | "saving" | "error";

export function useAutosave<T>(save: (value: T, version: number) => Promise<number>, delayMs = 800, localKey?: string) {
    const [saveState, setSaveState] = useState<SaveState>("saved");
    const [saveError, setSaveError] = useState("");
    const [savedVersion, setSavedVersion] = useState(0);
    const version = useRef(0);
    const lastError = useRef("");   // readable straight after a failed flush, before a re-render
    const pending = useRef<{ value: T } | null>(null);
    const inflight = useRef<Promise<void> | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveRef = useRef(save);
    useEffect(() => { saveRef.current = save; }, [save]);

    // `inflight` is set before the first await and cleared in `finally`, so it can never be
    // left pointing at a finished save (which would silently stop every later save).
    const flush = useCallback(async (): Promise<boolean> => {
        if (timer.current) clearTimeout(timer.current);
        while (inflight.current) await inflight.current;
        if (!pending.current) return true;
        let finished = () => {};
        inflight.current = new Promise<void>(resolve => { finished = resolve; });
        try {
            while (pending.current) {
                const next = pending.current;
                pending.current = null;
                setSaveState("saving");
                try {
                    version.current = await saveRef.current(next.value, version.current);
                    setSavedVersion(version.current);
                    setSaveError("");
                    lastError.current = "";
                } catch (e) {
                    lastError.current = (e as Error).message;
                    pending.current ??= next;
                    setSaveState("error");
                    setSaveError((e as Error).message);
                    return false;
                }
            }
            setSaveState("saved");
            if (localKey) localDrafts.clear(localKey);
            return true;
        } finally {
            inflight.current = null;
            finished();
        }
    }, [localKey]);

    const change = useCallback((value: T) => {
        pending.current = { value };
        if (localKey) localDrafts.write(localKey, { value, version: version.current, at: Date.now() });
        setSaveState("unsaved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { void flush(); }, delayMs);
    }, [flush, delayMs, localKey]);

    // After loading from the server: nothing pending, this is the version to save against.
    const reset = useCallback((serverVersion: number) => {
        if (timer.current) clearTimeout(timer.current);
        pending.current = null;
        version.current = serverVersion;
        setSavedVersion(serverVersion);
        setSaveState("saved");
        setSaveError("");
    }, []);

    // Hiding the tab (switching away, closing it, a phone locking) saves straight away; the local copy
    // covers a save that does not finish.
    useEffect(() => {
        if (!localKey) return;
        const hidden = () => { if (document.visibilityState === "hidden") void flush(); };
        const leaving = () => { void flush(); };
        document.addEventListener("visibilitychange", hidden);
        window.addEventListener("pagehide", leaving);
        return () => {
            document.removeEventListener("visibilitychange", hidden);
            window.removeEventListener("pagehide", leaving);
        };
    }, [localKey, flush]);

    // Warn before leaving with changes that have not reached the server.
    useEffect(() => {
        if (saveState === "saved") return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [saveState]);

    return { saveState, saveError, savedVersion, version, lastError, change, flush, reset };
}
