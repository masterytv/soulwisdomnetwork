"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function PostComposer() {
    const { user } = useAuth();
    const [content, setContent] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || !user) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "posts"), {
                authorId: user.uid,
                authorName: user.displayName || user.email?.split("@")[0] || "Anonymous",
                authorPhoto: user.photoURL,
                content: content.trim(),
                createdAt: serverTimestamp(),
                likesCount: 0,
                commentCount: 0,
            });
            setContent("");
        } catch (error) {
            console.error("Error creating post:", error);
            alert("Failed to post. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white dark:bg-ocean-900 rounded-xl shadow-sm border border-sand-200 dark:border-ocean-800 p-4 mb-6 transition-all">
            <form onSubmit={handleSubmit}>
                <div className="flex gap-4">
                    <div className="flex-shrink-0">
                        {user?.photoURL ? (
                            <img
                                src={user.photoURL}
                                alt={user.displayName || "User"}
                                className="w-10 h-10 rounded-full object-cover border border-sand-200 dark:border-ocean-800"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center text-gold-600 font-bold border border-gold-200 dark:border-gold-800">
                                {(user?.displayName || "U")[0]}
                            </div>
                        )}
                    </div>
                    <div className="flex-grow">
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="What's on your mind?"
                            className="w-full bg-transparent border-none focus:ring-0 text-ocean-900 dark:text-ocean-100 placeholder-ocean-400 dark:placeholder-ocean-500 resize-none min-h-[100px] py-2 text-lg"
                            disabled={isSubmitting}
                        />
                        <div className="flex justify-end pt-3 border-t border-sand-100 dark:border-ocean-800 mt-2">
                            <button
                                type="submit"
                                disabled={!content.trim() || isSubmitting}
                                className="bg-gold-500 hover:bg-gold-600 disabled:opacity-50 disabled:cursor-not-allowed text-ocean-950 px-6 py-2 rounded-full font-bold transition-all shadow-md shadow-gold-500/10"
                            >
                                {isSubmitting ? "Posting..." : "Post"}
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
