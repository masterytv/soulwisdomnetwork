import { Headphones } from "lucide-react";
import { LISTEN_LINKS } from "@/lib/site";

// "Listen on" buttons for the podcast apps (lib/site.ts). `home`: the dark home page; `videos`: the Videos pages' theme.
const STYLES = {
    home: "inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 text-sm font-bold text-gray-200 hover:border-amber-400/60 hover:text-amber-300",
    videos: "inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ocean-200 dark:border-ocean-700 text-sm font-bold text-ocean-700 dark:text-ocean-200 hover:border-gold-500",
} as const;

export default function ListenLinks({ tone }: { tone: keyof typeof STYLES }) {
    return (
        <>
            {LISTEN_LINKS.map(link => (
                <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={STYLES[tone]}>
                    <Headphones className={`w-4 h-4 ${tone === "home" ? "text-amber-400" : "text-gold-500"}`} aria-hidden /> {link.label}
                </a>
            ))}
        </>
    );
}
