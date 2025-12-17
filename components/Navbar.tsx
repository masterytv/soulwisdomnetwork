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
        <nav className="bg-ocean-950 backdrop-blur-md border-b border-ocean-800/30 px-4 py-3 sticky top-0 z-50 shadow-2xl">
            <div className="max-w-6xl mx-auto flex justify-between items-center">
                <div className="flex items-center gap-8">
                    <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 group">
                        <img
                            src="/logo.png"
                            alt="Soul Wisdom Collective"
                            className="h-10 w-auto transition-transform group-hover:scale-105"
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
                                            ? "bg-gold-500/10 text-gold-400"
                                            : "text-ocean-300 hover:bg-ocean-900/50 hover:text-gold-300"
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
                                className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-ocean-900/50 transition-all border border-transparent hover:border-ocean-800"
                            >
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-ocean-700" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-400 font-bold text-xs">
                                        {(user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()}
                                    </div>
                                )}
                                <span className="hidden md:inline text-sm font-bold text-ocean-100">
                                    {user.displayName || "Member"}
                                </span>
                            </Link>
                            <button
                                onClick={() => signOut(auth)}
                                className="p-2 text-ocean-400 hover:text-red-400 transition-colors rounded-lg hover:bg-red-950/20"
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
                            className="bg-gradient-to-b from-gold-400 to-gold-600 hover:scale-105 active:scale-95 text-ocean-950 font-bold py-2 px-6 rounded-full transition-all text-sm shadow-lg shadow-gold-500/10"
                        >
                            Sign In
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
}
