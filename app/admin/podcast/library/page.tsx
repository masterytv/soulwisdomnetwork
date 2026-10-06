"use client";

// The show library (docs/specs/020-studio-editor.md item E7): music beds, effects and stingers for every
// episode, each with the licence record the team keeps by hand (decision U2). An admin adds a file with
// where it came from, its licence and a snapshot of the licence page, then marks the licence checked; only
// then can it be placed in the Studio editor or rendered. Changing the licence takes the check away. Every
// render and Short that used a file is listed under it. Everyone in the Studio can see the library. The body
// is components/studio/library.tsx.

import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";
import { hint } from "@/components/studio/ui";
import { LibraryView } from "@/components/studio/library";
import { useAuth } from "@/context/AuthContext";

export default function LibraryPage() {
    const { profile, loading } = useAuth();
    const allowed = profile?.role === "admin" || profile?.role === "producer";
    const isAdmin = profile?.role === "admin";

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
    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#130b29] text-gray-100 p-4 sm:p-8">
                <div className="max-w-3xl mx-auto flex flex-col gap-6">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-amber-400">Music and effects</h1>
                            <p className={`${hint} mt-1 max-w-xl`}>
                                The show library: music beds, effects and stingers for every episode, from free and royalty-free sites
                                (Pixabay, Mixkit, Incompetech, Freesound CC0, Sonniss, Zapsplat). Each keeps its licence record. A file can be placed in the
                                Studio editor only once an admin has checked its licence. Non-commercial (NC) and no-derivatives (ND) licences, and YouTube
                                Audio Library tracks, are refused.
                                {!isAdmin && " Only an admin can add or check files."}
                            </p>
                        </div>
                        <Link href="/admin/podcast" className="text-sm text-gray-400 hover:text-white">← Studio</Link>
                    </div>
                    <LibraryView isAdmin={isAdmin} />
                </div>
            </div>
        </AuthGuard>
    );
}
