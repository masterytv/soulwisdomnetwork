// The "Soul Wisdom Video of the Week" sign-up (lib/server/newsletter.ts). Public by design, since anyone may sign
// up without an account, so it is not under /api and has no requireRole (Tom, 2026-11-19: the second public route,
// after the podcast feed). It guards itself: a hidden field for bots, hourly limits per IP and per address, and
// the same answer whether or not the address was already on the list.
import { NextResponse } from 'next/server';
import { HttpError } from '@/lib/server/staff';
import { clientIp, subscribe } from '@/lib/server/newsletter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        await subscribe(await request.json().catch(() => null), clientIp(request));
        return NextResponse.json({ ok: true });
    } catch (e) {
        if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
        console.error('[newsletter] sign-up failed:', e instanceof Error ? e.message : e);
        return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }
}
