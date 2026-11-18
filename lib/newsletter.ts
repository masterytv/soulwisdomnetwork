// The weekly email sign-up (marketing plan step 3, Tom 2026-11-18: one list, on Resend). The form posts straight to
// Project Profound's sign-up route, where the one list lives (its quiz_leads table, as "newsletter_swc"), so this
// site needs no API route or secret of its own. PP allows requests from this site's origins.

export const NEWSLETTER_SIGNUP_URL =
    process.env.NEXT_PUBLIC_NEWSLETTER_SIGNUP_URL || 'https://projectprofound.org/api/quiz-lead';
export const NEWSLETTER_PRIVACY_URL = 'https://projectprofound.org/privacy';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The request body PP's route expects; null for an address that is clearly wrong.
export function signupBody(email: string) {
    const e = email.trim();
    if (!EMAIL.test(e) || e.length > 320) return null;
    return { email: e, archetype: 'newsletter_swc', frequency: 'weekly' as const };
}

// What to tell the person after PP answers.
export function signupMessage(status: number): { ok: boolean; text: string } {
    if (status >= 200 && status < 300) return { ok: true, text: 'Thank you. Check your inbox for a welcome email.' };
    if (status === 429) return { ok: false, text: 'Too many tries. Please wait a few minutes and try again.' };
    if (status === 400) return { ok: false, text: 'That email address doesn’t look right.' };
    return { ok: false, text: 'Something went wrong. Please try again later.' };
}
