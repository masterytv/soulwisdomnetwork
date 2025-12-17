"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Conversation {
    id: string;
    participants: string[];
    participantNames?: Record<string, string>;
    participantPhotos?: Record<string, string | null>;
    lastMessage: string;
    lastMessageTimestamp: any;
    updatedAt: any;
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const pathname = usePathname();

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "conversations"),
            where("participants", "array-contains", user.uid),
            orderBy("updatedAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const convs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Conversation[];
            setConversations(convs);
        });

        return () => unsubscribe();
    }, [user]);

    return (
        <AuthGuard>
            <div className="flex bg-sand-50 dark:bg-ocean-950 h-[calc(100vh-64px)] overflow-hidden">
                {/* Sidebar */}
                <aside className={`w-full md:w-80 border-r border-sand-200 dark:border-ocean-800 bg-white dark:bg-ocean-900 flex-shrink-0 flex flex-col ${pathname !== '/messages' ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b border-sand-100 dark:border-ocean-800">
                        <h1 className="text-xl font-bold text-ocean-900 dark:text-ocean-100">Messages</h1>
                    </div>

                    <div className="flex-grow overflow-y-auto overflow-x-hidden custom-scrollbar">
                        {conversations.length === 0 ? (
                            <div className="p-8 text-center text-sm text-ocean-500">
                                No conversations yet. Go to the <Link href="/members" className="text-gold-500 font-bold hover:underline">Directory</Link> to start one!
                            </div>
                        ) : (
                            conversations.map(conv => {
                                const isActive = pathname.includes(conv.id);
                                const otherUid = conv.participants.find(id => id !== user?.uid);
                                const otherName = conv.participantNames?.[otherUid || ''] || 'Member';
                                const otherPhoto = conv.participantPhotos?.[otherUid || ''];

                                return (
                                    <Link
                                        key={conv.id}
                                        href={`/messages/${conv.id}`}
                                        className={`block p-4 border-b border-sand-50 dark:border-ocean-800/50 hover:bg-sand-50 dark:hover:bg-ocean-800/50 transition-colors ${isActive ? 'bg-gold-50 dark:bg-gold-900/10 border-l-4 border-l-gold-500' : ''}`}
                                    >
                                        <div className="flex gap-3 items-center mb-1">
                                            {otherPhoto ? (
                                                <img src={otherPhoto} alt="" className="w-8 h-8 rounded-full" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-sand-100 dark:bg-ocean-800 flex items-center justify-center text-xs font-bold text-ocean-400">
                                                    {otherName[0]}
                                                </div>
                                            )}
                                            <div className="flex-grow min-w-0">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-sm text-ocean-900 dark:text-ocean-100 truncate">{otherName}</span>
                                                </div>
                                                <p className="text-xs text-ocean-500 truncate">{conv.lastMessage || 'Click to start chatting...'}</p>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* Chat Area */}
                <main className={`flex-grow flex flex-col h-full overflow-hidden ${pathname === '/messages' ? 'hidden md:flex' : 'flex'}`}>
                    {children}
                </main>
            </div>
        </AuthGuard>
    );
}
