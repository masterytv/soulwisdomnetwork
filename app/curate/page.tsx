// DISABLED: Video retrieval feature no longer in use.
// Original curation page has been commented out.
// To re-enable, restore from git history (branch: tom-edits, pre-disable commit).

export default function CurationPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center py-20 space-y-4">
                <div className="text-4xl">🛑</div>
                <h3 className="text-lg font-medium text-gray-900">Curation Disabled</h3>
                <p className="text-gray-500">This feature is currently unavailable.</p>
            </div>
        </div>
    );
}
