"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase/config";
import { signOut } from "firebase/auth";

export default function Navbar() {
    const { user, loading } = useAuth();
    const pathname = usePathname();

    if (loading) return null;

    const navItems = user ? [
        { name: "Feed", href: "/dashboard" },
        { name: "Members", href: "/members" },
        { name: "Messages", href: "/messages" },
    ] : [];

    return (
        <nav className="bg-white dark:bg-ocean-900 border-b border-ocean-200 dark:border-ocean-800 px-4 py-3 sticky top-0 z-50 shadow-sm">
            <div className="max-w-6xl mx-auto flex justify-between items-center">
                <div className="flex items-center gap-8">
                    <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 group">
                        <img
                            src="/logo.png"
                            alt="Soul Wisdom Collective"
                            className="h-12 w-auto transition-transform group-hover:scale-105"
                        />
                    </Link>

                    {user && (
                        <div className="flex gap-1">
                            {navItems.map((item) => {
                                const isActive = pathname.startsWith(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${isActive
                                            ? "bg-gold-50 text-gold-600 dark:bg-gold-900/10 dark:text-gold-400"
                                            : "text-ocean-500 dark:text-ocean-400 hover:bg-sand-50 dark:hover:bg-ocean-800"
                                            }`}
                                    >
                                        {item.name}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {user ? (
                        <>
                            <Link
                                href={`/profile/${user.uid}`}
                                className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-sand-50 dark:hover:bg-ocean-800 transition-all border border-transparent hover:border-sand-200 dark:hover:border-ocean-700"
                            >
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-sand-100" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-gold-100 flex items-center justify-center text-gold-600 font-bold text-xs">
                                        {user.displayName?.[0] || user.email?.[0]}
                                    </div>
                                )}
                                <span className="hidden md:inline text-sm font-bold text-ocean-900 dark:text-ocean-100">
                                    {user.displayName || "Member"}
                                </span>
                            </Link>
                            <button
                                onClick={() => signOut(auth)}
                                className="p-2 text-ocean-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10"
                                title="Sign Out"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        </>
                    ) : (
                        <Link
                            href="/login"
                            className="bg-gold-500 hover:bg-gold-600 text-ocean-950 font-bold py-2 px-6 rounded-full transition-all text-sm shadow-md shadow-gold-500/10"
                        >
                            Sign In
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
}
