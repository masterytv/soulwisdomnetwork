// "Soul Wisdom Video of the Week": Soul Wisdom's own newsletter (Tom, 2026-11-19), everything that talks to Resend.
// Runs in GitHub Actions (.github/workflows/newsletter.yml), which holds RESEND_API_KEY, so the website never does.
// The list of record is Firestore's newsletter_subscribers (lib/server/newsletter.ts); Resend's Soul Wisdom segment
// is its sending copy.
//
//   NEWSLETTER_MODE=sync    (after a sign-up, and daily)
//     1. reads every contact in the segment: someone Resend has as unsubscribed is marked unsubscribed here, and a
//        contact Firestore doesn't have yet (the sign-ups made through Project Profound before 2026-11-19) is
//        added, already welcomed;
//     2. puts new and returning sign-ups into the segment, subscribed;
//     3. sends each new sign-up the welcome email, once.
//   NEWSLETTER_MODE=weekly  (Tuesdays, early morning ET)
//     the sync, then the week's email as a Resend broadcast scheduled for 9:00 am ET (lib/newsletterEmail.ts), and
//     an email to Tom (ALERT_EMAIL) with the link to cancel it before then. With the repo variable
//     NEWSLETTER_AUTOSEND=off, a draft for Tom to send by hand. Nothing is made when there is nothing to put in it
//     (Tom gets an alert). One broadcast a day: a second run the same day does nothing.
//
// The repository is public, and so are these logs: they show counts and titles, never an address.

import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { loadAlert } from '../podcast/config';
import { sendEmail } from '../podcast/notify';
import {
    channelFeedUrl, NEWSLETTER_FROM, NEWSLETTER_REPLY_TO, newestEpisode, parseChannelFeed, PODCAST_FEED_URL, sendTime,
    videoOfWeek, weeklyEmail, weeklyHtml, weekName, welcomeHtml,
} from '../../../lib/newsletterEmail';

// The "Soul Wisdom Video of the Week" segment in Resend (created by Tom, 2026-11-19); not a secret.
const SEGMENT_ID = process.env.RESEND_SEGMENT_ID || 'facb9055-252b-4d18-b85a-ca79f2f35bf4';
const PAUSE_MS = 400;                 // Resend allows a few requests a second
const MAX_PER_RUN = 200;              // pushes and welcomes per run; the rest wait for the next run

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const mode = process.env.NEWSLETTER_MODE === 'weekly' ? 'weekly' : 'sync';
const apiKey = required('RESEND_API_KEY');
initializeApp({ credential: cert(JSON.parse(required('PODCAST_SA_JSON'))) });
const db = getFirestore();
const subscribers = db.collection('newsletter_subscribers');
const alert = loadAlert();
const runUrl = process.env.GITHUB_RUN_URL || '';
const pause = () => new Promise(r => setTimeout(r, PAUSE_MS));
const idOf = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

