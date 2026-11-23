"use client";

// The Social calendar (docs/specs/026-social-publishing.md, stage 5): what goes out where, by day, in Eastern Time.
// Past posts link to the live post; any post opens on the Social page. The body is components/studio/socialCalendar.tsx,
// inside Suspense because it reads the month from the address (useSearchParams).

import { Suspense } from "react";
import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";
import { hint } from "@/components/studio/ui";
import { SocialCalendar } from "@/components/studio/socialCalendar";
import { useAuth } from "@/context/AuthContext";

export default function SocialCalendarPage() {
    const { profile, loading } = useAuth();
    const allowed = profile?.role === "admin" || profile?.role === "producer";

    if (loading) return <div className="p-8 text-center text-white">Loading...</div>;
    if (!allowed) {
        return (
            <div className="min-h-screen bg-studio-page flex items-center justify-center p-4">
                <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-8 max-w-md text-center">
                    <h1 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h1>
                    <p className="text-gray-300">The Podcast Studio is for admins and producers.</p>
                </div>
            </div>
        );
    }
    return (
        <AuthGuard>
            <div className="min-h-screen bg-studio-page text-gray-100 p-4 sm:p-8">
                <div className="max-w-6xl mx-auto flex flex-col gap-6">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-amber-400">Social calendar</h1>
                            <p className={`${hint} mt-1 max-w-2xl`}>
                                What goes out on Instagram and Facebook, by day, in Eastern Time. Past posts link to the live post; any post
                                from the last 14 days or ahead opens on the Social page with its pictures, words and buttons.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link href="/admin/podcast/social" className="text-sm text-gray-400 hover:text-white">← Social</Link>
                        </div>
                    </div>
                    <Suspense fallback={<p className={hint}>Loading the calendar…</p>}>
                        <SocialCalendar />
                    </Suspense>
                </div>
            </div>
        </AuthGuard>
    );
}
