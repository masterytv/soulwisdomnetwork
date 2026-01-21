
"use client";

import { useState, useEffect } from 'react';
import { doc, updateDoc, setDoc, deleteDoc, addDoc, getDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface FeedItem {
    id: string;
    title: string;
    channel: string;
    description: string;
    url: string;
    ai_score: number;
    ai_verdict: string;
    ai_reasoning: string;
    videoId: string;
}

export default function AgentFeedItem({ item }: { item: FeedItem }) {
    const [loading, setLoading] = useState(false);
    const [isDeleted, setIsDeleted] = useState(false);
    const [channelStatus, setChannelStatus] = useState<'trusted' | 'blocked' | 'gray' | null>(null);

    // Check channel status on load
    useEffect(() => {
        async function checkChannel() {
            // Create a consistent ID format for the channel 
            // (Must match what we did in migration script: name.replace(/\s+/g, '_').toLowerCase())
            const channelId = item.channel.replace(/\s+/g, '_').toLowerCase();

            try {
                const docRef = doc(db, 'channels', channelId);
                const snapshot = await getDoc(docRef);
                if (snapshot.exists()) {
                    setChannelStatus(snapshot.data().status);
                }
            } catch (error) {
                console.error("Error fetching channel status:", error);
            }
        }
        checkChannel();
    }, [item.channel]);

    if (isDeleted) return null;

    const updateChannelStatus = async (status: 'trusted' | 'blocked' | 'gray') => {
        setLoading(true);
        try {
            const channelId = item.channel.replace(/\s+/g, '_').toLowerCase();

            await setDoc(doc(db, 'channels', channelId), {
                name: item.channel,
                status: status,
                updatedAt: serverTimestamp()
            }, { merge: true });

            setChannelStatus(status);

            // UX Enhancement: If blocking, maybe offer to auto-reject the video
            if (status === 'blocked') {
                if (confirm("Channel blocked. Do you want to Reject this video as well?")) {
                    await handleReject();
                }
            }
        } catch (e) {
            console.error("Error updating channel:", e);
            alert("Failed to update channel status. Check console.");
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async () => {
        setLoading(true);
        try {
            await addDoc(collection(db, 'posts'), {
                title: item.title,
                content: item.description,
                videoUrl: item.url,
                videoTitle: item.title,
                videoChannel: item.channel,
                videoId: item.videoId,
                authorId: 'agent-scout',
                authorName: 'AI Scout',
                tags: [item.ai_verdict, 'curated'],
                createdAt: serverTimestamp(),
                likes: 0,
                commentCount: 0
            });

            await updateDoc(doc(db, 'feed_items', item.id), {
                status: 'approved',
                approvedAt: serverTimestamp()
            });

            setIsDeleted(true);
        } catch (error) {
            console.error("Error approving:", error);
            alert("Failed to publish post.");
        } finally {
            setLoading(false);
        }
    };

    const handleReject = async () => {
        setLoading(true);
        try {
            await updateDoc(doc(db, 'feed_items', item.id), {
                status: 'rejected'
            });
            setIsDeleted(true);
        } catch (error) {
            console.error("Error rejecting:", error);
        }
        setLoading(false);
    };

    const scoreColor = item.ai_score >= 80 ? 'bg-green-100 text-green-800' :
        item.ai_score >= 50 ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800';

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row p-4 gap-4 transition-all hover:shadow-md">
            {/* Thumbnail */}
            <div className="w-full md:w-64 flex-shrink-0 relative group">
                <img
                    src={`https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`}
                    alt={item.title}
                    className="w-full h-36 object-cover rounded-lg"
                />
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                >
                    <span className="bg-white/90 text-black px-4 py-2 rounded-full text-sm font-medium hover:bg-white">
                        ▶ Watch Video
                    </span>
                </a>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col justify-between">
                <div>
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-lg text-gray-900 leading-tight">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
                                {item.title}
                            </a>
                        </h3>
                        <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${scoreColor}`}>
                            Score: {item.ai_score}
                        </span>
                    </div>

                    {/* Channel Info & Controls */}
                    <div className="flex items-center gap-2 mt-1 mb-2">
                        <p className="text-sm text-gray-500 font-medium">
                            {item.channel}
                        </p>
                        <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-100">
                            <button
                                onClick={() => updateChannelStatus('trusted')}
                                className={`px-2 py-0.5 rounded text-xs transition-colors ${channelStatus === 'trusted' ? 'bg-green-100 text-green-700 font-bold shadow-sm' : 'text-gray-400 hover:bg-white hover:text-green-600'}`}
                                title="Trust Channel: Always approve videos from here"
                            >
                                🛡️ Trust
                            </button>
                            <div className="w-px h-3 bg-gray-200 mx-1"></div>
                            <button
                                onClick={() => updateChannelStatus('gray')}
                                className={`px-2 py-0.5 rounded text-xs transition-colors ${channelStatus === 'gray' ? 'bg-gray-200 text-gray-700 font-bold shadow-sm' : 'text-gray-400 hover:bg-white hover:text-gray-600'}`}
                                title="Gray List: Default behavior (Review needed)"
                            >
                                ❓ Gray
                            </button>
                            <div className="w-px h-3 bg-gray-200 mx-1"></div>
                            <button
                                onClick={() => updateChannelStatus('blocked')}
                                className={`px-2 py-0.5 rounded text-xs transition-colors ${channelStatus === 'blocked' ? 'bg-red-100 text-red-700 font-bold shadow-sm' : 'text-gray-400 hover:bg-white hover:text-red-600'}`}
                                title="Block Channel: Never show videos from here"
                            >
                                ⛔ Block
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mt-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">AI Reasoning</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{item.ai_reasoning}</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-100">
                    <button
                        onClick={handleReject}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        Reject
                    </button>
                    <button
                        onClick={handleApprove}
                        disabled={loading}
                        className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-2"
                    >
                        {loading ? 'Publishing...' : '✅ Publish to Feed'}
                    </button>
                </div>
            </div>
        </div>
    );
}
