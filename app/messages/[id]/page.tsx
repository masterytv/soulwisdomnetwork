"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { sendMessage } from "@/lib/firebase/messaging";
import { formatDistanceToNow } from "date-fns";

interface Message {
    id: string;
    senderId: string;
    content: string;
    createdAt: any;
}

interface UserProfile {
    displayName: string;
    photoURL: string | null;
}

export default function ChatPage() {
    const { id: convId } = useParams() as { id: string };
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!convId || !user) return;

        // Fetch conversation metadata to find other user
        const fetchOtherUser = async () => {
            const convSnap = await getDoc(doc(db, "conversations", convId));
            if (convSnap.exists()) {
                const data = convSnap.data();
                const otherUid = data.participants.find((uid: string) => uid !== user.uid);
                if (otherUid) {
                    const userSnap = await getDoc(doc(db, "users", otherUid));
                    if (userSnap.exists()) {
                        setOtherUser(userSnap.data() as UserProfile);
                    }
                }
            }
        };

        fetchOtherUser();

        const q = query(
            collection(db, "messages"),
            where("conversationId", "==", convId),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Message[];
            setMessages(msgs);
            setLoading(false);

            // Auto-scroll to bottom
            setTimeout(() => {
                scrollRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        });

        return () => unsubscribe();
    }, [convId]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || !user) return;

        const msgContent = content.trim();
        setContent("");
        try {
            await sendMessage(convId, user.uid, msgContent);
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-sand-50 dark:bg-ocean-950">
            {/* Header */}
            <div className="p-4 bg-white dark:bg-ocean-900 border-b border-sand-200 dark:border-ocean-800 flex items-center gap-3">
                {otherUser?.photoURL ? (
                    <img src={otherUser.photoURL} alt={otherUser.displayName} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-sand-100 dark:bg-ocean-800 flex items-center justify-center font-bold text-ocean-400">
                        {otherUser?.displayName?.[0] || 'U'}
                    </div>
                )}
                <div>
                    <h2 className="font-bold text-sm text-ocean-900 dark:text-ocean-100">
                        {otherUser?.displayName || "Conversation"}
                    </h2>
                    <span className="text-[10px] text-green-500 font-bold">● Active</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.map((msg) => {
                    const isMe = msg.senderId === user?.uid;
                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] p-3 rounded-2xl text-sm shadow-sm ${isMe
                                ? 'bg-gold-500 text-ocean-950 rounded-tr-none font-medium'
                                : 'bg-white dark:bg-ocean-900 text-ocean-800 dark:text-ocean-200 rounded-tl-none border border-sand-100 dark:border-ocean-800'
                                }`}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                <div className={`text-[10px] mt-1 text-right ${isMe ? 'opacity-70' : 'text-ocean-400'}`}>
                                    {msg.createdAt?.toDate ? formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true }) : "Just now"}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={scrollRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white dark:bg-ocean-900 border-t border-sand-200 dark:border-ocean-800">
                <form onSubmit={handleSend} className="flex gap-2">
                    <input
                        type="text"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-grow bg-sand-50 dark:bg-ocean-950 border border-sand-200 dark:border-ocean-800 rounded-full px-6 py-3 text-sm focus:ring-1 focus:ring-gold-500 outline-none transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!content.trim()}
                        className="bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-ocean-950 p-3 rounded-full transition-colors shadow-lg shadow-gold-500/10"
                    >
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}
