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

export const metadata: Metadata = {
  title: "Soul Wisdom Collective",
  description: "A podcast and a community for people who have touched something larger than themselves: near-death experiences, consciousness and the meaning of life.",
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
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
