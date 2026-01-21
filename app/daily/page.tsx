'use client';

import React, { useState, useEffect } from 'react';
import { query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { feedItemsCol } from '@/lib/firebase/firestore';
import DailyVideoCard from '@/components/daily/DailyVideoCard';
import DateNavigator from '@/components/daily/DateNavigator';
import { startOfDay, endOfDay } from 'date-fns';

type FeedItem = {
    id: string;
    title: string;
    channel: string;
    url: string;
    videoId: string;
    ai_score: number;
    ai_reasoning: string;
    ai_summary?: string;
    publishedAt: string;
    createdAt: Timestamp;
};

export default function DailyBoard() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [videos, setVideos] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);

        // Define the start and end of the selected day
        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        // Query: items created within this day window, ordered by score descending
        const q = query(
            feedItemsCol,
            where('createdAt', '>=', start),
            where('createdAt', '<=', end),
            orderBy('createdAt', 'desc')
            // Note: We might need a composite index for createdAt + ai_score if we want to sort by score.
            // For now let's just sort in memory if the list is small.
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as FeedItem[];

            // Client-side sort by Score for now to avoid index hell for the user immediately
            items.sort((a, b) => b.ai_score - a.ai_score);

            setVideos(items);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedDate]);

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col items-center py-4">
                        <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
                            SOUL WISDOM <span className="text-white opacity-40 font-light">DAILY</span>
                        </h1>
                        <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                    </div>
                ) : videos.length === 0 ? (
                    <div className="text-center py-20 opacity-50">
                        <p className="text-xl">No signals detected for this date.</p>
                        <p className="text-sm mt-2">The ether was quiet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {videos.map(video => (
                            <DailyVideoCard key={video.id} video={video} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
