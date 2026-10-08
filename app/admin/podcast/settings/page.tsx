"use client";

// Studio settings (lib/studioSettings.ts): the show or channel, its speakers, the kind of
// recording and how Claude writes for it, the brand look, the intro and teasers, who makes the
// final cut, and where recordings come from. Everyone in the Studio can see them; an admin saves.
// Part I: captions burned into the render (their look) and the languages captions are translated into.

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/auth/AuthGuard";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { field, hint, primary } from "@/components/studio/ui";
import { UploadAsset } from "@/components/studio/upload";
import { LookFields } from "@/components/studio/onScreen";
import { LANGUAGES, LANGUAGES_MAX } from "@/lib/translate";
import type { CaptionStyle } from "@/lib/onScreen";
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_SETTINGS, FORMAT_LABELS, FORMATS, KEYTERM_WORDS_MAX, type StudioSettings } from "@/lib/studioSettings";
import { JOIN_LENGTHS, SECTION_JOIN_LABELS, SECTION_JOINS, TRANSITION_LABELS, TRANSITIONS, type TransitionKind } from "@/lib/transitions";
import { studioFetch } from "@/lib/studioClient";
import { VOICE_CLEANUPS, VOICE_SHORT, type VoiceCleanup } from "@/lib/voice";
import { PODCAST_CATEGORIES, PODCAST_SUBCATEGORIES, subcategoryOf } from "@/lib/podcastFeed";
import type { SettingsView } from "@/lib/server/studioSettings";

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
    return (
        <section className="bg-[#1E1035]/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
            <header>
                <h2 className="font-semibold text-gray-100">{title}</h2>
                {intro && <p className={`${hint} mt-1`}>{intro}</p>}
            </header>
            {children}
        </section>
    );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-200">{label}</span>
            {children}
            {help && <span className={hint}>{help}</span>}
        </label>
    );
}

// What each voice clean-up does, beside its choice (spec 019 item 3.2).
const VOICE_HELP: Record<VoiceCleanup, string> = {
    standard: "What the render always did: a gentle noise reduction and compressor. The quickest.",
    deepfilter: "A noise-removal model, run on the render's own computer: no account and no cost.",
    auphonic: "Sent to Auphonic, which removes noise and evens out the voices. Only on its free plan, which is used up after about two episodes a month; a render that would go over is refused.",
};

function Choice({ name, value, current, label, help, onPick, disabled }: {
    name: string; value: string; current: string; label: string; help?: string; onPick: () => void; disabled: boolean;
}) {
    return (
        <label className="flex items-start gap-2 text-sm text-gray-200">
            <input type="radio" name={name} value={value} checked={current === value} onChange={onPick} disabled={disabled} className="mt-1" />
            <span>{label}{help && <span className={`block ${hint}`}>{help}</span>}</span>
        </label>
    );
}

