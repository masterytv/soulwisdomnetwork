"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { NEWSLETTER_PRIVACY_URL, NEWSLETTER_SIGNUP_URL, signupBody, signupMessage } from "@/lib/newsletter";

// The weekly email sign-up (lib/newsletter.ts). `home`: the dark home page; `videos`: the Videos pages' theme.
const STYLES = {
    home: {
        box: "rounded-2xl border border-white/10 bg-white/5 p-5",
        title: "text-white",
        text: "text-gray-300",
        small: "text-gray-400",
        input: "bg-black/30 border-white/15 text-white placeholder:text-gray-500 focus:border-amber-400",
        button: "bg-amber-500 hover:bg-amber-400 text-black",
        icon: "text-amber-400",
    },
    videos: {
        box: "rounded-2xl border border-ocean-200 dark:border-ocean-800 bg-white dark:bg-ocean-900 p-5",
        title: "text-ocean-900 dark:text-ocean-50",
        text: "text-ocean-700 dark:text-ocean-200",
        small: "text-ocean-500 dark:text-ocean-400",
        input: "bg-sand-50 dark:bg-ocean-950 border-ocean-200 dark:border-ocean-700 text-ocean-900 dark:text-ocean-50 focus:border-gold-500",
        button: "bg-ocean-800 hover:bg-ocean-700 text-white dark:bg-gold-500 dark:hover:bg-gold-400 dark:text-ocean-950",
        icon: "text-gold-500",
    },
} as const;

export default function NewsletterSignup({ tone }: { tone: keyof typeof STYLES }) {
    const s = STYLES[tone];
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        const body = signupBody(email);
        if (!body) {
            setMessage(signupMessage(400));
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch(NEWSLETTER_SIGNUP_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const m = signupMessage(res.status);
            setMessage(m);
            if (m.ok) setEmail("");
        } catch {
            setMessage(signupMessage(0));
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className={s.box} aria-label="Weekly email sign-up">
            <h2 className={`flex items-center gap-2 text-lg font-bold ${s.title}`}>
                <Mail className={`w-5 h-5 ${s.icon}`} aria-hidden /> Soul Wisdom Video of the Week
            </h2>
            <p className={`mt-1 text-sm ${s.text}`}>
                One email a week: the week&apos;s most-watched Soul Wisdom video and our newest podcast episode.
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <label className="sr-only" htmlFor={`newsletter-email-${tone}`}>Email address</label>
                <input
                    id={`newsletter-email-${tone}`}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={`flex-1 min-w-0 rounded-full border px-4 py-2 text-sm outline-none ${s.input}`}
                />
                <button type="submit" disabled={busy} className={`rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60 ${s.button}`}>
                    {busy ? "Signing up…" : "Sign up"}
                </button>
            </div>
            <p className={`mt-2 text-xs ${s.small}`} role="status" aria-live="polite">
                {message ? (
                    <span className={message.ok ? "" : "text-red-400"}>{message.text}</span>
                ) : (
                    <>
                        Unsubscribe anytime.{" "}
                        <a href={NEWSLETTER_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline">Privacy</a>
                    </>
                )}
            </p>
        </form>
    );
}
