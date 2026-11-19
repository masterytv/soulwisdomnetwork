// The "Soul Wisdom Video of the Week" sign-up (marketing plan step 3; Tom, 2026-11-19: Soul Wisdom's own list, on
// its own system). The form (components/NewsletterSignup.tsx) posts to this site's public route
// /newsletter/subscribe (lib/server/newsletter.ts), which records the sign-up in Firestore; the newsletter job
// (agent/src/newsletter/run.ts) does everything with Resend. Shared by the browser and the server.

export const NEWSLETTER_SIGNUP_URL = '/newsletter/subscribe';
export const NEWSLETTER_PRIVACY_URL = '/privacy';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The address, trimmed, when it looks like one; null otherwise.
export function signupEmail(email: string): string | null {
    const e = email.trim();
    return EMAIL.test(e) && e.length <= 320 ? e : null;
}

// The request body the route expects; null for an address that is clearly wrong. `website` is the hidden field
// people leave empty and bots fill in.
export function signupBody(email: string, website = '') {
    const e = signupEmail(email);
    return e ? { email: e, website } : null;
}

// What to tell the person after the route answers.
export function signupMessage(status: number): { ok: boolean; text: string } {
    if (status >= 200 && status < 300) return { ok: true, text: 'Thank you. Your welcome email is on its way.' };
    if (status === 429) return { ok: false, text: 'Too many tries. Please wait a few minutes and try again.' };
    if (status === 400) return { ok: false, text: 'That email address doesn’t look right.' };
    return { ok: false, text: 'Something went wrong. Please try again later.' };
}
