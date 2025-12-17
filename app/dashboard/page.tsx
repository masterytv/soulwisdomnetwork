"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase/config";
import { signOut } from "firebase/auth";
import PostComposer from "@/components/feed/PostComposer";
import PostCard, { Post } from "@/components/feed/PostCard";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

export default function DashboardPage() {
    const { user } = useAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);

    useEffect(() => {
        // Real-time subscription to posts
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const postsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Post[];

            setPosts(postsData);
            setLoadingPosts(false);
        }, (error) => {
            console.error("Error fetching posts:", error);
            setLoadingPosts(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AuthGuard>
            <div className="min-h-screen bg-sand-50 dark:bg-ocean-950">
                <main className="max-w-2xl mx-auto p-4 py-8">
                    <PostComposer />

                    {loadingPosts ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="bg-white dark:bg-ocean-900 rounded-xl shadow-sm border border-sand-200 dark:border-ocean-800 p-6 animate-pulse"
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 bg-ocean-100 dark:bg-ocean-800 rounded-full"></div>
                                        <div className="space-y-2">
                                            <div className="w-32 h-4 bg-ocean-100 dark:bg-ocean-800 rounded"></div>
                                            <div className="w-20 h-3 bg-ocean-100 dark:bg-ocean-800 rounded"></div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="w-full h-4 bg-ocean-100 dark:bg-ocean-800 rounded"></div>
                                        <div className="w-3/4 h-4 bg-ocean-100 dark:bg-ocean-800 rounded"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {posts.map((post) => (
                                <PostCard key={post.id} post={post} />
                            ))}

                            {posts.length === 0 && (
                                <div className="text-center py-20 bg-white dark:bg-ocean-900 rounded-xl border border-dashed border-sand-300 dark:border-ocean-800">
                                    <p className="text-ocean-500 dark:text-ocean-400">
                                        No posts yet. Be the first to share something!
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </AuthGuard>
    );
}
