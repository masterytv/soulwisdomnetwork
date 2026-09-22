import type { Config } from './config';

export interface Failure {
    episode: string;
    stage: string;
    message: string;
    folderId: string;
}

// Emails a summary of permanent failures through Resend. Without a key it only logs:
// the workflow run still fails, so GitHub's own failure email is the fallback.
export async function sendFailureAlert(config: Config, failures: Failure[]) {
    if (failures.length === 0) return;

    const lines = failures.map(f =>
        `• ${f.episode}\n  Stage: ${f.stage}\n  Error: ${f.message}\n  Retry: run "Podcast Ingest" with retry_folder_id = ${f.folderId}`,
    );
    const text = [
        `${failures.length} podcast episode(s) stopped and need attention.`,
        '',
        ...lines,
        '',
        config.runUrl ? `Run log: ${config.runUrl}` : '',
    ].join('\n');

    const { resendApiKey, to, from } = config.alert;
    if (!resendApiKey || !to) {
        console.warn('⚠️ RESEND_API_KEY or ALERT_EMAIL not set; skipping alert email.\n' + text);
        return;
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from,
            to: [to],
            subject: `Podcast pipeline: ${failures.length} episode(s) failed`,
            text,
        }),
    });
    if (!res.ok) console.error(`❌ Alert email failed: ${res.status} ${await res.text()}`);
    else console.log(`📧 Alert sent to ${to}`);
}
