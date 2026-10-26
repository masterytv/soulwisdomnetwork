import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";

// The fonts are in the repo (app/fonts: the variable fonts' Latin files, as Google Fonts serves them; SIL Open Font
// Licence), so a build never depends on downloading them.
const geistSans = localFont({
  src: "./fonts/Geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const outfit = localFont({
  src: "./fonts/Outfit-latin.woff2",
  variable: "--font-outfit",
  weight: "100 900",
});

// The staging site (the soulwisdomnetwork-staging backend, built from the `staging` branch) sets NEXT_PUBLIC_SITE_ENV
// in apphosting.staging.yaml: it shows a bar saying so, and asks search engines not to list it.
const staging = process.env.NEXT_PUBLIC_SITE_ENV === "staging";

export const metadata: Metadata = {
  title: staging ? "Staging · Soul Wisdom Collective" : "Soul Wisdom Collective",
  description: "A podcast and a community for people who have touched something larger than themselves: near-death experiences, consciousness and the meaning of life.",
  ...(staging ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} antialiased`}
      >
        {staging && (
          <div role="status" className="bg-amber-500 px-4 py-1 text-center text-xs font-semibold text-black">
            STAGING: the test site, built from the staging branch. It shares the live site&apos;s members, episodes and
            settings, so changes here are real. Podcast jobs run the live code.
          </div>
        )}
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
