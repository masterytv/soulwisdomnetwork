// Why: the full-page editor's old address. It became the Studio editor (spec 020 item E1), so links and
// bookmarks to /edit land there.

import { redirect } from 'next/navigation';

export default async function OldEditorPage({ params }: { params: Promise<{ episodeId: string }> }) {
    const { episodeId } = await params;
    redirect(`/admin/podcast/${encodeURIComponent(episodeId)}/studio-editor`);
}