// One Resend API call; the error's text never includes an address (Resend's messages name fields, not values).
async function resend<T>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; error: string }> {
    const res = await fetch(`https://api.resend.com${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: T | null = null;
    try { data = text ? JSON.parse(text) as T : null; } catch { /* not JSON */ }
    const error = res.ok ? '' : ((data as { message?: string } | null)?.message ?? text.slice(0, 200));
    return { ok: res.ok, status: res.status, data, error };
}
const exists = (r: { status: number; error: string }) => r.status === 409 || /already exists/i.test(r.error);

interface ResendContact { id: string; email: string; unsubscribed: boolean }

async function segmentContacts(): Promise<ResendContact[]> {
    const out: ResendContact[] = [];
    let after = '';
    for (;;) {
        const r = await resend<{ data: ResendContact[]; has_more?: boolean }>('GET', `/segments/${SEGMENT_ID}/contacts?limit=100${after ? `&after=${after}` : ''}`);
        if (!r.ok) throw new Error(`Resend: could not list the segment (${r.status} ${r.error})`);
        const page = r.data?.data ?? [];
        out.push(...page);
        if (!r.data?.has_more || !page.length) return out;
        after = page[page.length - 1].id;
    }
}

// Into the segment, subscribed (a returning sign-up is subscribed again).
async function pushContact(email: string) {
    const created = await resend('POST', '/contacts', { email, unsubscribed: false, segments: [{ id: SEGMENT_ID }] });
    if (created.ok) return;
    if (!exists(created)) throw new Error(`contact ${created.status} ${created.error}`);
    const updated = await resend('PATCH', `/contacts/${encodeURIComponent(email)}`, { unsubscribed: false });
    if (!updated.ok) throw new Error(`contact update ${updated.status} ${updated.error}`);
    const added = await resend('POST', `/contacts/${encodeURIComponent(email)}/segments/${SEGMENT_ID}`);
    if (!added.ok && !exists(added)) throw new Error(`segment ${added.status} ${added.error}`);
}

async function sync() {
    const counts = { imported: 0, unsubscribed: 0, pushed: 0, welcomed: 0, failed: 0 };

    // 1. What Resend knows: unsubscribes, and contacts Firestore doesn't have yet.
    for (const c of await segmentContacts()) {
        const ref = subscribers.doc(idOf(c.email));
        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (!doc.exists) {
                tx.set(ref, {
                    email: c.email.trim(), status: c.unsubscribed ? 'unsubscribed' : 'subscribed', source: 'resend-import',
                    createdAt: FieldValue.serverTimestamp(), subscribedAt: FieldValue.serverTimestamp(),
                    unsubscribedAt: c.unsubscribed ? FieldValue.serverTimestamp() : null,
                    // They signed up through Project Profound, which already welcomed them.
                    welcomedAt: FieldValue.serverTimestamp(), resendSynced: true,
                });
                counts.imported++;
            } else if (c.unsubscribed && doc.get('status') === 'subscribed' && doc.get('resendSynced') === true) {
                // A sign-up not yet pushed (resendSynced false) is newer than this unsubscribe, and wins.
                tx.update(ref, { status: 'unsubscribed', unsubscribedAt: FieldValue.serverTimestamp() });
                counts.unsubscribed++;
            }
        });
    }

    // 2. New and returning sign-ups into Resend.
    const toPush = await subscribers.where('status', '==', 'subscribed').where('resendSynced', '==', false).limit(MAX_PER_RUN).get();
    for (const doc of toPush.docs) {
        try {
            await pushContact(doc.get('email') as string);
            await doc.ref.update({ resendSynced: true });
            counts.pushed++;
        } catch (e) {
            counts.failed++;
            console.error(`⚠️ One sign-up could not be put into Resend: ${e instanceof Error ? e.message : e}`);
        }
        await pause();
    }

    // 3. Welcome, once, everyone now in Resend who hasn't had it.
    const toWelcome = await subscribers.where('status', '==', 'subscribed').where('resendSynced', '==', true)
        .where('welcomedAt', '==', null).limit(MAX_PER_RUN).get();
    for (const doc of toWelcome.docs) {
        await welcome(doc.ref, doc.get('email') as string).then(ok => (ok ? counts.welcomed++ : counts.failed++));
        await pause();
    }

    console.log(`📬 Sync: ${counts.imported} imported from Resend, ${counts.unsubscribed} unsubscribed, ${counts.pushed} put into Resend, ${counts.welcomed} welcomed, ${counts.failed} failed`);
    return counts;
}

async function welcome(ref: DocumentReference, email: string): Promise<boolean> {
    const r = await resend('POST', '/emails', {
        from: NEWSLETTER_FROM, to: [email], reply_to: NEWSLETTER_REPLY_TO,
        subject: 'Welcome to Soul Wisdom Video of the Week', html: welcomeHtml(),
    });
    if (!r.ok) {
        console.error(`⚠️ A welcome email failed: ${r.status} ${r.error}`);
        return false;
    }
    await ref.update({ welcomedAt: FieldValue.serverTimestamp() });
    return true;
}

async function fetchText(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { headers: { 'user-agent': 'SoulWisdom-Newsletter/1.0' }, signal: AbortSignal.timeout(20_000) });
        return res.ok ? await res.text() : null;
    } catch {
        return null;
    }
}

const eastern = (d: Date) =>
    d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

async function weekly() {
    await sync();
    const now = new Date();
    const name = weekName(now);

    const list = await resend<{ data: { id: string; name: string; status: string }[] }>('GET', '/broadcasts');
    if (!list.ok) throw new Error(`Resend: could not list broadcasts (${list.status} ${list.error})`);
    const already = list.data?.data.find(b => b.name === name);
    if (already) {
        console.log(`⏭️  Today's email already exists (${already.status}): https://resend.com/broadcasts/${already.id}`);
        return;
    }

    const [channel, podcast] = await Promise.all([fetchText(channelFeedUrl()), fetchText(PODCAST_FEED_URL)]);
    const email = weeklyEmail({
        video: channel ? videoOfWeek(parseChannelFeed(channel), now) : null,
        episode: podcast ? newestEpisode(podcast) : null,
    });
    if (!email) {
        await sendEmail({ alert }, 'Soul Wisdom Video of the Week was NOT sent this week',
            `There was nothing to put in it: no new video on the channel in the last 7 days and no podcast episode found. Nothing was sent.\n\n${runUrl}`);
        console.log('🛑 Nothing to send this week; Tom was told.');
        return;
    }

    const autosend = process.env.NEWSLETTER_AUTOSEND !== 'off';
    const at = sendTime(now);
    const created = await resend<{ id: string }>('POST', '/broadcasts', {
        segment_id: SEGMENT_ID, name, from: NEWSLETTER_FROM, reply_to: NEWSLETTER_REPLY_TO,
        subject: email.subject, preview_text: email.previewText, html: weeklyHtml(email, name),
        ...(autosend ? { send: true, scheduled_at: at.toISOString() } : {}),
    });
    if (!created.ok || !created.data?.id) {
        await sendEmail({ alert }, 'Soul Wisdom Video of the Week could not be made', `Resend refused it: ${created.status} ${created.error}. Nothing was sent.\n\n${runUrl}`);
        throw new Error(`Resend: could not make the broadcast (${created.status} ${created.error})`);
    }
    const url = `https://resend.com/broadcasts/${created.data.id}`;
    const parts = `Video: ${email.video?.title ?? 'none this week'}\nEpisode: ${email.episode?.title ?? 'none'}`;
    await sendEmail({ alert },
        autosend ? `Scheduled for ${eastern(at)}: ${email.subject}` : `Draft ready: ${email.subject}`,
        (autosend
            ? `This week's Soul Wisdom Video of the Week goes out by itself at ${eastern(at)}. To stop it, open it in Resend and cancel before then:\n\n${url}`
            : `This week's Soul Wisdom Video of the Week is a draft in Resend (automatic sending is off). Read it and press Send:\n\n${url}`)
        + `\n\n${parts}`);
    console.log(`✅ ${autosend ? `Scheduled for ${at.toISOString()}` : 'Draft made'}: "${email.subject}" ${url}`);
}

(mode === 'weekly' ? weekly() : sync()).catch(async e => {
    console.error(`❌ Newsletter ${mode} failed: ${e instanceof Error ? e.message : e}`);
    if (mode === 'weekly') await sendEmail({ alert }, 'Soul Wisdom Video of the Week failed', `${e instanceof Error ? e.message : e}\n\n${runUrl}`).catch(() => {});
    process.exit(1);
});
