"use client";

// The recording checklist: the Zoom settings, equipment and habits for the best recording, for two hosts.
// Ticks are kept in each person's browser. The list is lib/recordingChecklist.ts, the body
// components/studio/recordingChecklist.tsx.

import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";
import { hint } from "@/components/studio/ui";
import { MeetingLink } from "@/components/studio/meetingLink";
import { RecordingChecklist } from "@/components/studio/recordingChecklist";
import { useAuth } from "@/context/AuthContext";

export default function RecordingChecklistPage() {
    const { profile, loading } = useAuth();
    const allowed = profile?.role === "admin" || profile?.role === "producer";

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
                            <h1 className="text-3xl font-bold text-amber-400">Recording checklist</h1>
                            <p className={`${hint} mt-1 max-w-xl`}>
                                For two hosts recording on Zoom. Do the one-time sections once, then the rest before every recording.
                                The separate audio file for each person matters most: the Studio cleans and levels each voice on its own,
                                and the speaker names come out right. Ticks are saved in this browser, so each of you keeps your own.
                            </p>
                        </div>
                        <Link href="/admin/podcast" className="text-sm text-gray-400 hover:text-white">← Studio</Link>
                    </div>
                    <MeetingLink />
                    <RecordingChecklist />
                </div>
            </div>
        </AuthGuard>
    );
}
