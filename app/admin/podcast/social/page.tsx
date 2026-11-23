"use client";

// The Social page (docs/specs/026-social-publishing.md): every Short approved at Checkpoint E goes to Soul Wisdom's
// Instagram and Facebook by itself (D-2026-11-23-swc-autopost). Here the producers see what is coming and what went,
// change the words before a post goes, and hold, cancel or post it. The body is components/studio/social.tsx.

import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";
import { hint } from "@/components/studio/ui";
import { SocialView } from "@/components/studio/social";
import { useAuth } from "@/context/AuthContext";

export default function SocialPage() {
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
                <div className="max-w-4xl mx-auto flex flex-col gap-6">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-amber-400">Social</h1>
                            <p className={`${hint} mt-1 max-w-2xl`}>
                                Every Short approved at Checkpoint E and scheduled on YouTube goes to Instagram and Facebook by itself, through
                                Upload-Post: its Reel 3 hours after YouTube publishes it. Times are Eastern. Change the words, hold or cancel a post
                                until a minute before it goes. A Short unscheduled on YouTube has its posts cancelled by the hourly check; Cancel here
                                acts at once.
                            </p>
                        </div>
                        <Link href="/admin/podcast" className="text-sm text-gray-400 hover:text-white">← Studio</Link>
                    </div>
                    <SocialView />
                </div>
            </div>
        </AuthGuard>
    );
}
