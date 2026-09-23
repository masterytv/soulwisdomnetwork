"use client";

// Podcast Studio (docs/specs/006-podcast-studio.md). For now: a setup check of every
// service the Studio relies on. The pipeline dashboard and speaker review build on this.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { studioFetch } from "@/lib/studioClient";

type Check = { ok: boolean; detail: string };
type Health = { checks: Record<string, Check> };

const LABELS: Record<string, string> = {
    firestore: "Database (Firestore)",
    storage: "Video storage (Cloud Storage)",
    drive: "Google Drive folders",
    github: "Processing jobs (GitHub)",
};

export default function PodcastStudioPage() {
    const { profile, loading } = useAuth();
    const [health, setHealth] = useState<Health | null>(null);
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const allowed = profile?.role === "admin" || profile?.role === "producer";

    const runChecks = useCallback(async () => {
        setChecking(true);
        setError("");
        try {
            setHealth(await studioFetch<Health>("/api/studio/health"));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        if (!loading && allowed) runChecks();
    }, [loading, allowed, runChecks]);

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
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                        <h1 className="text-3xl font-bold text-amber-400">Podcast Studio</h1>
                        {profile?.role === "admin" && (
                            <Link href="/admin" className="text-sm text-gray-400 hover:text-white">← Admin</Link>
                        )}
                    </div>

                    <section className="bg-[#1E1035]/50 border border-white/5 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold">Setup check</h2>
                            <button
                                onClick={runChecks}
                                disabled={checking}
                                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
                            >
                                {checking ? "Checking…" : "Check again"}
                            </button>
                        </div>

                        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                        <ul className="divide-y divide-white/5">
                            {Object.entries(LABELS).map(([key, label]) => {
                                const c = health?.checks[key];
                                return (
                                    <li key={key} className="py-3 flex items-start gap-3">
                                        <span className={`mt-0.5 ${!c ? "text-gray-500" : c.ok ? "text-green-400" : "text-red-400"}`}>
                                            {!c ? "…" : c.ok ? "✓" : "✗"}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-medium">{label}</p>
                                            <p className="text-sm text-gray-400 break-words">{c?.detail ?? (checking ? "Checking…" : "")}</p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </div>
            </div>
        </AuthGuard>
    );
}
