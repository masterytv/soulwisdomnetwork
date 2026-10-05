// The video's current time in milliseconds, followed from the video element itself. Only the
// component that calls it redraws as the video plays, not the whole editor and its transcript.

"use client";

import { useEffect, useState } from 'react';

export function useVideoTime(video: React.RefObject<HTMLVideoElement | null>): number {
    const [ms, setMs] = useState(0);
    useEffect(() => {
        const el = video.current;
        if (!el) return;
        const update = () => setMs(el.currentTime * 1000);
        update();
        el.addEventListener('timeupdate', update);
        el.addEventListener('seeked', update);
        return () => { el.removeEventListener('timeupdate', update); el.removeEventListener('seeked', update); };
    }, [video]);
    return ms;
}