export default function StudioSettingsPage() {
    const { profile, loading } = useAuth();
    const allowed = profile?.role === "admin" || profile?.role === "producer";
    const isAdmin = profile?.role === "admin";
    const [s, setS] = useState<StudioSettings | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [introUrl, setIntroUrl] = useState<string | null>(null);
    // The podcast feed's artwork: the saved one's link, or the file just uploaded (shown before Save), and its size.
    const [artUrl, setArtUrl] = useState<string | null>(null);
    const [artLocal, setArtLocal] = useState<string | null>(null);
    const [artSize, setArtSize] = useState<{ w: number; h: number } | null>(null);
    const [hostsText, setHostsText] = useState("");
    const [namesText, setNamesText] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (loading || !allowed) return;
        studioFetch<SettingsView>("/api/studio/settings")
            .then(v => { setS(v.settings); setLogoUrl(v.logoUrl); setIntroUrl(v.introUrl); setArtUrl(v.artUrl); setHostsText(v.settings.hosts.join("\n")); setNamesText(v.settings.recurringNames.join("\n")); })
            .catch(e => setError((e as Error).message));
    }, [loading, allowed]);

    const set = <K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) => {
        setS(prev => (prev ? { ...prev, [key]: value } : prev));
        setNotice("");
        setDirty(true);
    };

    // While there are unsaved changes, ask before leaving the page.
    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    async function save() {
        if (!s) return;
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const hosts = hostsText.split(/\n|,/).map(h => h.trim()).filter(Boolean);
            const recurringNames = namesText.split(/\n|,/).map(h => h.trim()).filter(Boolean);
            const saved = await studioFetch<{ settings: StudioSettings }>("/api/studio/settings", {
                method: "PUT",
                body: JSON.stringify({ settings: { ...s, hosts, recurringNames } }),
            });
            setS(saved.settings);
            setHostsText(saved.settings.hosts.join("\n"));
            setNamesText(saved.settings.recurringNames.join("\n"));
            const v = await studioFetch<SettingsView>("/api/studio/settings");
            setLogoUrl(v.logoUrl);
            setIntroUrl(v.introUrl);
            setArtUrl(v.artUrl);
            setArtLocal(null);
            setNotice("Saved. New jobs use these settings from now on.");
            setDirty(false);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    }

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

    const off = !isAdmin || saving;
    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#130b29] text-gray-100 p-4 sm:p-8">
                <div className="max-w-3xl mx-auto flex flex-col gap-6">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-amber-400">Studio settings</h1>
                            <p className={`${hint} mt-1`}>
                                Everything here was fixed to one podcast before. Each choice starts at what the Studio always did; change what fits your show or channel.
                                {!isAdmin && " Only an admin can save changes."}
                            </p>
                        </div>
                        <Link href="/admin/podcast" className="text-sm text-gray-400 hover:text-white">← Studio</Link>
                    </div>
                    <ErrorNote message={error} />
                    {!s ? <p className={hint}>Loading…</p> : (
                        <>
                            <Section title="Show or channel" intro="Used in Claude's writing, the YouTube description and the emails.">
                                <Field label="Name"><input className={field} value={s.showName} onChange={e => set("showName", e.target.value)} disabled={off} maxLength={80} /></Field>
                                <Field label="What it is about" help='Finishes the sentence "The show …", e.g. "explores how small teams build products".'>
                                    <input className={field} value={s.about} onChange={e => set("about", e.target.value)} disabled={off} maxLength={300} />
                                </Field>
                                <Field label="Who it is for" help='Finishes "… for …", e.g. "founders and product leads". Leave empty to skip.'>
                                    <input className={field} value={s.audience} onChange={e => set("audience", e.target.value)} disabled={off} maxLength={200} />
                                </Field>
                                <Field label="Website" help="Named in every YouTube description. Leave empty for no website line.">
                                    <input className={field} value={s.siteUrl} onChange={e => set("siteUrl", e.target.value)} disabled={off} placeholder="https://" />
                                </Field>
                                <Field label="Words before the website link">
                                    <input className={field} value={s.siteLinkText} onChange={e => set("siteLinkText", e.target.value)} disabled={off} maxLength={120} />
                                </Field>
                                <Field label="Subscribe line" help="Added after the chapters. Leave empty for none.">
                                    <input className={field} value={s.subscribeLine} onChange={e => set("subscribeLine", e.target.value)} disabled={off} maxLength={200} />
                                </Field>
                                <Field label="This Studio's web address" help="Used for the links in emails, e.g. https://yoursite.com.">
                                    <input className={field} value={s.studioUrl} onChange={e => set("studioUrl", e.target.value)} disabled={off} placeholder="https://" />
                                </Field>
                                <Field label="Zoom room for recording" help="The meeting link the hosts record in. It shows on the Studio and the recording checklist, with a copy button, for admins and producers only. Leave empty for none.">
                                    <input className={field} value={s.meetingUrl} onChange={e => set("meetingUrl", e.target.value)} disabled={off} placeholder="https://us02web.zoom.us/j/…" />
                                </Field>
                            </Section>

                            <Section title="Speakers" intro="Names that are always offered when the transcript is made, and on the speaker review page. One per line. Others are named during speaker review.">
                                <textarea className={`${field} min-h-24`} value={hostsText} onChange={e => { setHostsText(e.target.value); setNotice(""); setDirty(true); }} disabled={off} aria-label="Speaker names" />
                                <Field label="Names and terms to spell right"
                                    help={`Guests, places and terms the transcriber often gets wrong, one per line (up to ${KEYTERM_WORDS_MAX} words each). They are sent with the show's name and the speakers when a recording is transcribed (about $0.05 more an hour). Add only words it misspells: a long list of common words can make it hear them where they were not said.`}>
                                    <textarea className={`${field} min-h-24`} value={namesText} onChange={e => { setNamesText(e.target.value); setNotice(""); setDirty(true); }} disabled={off}
                                        aria-label="Names and terms to spell right" placeholder={"Raymond Moody\nnear-death experience"} />
                                </Field>
                            </Section>

                            <Section title="Kind of recording and writing" intro="Shapes how Claude writes the show notes, chapters, YouTube description, Shorts and thumbnail text.">
                                <div className="flex flex-col gap-2">
                                    {FORMATS.map(f => <Choice key={f} name="format" value={f} current={s.format} label={FORMAT_LABELS[f]} onPick={() => set("format", f)} disabled={off} />)}
                                </div>
                                <Field label="Number of YouTube descriptions to choose from" help="Claude writes this many, each from a different angle; you pick one on the show notes page.">
                                    <select value={s.descriptionChoices} onChange={e => set("descriptionChoices", Number(e.target.value))} disabled={off} className={field}>
                                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </Field>
                                <Field label="Extra instructions for all writing" help='Anything Claude should always do, e.g. "List action items with their owners" or "Keep descriptions under 150 words".'>
                                    <textarea className={`${field} min-h-28`} value={s.extraInstructions} onChange={e => set("extraInstructions", e.target.value)} disabled={off} maxLength={3000} />
                                </Field>
                            </Section>

                            <Section title="Look" intro="Colours and logo for Shorts and thumbnails, and the style of AI images.">
                                <div className="flex flex-wrap gap-6">
                                    {([["background", "Background (top)"], ["backgroundBottom", "Background (bottom)"], ["accent", "Accent (highlighted words, lines)"]] as const).map(([k, label]) => (
                                        <label key={k} className="flex items-center gap-2 text-sm text-gray-200">
                                            <input type="color" value={s.colors[k]} onChange={e => set("colors", { ...s.colors, [k]: e.target.value })} disabled={off} aria-label={label} />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                                <div className="flex flex-wrap items-center gap-4">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={logoUrl ?? "/logo.png"} alt="Logo" className="w-16 h-16 object-contain rounded bg-black/30" />
                                    <div className="flex flex-col gap-1">
                                        {isAdmin && <UploadAsset kind="logo" label="Upload a logo (square PNG)" accept="image/png,image/jpeg" onUploaded={p => { set("logoPath", p); setLogoUrl(null); setNotice("Logo uploaded. Press Save to use it."); }} />}
                                        {s.logoPath && isAdmin && <button className="text-xs text-gray-400 hover:text-white self-start" onClick={() => { set("logoPath", null); setLogoUrl(null); }}>Use the site&apos;s logo instead</button>}
                                    </div>
                                </div>
                                <Field label="AI image style" help="Describes the look of AI b-roll and thumbnail images. Leave empty for the built-in Soul Wisdom styles.">
                                    <textarea className={`${field} min-h-24`} value={s.imageStyle} onChange={e => set("imageStyle", e.target.value)} disabled={off} maxLength={1500}
                                        placeholder="e.g. Clean, bright, modern office photography, soft daylight, blue and white palette." />
                                </Field>
                            </Section>

                            {/* Part I: captions burned into the Editor Light render, and the languages they are translated into. */}
                            <Section title="Captions" intro="Captions burned into the picture help the many people who watch with the sound off. Each video can change this in the full-page editor's On screen panel.">
                                <label className="flex items-center gap-2 text-sm text-gray-200">
                                    <input type="checkbox" checked={s.burnCaptions} onChange={e => set("burnCaptions", e.target.checked)} disabled={off} />
                                    Burn captions into the Editor Light render
                                </label>
                                <fieldset disabled={off} className="flex flex-col gap-1">
                                    <span className="text-sm text-gray-200">How they look</span>
                                    <LookFields look={s.captionStyle} onChange={c => set("captionStyle", { ...s.captionStyle, ...c } as CaptionStyle)} />
                                    <span className={hint}>Font, size, colour, background and position. The full-page editor shows them over the video as it plays.</span>
                                </fieldset>
                                <fieldset disabled={off} className="flex flex-col gap-1">
                                    <span className="text-sm text-gray-200">Languages to translate the captions into</span>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-sm text-gray-200">
                                        {LANGUAGES.map(l => (
                                            <label key={l.code} className="flex items-center gap-2">
                                                <input type="checkbox" checked={s.captionLanguages.includes(l.code)}
                                                    onChange={() => set("captionLanguages", s.captionLanguages.includes(l.code)
                                                        ? s.captionLanguages.filter(c => c !== l.code)
                                                        : s.captionLanguages.length < LANGUAGES_MAX ? [...s.captionLanguages, l.code] : s.captionLanguages)} />
                                                {l.name}
                                            </label>
                                        ))}
                                    </div>
                                    <span className={hint}>Ticked first on each episode&apos;s show notes page, where Claude translates the final cut&apos;s captions, title and description (about $0.40 a language). Each goes to YouTube as its own caption track.</span>
                                </fieldset>
                            </Section>

                            <Section title="Finished video" intro="What plays around the episode, and who makes the final cut.">
                                <div className="flex flex-col gap-2">
                                    <Choice name="intro" value="show" current={s.intro} label="The show's intro at the start and end" disabled={off} onPick={() => set("intro", "show")} />
                                    <Choice name="intro" value="custom" current={s.intro} label="My own intro at the start and end" disabled={off} onPick={() => set("intro", "custom")} />
                                    <Choice name="intro" value="none" current={s.intro} label="No intro" disabled={off} onPick={() => set("intro", "none")} />
                                </div>
                                {s.intro === "custom" && (
                                    <div className="flex flex-col gap-2 pl-6">
                                        {introUrl && <video src={introUrl} controls className="w-64 rounded" />}
                                        {s.introPath && !introUrl && <p className={hint}>Intro uploaded. Press Save to use it.</p>}
                                        {isAdmin && <UploadAsset kind="intro" label={s.introPath ? "Replace my intro (MP4)" : "Upload my intro (MP4)"} accept="video/mp4,video/quicktime" onUploaded={p => { set("introPath", p); setIntroUrl(null); }} />}
                                    </div>
                                )}
                                <label className="flex items-start gap-2 text-sm text-gray-200">
                                    <input type="checkbox" checked={s.teasers} onChange={e => set("teasers", e.target.checked)} disabled={off} className="mt-1" />
                                    <span>&ldquo;In this episode&rdquo; teaser clips before the intro<span className={`block ${hint}`}>Taken from the teaser clips in the approved show notes.</span></span>
                                </label>
                                {/* Spec 020 item E4: transitions around the episode, for every episode's render. */}
                                <fieldset disabled={off} className="flex flex-col gap-1">
                                    <span className="text-sm text-gray-200">Transitions</span>
                                    <div className="grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-1 items-center text-sm text-gray-200 w-fit">
                                        {SECTION_JOINS.map(k => (
                                            <Fragment key={k}>
                                                <span>{SECTION_JOIN_LABELS[k]}</span>
                                                <select aria-label={`${SECTION_JOIN_LABELS[k]}: transition`} className={`${field} !w-auto !py-1 !px-2 text-xs`} value={s.joins[k].transition}
                                                    onChange={e => set("joins", { ...s.joins, [k]: { ...s.joins[k], transition: e.target.value as TransitionKind } })}>
                                                    {TRANSITIONS.map(t => <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>)}
                                                </select>
                                                <select aria-label={`${SECTION_JOIN_LABELS[k]}: length`} className={`${field} !w-auto !py-1 !px-2 text-xs`} value={s.joins[k].durationMs}
                                                    disabled={off || s.joins[k].transition === "cut"}
                                                    onChange={e => set("joins", { ...s.joins, [k]: { ...s.joins[k], durationMs: Number(e.target.value) } })}>
                                                    {JOIN_LENGTHS.map(ms => <option key={ms} value={ms}>{ms / 1000} s</option>)}
                                                </select>
                                            </Fragment>
                                        ))}
                                    </div>
                                    <span className={hint}>
                                        For every episode&apos;s Editor Light render; each episode can choose its own in the Studio editor&apos;s Transitions
                                        panel. A transition overlaps what it joins, so the video gets shorter by its length. At the start and end, any
                                        choice is a fade from or to black (white for Fade through white).
                                    </span>
                                </fieldset>
                                <fieldset className="flex flex-col gap-2">
                                    <legend className="text-sm font-medium text-gray-200 mb-1">Voice clean-up in the render</legend>
                                    {VOICE_CLEANUPS.map(v => (
                                        <Choice key={v} name="voice" value={v} current={s.voiceCleanup} label={v === "standard" ? `${VOICE_SHORT[v]} (the default)` : VOICE_SHORT[v]} disabled={off} onPick={() => set("voiceCleanup", v)}
                                            help={VOICE_HELP[v]} />
                                    ))}
                                    <span className={hint}>For every episode&apos;s Editor Light render; each episode can choose its own in the Studio editor&apos;s Render panel.</span>
                                </fieldset>
                                <div className="flex flex-col gap-2">
                                    <Choice name="final" value="editorLight" current={s.finalSource} label="The Studio editor makes the final cut" disabled={off} onPick={() => set("finalSource", "editorLight")}
                                        help="Step 3 on the show notes page builds the edit package for the Studio editor, to finish there, or exports it straight away. The export is the final cut that Thumbnails, Shorts and the YouTube upload use. Descript is hidden." />
                                    <Choice name="final" value="descript" current={s.finalSource} label="Descript makes the final cut (to compare)" disabled={off} onPick={() => set("finalSource", "descript")}
                                        help="The earlier way, kept while the Studio editor is compared with Descript: the edit package goes to Descript, the edit happens there and the final cut is published from there." />
                                </div>
                            </Section>

                            <Section title="Podcast feed" intro="Finished episodes as an audio podcast on this site, for Apple Podcasts, Spotify and other apps (spec 019 item 5.1). Each episode goes in from its show notes page.">
                                <label className="flex items-start gap-2 text-sm text-gray-200">
                                    <input type="checkbox" checked={s.podcastFeed} onChange={e => set("podcastFeed", e.target.checked)} disabled={off} className="mt-1" />
                                    <span>The feed is on<span className={`block ${hint}`}>Its address, to give Apple Podcasts and Spotify once there is an episode in it: <code className="text-gray-300">{(s.siteUrl || s.studioUrl).replace(/\/$/, "")}/podcast/feed.xml</code> (staging has its own, for trying it)</span></span>
                                </label>
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm text-gray-200">Artwork</span>
                                    <span className={hint}>Square, 1400 to 3000 pixels, JPEG or PNG, as Apple asks. {s.podcastArtPath ? "" : "None yet: the site's logo is used, which is too small for Apple."}</span>
                                    {s.podcastArtPath && (artLocal ?? artUrl) && (
                                        <div className="flex items-end gap-3">
                                            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived Storage link or a local file, shown as it is */}
                                            <img src={artLocal ?? artUrl ?? undefined} alt="The podcast artwork" className="w-40 h-40 object-cover rounded border border-white/10"
                                                onLoad={e => setArtSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
                                            {artSize && (
                                                <span className={artSize.w !== artSize.h || artSize.w < 1400 || artSize.w > 3000 ? "text-xs text-amber-300" : hint}>
                                                    {artSize.w} × {artSize.h} pixels{artSize.w !== artSize.h ? ": not square" : artSize.w < 1400 ? ": too small for Apple" : artSize.w > 3000 ? ": larger than Apple takes" : ""}
                                                    {artLocal ? <><br />Uploaded. Press Save to use it.</> : null}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {isAdmin && <UploadAsset kind="logo" label={s.podcastArtPath ? "Replace the artwork" : "Upload the artwork"} accept="image/png,image/jpeg" onUploaded={(p, file) => { set("podcastArtPath", p); setArtSize(null); setArtLocal(URL.createObjectURL(file)); setNotice("Artwork uploaded. Press Save to use it."); }} />}
                                </div>
                                <label className="flex flex-col gap-1 text-sm text-gray-200">
                                    Category
                                    <select className={`${field} !w-auto`} value={s.podcastCategory} disabled={off} onChange={e => set("podcastCategory", e.target.value as StudioSettings["podcastCategory"])}>
                                        {PODCAST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </label>
                                {PODCAST_SUBCATEGORIES[s.podcastCategory].length > 0 && (
                                    <label className="flex flex-col gap-1 text-sm text-gray-200">
                                        Subcategory
                                        <select className={`${field} !w-auto`} value={subcategoryOf(s.podcastCategory, s.podcastSubcategory)} disabled={off} onChange={e => set("podcastSubcategory", e.target.value)}>
                                            <option value="">None</option>
                                            {PODCAST_SUBCATEGORIES[s.podcastCategory].map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </label>
                                )}
                                <label className="flex items-center gap-2 text-sm text-gray-200">
                                    <input type="checkbox" checked={s.podcastExplicit} onChange={e => set("podcastExplicit", e.target.checked)} disabled={off} /> Explicit content
                                </label>
                                <label className="flex flex-col gap-1 text-sm text-gray-200">
                                    Owner email (optional)
                                    <input type="email" className={field} value={s.podcastEmail} disabled={off} onChange={e => set("podcastEmail", e.target.value)} placeholder="Apple may email it to confirm the show is yours" />
                                </label>
                            </Section>

                            <Section title="Behind the scenes" intro="Leave these as they are unless you run your own copy of the Studio.">
                                <label className="flex items-start gap-2 text-sm text-gray-200">
                                    <input type="checkbox" checked={s.useDrive} onChange={e => set("useDrive", e.target.checked)} disabled={off} className="mt-1" />
                                    <span>Recordings also come in through Google Drive<span className={`block ${hint}`}>Turn off to work only with recordings uploaded on the Studio page.</span></span>
                                </label>
                            </Section>

                            {isAdmin && (
                                <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 flex flex-wrap items-center gap-3 border-t border-white/10 bg-[#130b29]/95 backdrop-blur px-4 py-3 sm:rounded-xl">
                                    <button onClick={() => void save()} disabled={saving} className={primary}>{saving ? "Saving…" : "Save settings"}</button>
                                    <button onClick={() => { setS({ ...DEFAULT_SETTINGS }); setHostsText(DEFAULT_SETTINGS.hosts.join("\n")); setNamesText(DEFAULT_SETTINGS.recurringNames.join("\n")); setNotice("Back to the original settings. Press Save to keep them."); setDirty(true); }}
                                        className="text-xs text-gray-400 hover:text-white">Reset to the original settings</button>
                                    {notice
                                        ? <span className="text-sm text-green-300">{notice}</span>
                                        : dirty && <span className="text-sm text-amber-300">Unsaved changes</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
