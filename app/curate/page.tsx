
"use client";

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import AgentFeedItem from '@/components/curate/AgentFeedItem';

export default function CurationPage() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Query: items needing review, ordered by newest first
        const q = query(
            collection(db, 'feed_items'),
            where('status', '==', 'pending_review'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const liveItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setItems(liveItems);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xl">🤖</div>
                        <h1 className="text-xl font-bold text-gray-900">Agent Curator</h1>
                    </div>
                    <div className="text-sm text-gray-500">
                        {items.length} Pending Review
                    </div>
                </div>
            </header>

            {/* Main Feed */}
            <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
                {loading ? (
                    <div className="text-center py-20 text-gray-500">Connecting to Scout...</div>
                ) : items.length === 0 ? (
                    <div className="text-center py-20 space-y-4">
                        <div className="text-4xl">😴</div>
                        <h3 className="text-lg font-medium text-gray-900">No new items to review</h3>
                        <p className="text-gray-500">The agent is scanning the horizon. Check back tomorrow.</p>
                    </div>
                ) : (
                    items.map(item => (
                        <AgentFeedItem key={item.id} item={item} />
                    ))
                )}
            </main>
        </div>
    );
}
