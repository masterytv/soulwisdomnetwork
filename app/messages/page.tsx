"use client";

export default function MessagesPage() {
    return (
        <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-sand-50 dark:bg-ocean-950">
            <div className="w-20 h-20 bg-gold-500/10 rounded-full flex items-center justify-center mb-4 text-gold-500">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            </div>
            <h2 className="text-2xl font-bold text-ocean-900 dark:text-ocean-100 mb-2">Your Inbox</h2>
            <p className="text-ocean-500 max-w-sm">Select a member from the sidebar or the directory to start a private conversation.</p>
        </div>
    );
}
