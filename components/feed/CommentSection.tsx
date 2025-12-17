"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, increment } from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";

export default function CommentSection({ postId }: { postId: string }) {
    const { user } = useAuth();
    const [content, setContent] = useState("");
    const [comments, setComments] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const q = query(
            collection(db, "comments"),
            where("postId", "==", postId),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const commentsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setComments(commentsData);
        });

        return () => unsubscribe();
    }, [postId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || !user) return;

        setIsSubmitting(true);
        try {
            // Add comment doc
            await addDoc(collection(db, "comments"), {
                postId,
                authorId: user.uid,
                authorName: user.displayName || user.email?.split("@")[0] || "Anonymous",
                authorPhoto: user.photoURL,
                content: content.trim(),
                createdAt: serverTimestamp(),
            });

            // Increment comment count on post
            const postRef = doc(db, "posts", postId);
            await updateDoc(postRef, {
                commentCount: increment(1)
            });

            setContent("");
        } catch (error) {
            console.error("Error adding comment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mt-4 pt-4 border-t border-sand-50 dark:border-ocean-800/50 space-y-4">
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                        <div className="flex-shrink-0">
                            {comment.authorPhoto ? (
                                <img src={comment.authorPhoto} alt={comment.authorName} className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-sand-100 dark:bg-ocean-800 flex items-center justify-center text-xs font-bold text-ocean-400">
                                    {comment.authorName[0]}
                                </div>
                            )}
                        </div>
                        <div className="flex-grow bg-sand-50 dark:bg-ocean-950/50 rounded-2xl px-4 py-2">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-sm text-ocean-900 dark:text-ocean-100">{comment.authorName}</span>
                                <span className="text-[10px] text-ocean-400">
                                    {comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate()) : "just now"}
                                </span>
                            </div>
                            <p className="text-sm text-ocean-700 dark:text-ocean-300">{comment.content}</p>
                        </div>
                    </div>
                ))}
                {comments.length === 0 && (
                    <p className="text-xs text-center text-ocean-400 py-2">No comments yet. Start the conversation!</p>
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-3 items-center">
                <div className="flex-grow relative">
                    <input
                        type="text"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Write a comment..."
                        className="w-full bg-sand-50 dark:bg-ocean-950 border border-sand-200 dark:border-ocean-800 rounded-full px-4 py-2 text-sm focus:ring-1 focus:ring-gold-500 outline-none transition-all pr-10"
                        disabled={isSubmitting}
                    />
                    <button
                        type="submit"
                        disabled={!content.trim() || isSubmitting}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gold-600 disabled:opacity-30 hover:text-gold-500"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                        </svg>
                    </button>
                </div>
            </form>
        </div>
    );
}
