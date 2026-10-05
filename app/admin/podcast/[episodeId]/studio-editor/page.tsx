// Why: the Studio editor (spec 020): Editor Light on a page of its own, laid out like Descript, with
// the script, preview, panels and timeline (item E1). The old /edit address redirects here.

"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AuthGuard from '@/components/auth/AuthGuard';
import { ErrorNote } from '@/components/studio/ErrorNote';
import { EditorLightStage } from '@/components/studio/editorLight';
import { minutes } from '@/components/studio/format';
import { useAuth } from '@/context/AuthContext';
import { studioFetch } from '@/lib/studioClient';
import type { EpisodeNotesView } from '@/types/studio';

export default function StudioEditorPage() {
    const { episodeId } = useParams<{ episodeId: string }>();
    const { profile, loading } = useAuth();
    const allowed = profile?.role === 'admin' || profile?.role === 'producer';

    const [view, setView] = useState<EpisodeNotesView | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!loading && allowed) {
            studioFetch<EpisodeNotesView>(`/api/studio/episodes/${episodeId}/notes`)
                .then(setView)
                .catch(e => setError((e as Error).message));
        }
    }, [loading, allowed, episodeId]);

    if (loading) return <div className="p-8 text-center text-white">Loading...</div>;

    if (!allowed) {
        return (
            <div className="min-h-screen bg-[#130b29] flex items-center justify-center p-4">
                <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-8 max-w-md text-center">
                    <h1 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h1>
                    <p className="text-gray-300">The Podcast Studio is for admins and producers.</p>
                </div>
            </div>
        );
    }

    // The bar's left end: back to the episode, its title and length.
    const heading = (
        <>
            <Link href={`/admin/podcast/${episodeId}/notes`} className="text-sm text-amber-300 hover:underline">← Episode</Link>
            <h1 className="text-base font-bold text-amber-400 truncate max-w-[24rem]" title={view?.title}>{view?.title ?? 'Studio editor'}</h1>
            {view?.durationSeconds !== null && view?.durationSeconds !== undefined && (
                <span className="text-sm text-gray-400">{minutes(view.durationSeconds)}</span>
            )}
        </>
    );

    const ready = view && view.transcriptAccepted && view.videoUrl;

    return (
        <AuthGuard>
            {/* Desktop only (spec 020, U3): under 1280 px a note points to the quick edit. */}
            <p className="xl:hidden px-4 py-2 text-sm text-amber-200 bg-amber-500/10 border-b border-amber-400/30">
                The Studio editor is made for windows 1280 px and wider. On a smaller screen, use the quick edit
                in the episode&apos;s Edit step (<Link href={`/admin/podcast/${episodeId}/notes`} className="underline">open the episode</Link>).
            </p>
            {ready
                ? <EditorLightStage episodeId={episodeId} words={view.words} videoUrl={view.videoUrl!} workspace heading={heading} />
                : (
                    <div className="min-h-screen bg-[#0d0720] text-gray-100 p-4 sm:p-6">
                        <div className="border-b border-white/10 pb-3 mb-4 flex items-center gap-3 flex-wrap">{heading}</div>
                        <ErrorNote message={error} />
                        {!view && !error && <p className="text-gray-400">Loading…</p>}
                        {view && !view.transcriptAccepted && (
                            <p className="text-sm text-gray-300">
                                The editor works from the accepted transcript.{' '}
                                <Link href={`/admin/podcast/${episodeId}`} className="text-amber-300 hover:underline">Review and accept the speakers first.</Link>
                            </p>
                        )}
                        {view && view.transcriptAccepted && !view.videoUrl && <p className="text-sm text-gray-300">The video is not ready yet.</p>}
                    </div>
                )}
        </AuthGuard>
    );
}
