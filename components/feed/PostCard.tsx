"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import CommentSection from "./CommentSection";

export interface Post {
    id: string;
    authorId: string;
    authorName: string;
    authorPhoto: string | null;
    content: string;
    createdAt: any;
    likesCount: number;
    commentCount: number;
}

export default function PostCard({ post }: { post: Post }) {
    const [showComments, setShowComments] = useState(false);
    const [isLiking, setIsLiking] = useState(false);
    const date = post.createdAt?.toDate ? post.createdAt.toDate() : new Date();

    const handleLike = async () => {
        if (isLiking) return;
        setIsLiking(true);
        try {
            const postRef = doc(db, "posts", post.id);
            await updateDoc(postRef, {
                likesCount: increment(1)
            });
        } catch (error) {
            console.error("Error liking post:", error);
        } finally {
            setIsLiking(false);
        }
    };

    return (
        <div className="bg-white dark:bg-ocean-900 rounded-xl shadow-sm border border-sand-200 dark:border-ocean-800 p-5 mb-4 hover:border-sand-300 dark:hover:border-ocean-700 transition-all">
            <div className="flex gap-4">
                <div className="flex-shrink-0">
                    {post.authorPhoto ? (
                        <img
                            src={post.authorPhoto}
                            alt={post.authorName}
                            className="w-12 h-12 rounded-full object-cover border border-sand-100 dark:border-ocean-800"
                        />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-sand-100 dark:bg-ocean-800 flex items-center justify-center text-ocean-500 dark:text-ocean-400 font-bold border border-sand-200 dark:border-ocean-700">
                            {post.authorName[0]}
                        </div>
                    )}
                </div>
                <div className="flex-grow">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-ocean-900 dark:text-ocean-100 hover:underline cursor-pointer">
                            {post.authorName}
                        </h3>
                        <span className="text-sm text-ocean-400 dark:text-ocean-500">
                            · {formatDistanceToNow(date)} ago
                        </span>
                    </div>
                    <p className="text-ocean-800 dark:text-ocean-200 whitespace-pre-wrap leading-relaxed text-base">
                        {post.content}
                    </p>

                    <div className="flex items-center gap-8 mt-4 pt-4 border-t border-sand-50 dark:border-ocean-800/50">
                        <button
                            onClick={() => setShowComments(!showComments)}
                            className={`flex items-center gap-2 transition-colors text-sm group ${showComments ? 'text-gold-600' : 'text-ocean-500 dark:text-ocean-400 hover:text-gold-500'}`}
                        >
                            <div className={`p-2 rounded-full ${showComments ? 'bg-gold-50 dark:bg-gold-900/10' : 'group-hover:bg-gold-50 dark:group-hover:bg-gold-900/10'}`}>
                                <svg className="w-5 h-5" fill={showComments ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <span>{post.commentCount || 0}</span>
                        </button>

                        <button
                            onClick={handleLike}
                            disabled={isLiking}
                            className="flex items-center gap-2 text-ocean-500 dark:text-ocean-400 hover:text-red-500 dark:hover:text-red-400 transition-colors text-sm group disabled:opacity-50"
                        >
                            <div className="p-2 rounded-full group-hover:bg-red-50 dark:group-hover:bg-red-900/10">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            </div>
                            <span>{post.likesCount || 0}</span>
                        </button>
                    </div>

                    {showComments && <CommentSection postId={post.id} />}
                </div>
            </div>
        </div>
    );
}
