// Starts and watches the Podcast Ingest workflow (.github/workflows/podcast_ingest.yml)
// with GITHUB_ACTIONS_TOKEN: a fine-grained token for this repository, Actions read/write.

const REPO = 'masterytv/soulwisdomnetwork';
const WORKFLOW = 'podcast_ingest.yml';

async function github(path: string, init: RequestInit = {}) {
    const token = process.env.GITHUB_ACTIONS_TOKEN;
    if (!token) throw new Error('GITHUB_ACTIONS_TOKEN is not set');
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...init.headers,
        },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
}

export interface WorkflowRun {
    id: number;
    status: string;             // queued | in_progress | completed
    conclusion: string | null;  // success | failure | cancelled | ...
    event: string;              // schedule | workflow_dispatch
    createdAt: string;
    url: string;
}

export async function latestIngestRuns(count = 5): Promise<WorkflowRun[]> {
    const res = await github(`/actions/workflows/${WORKFLOW}/runs?per_page=${count}`);
    const data = await res.json() as { workflow_runs: Array<Record<string, unknown>> };
    return data.workflow_runs.map(r => ({
        id: r.id as number,
        status: r.status as string,
        conclusion: r.conclusion as string | null,
        event: r.event as string,
        createdAt: r.created_at as string,
        url: r.html_url as string,
    }));
}

export async function startIngest(inputs: { skip_wait?: boolean; dry_run?: boolean; retry_file_id?: string } = {}) {
    // Workflow inputs are strings on the wire.
    const wire = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(v)]));
    await github(`/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: 'main', inputs: wire }),
    });
}
