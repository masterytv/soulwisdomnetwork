import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen font-sans selection:bg-gold-500/30 selection:text-white">
      {/* Hero Section */}
      <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
        {/* Subtle Background Glow */}
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-400/5 blur-[120px] pointer-events-none" />

        {/* Logo */}
        <div className="mb-0 animate-fade-in-down">
          <img
            src="/logo.png"
            alt="Soul Wisdom Collective Logo"
            className="w-80 h-auto mb-16"
          />
        </div>

        <h1 className="mb-6 text-6xl font-extrabold tracking-tight sm:text-8xl flex flex-col gap-2">
          <span className="text-gold-300">
            Connect Deeper.
          </span>
          <span className="text-white">
            Ascend Higher.
          </span>
        </h1>
        <p className="mb-12 max-w-xl text-lg text-ocean-100/70 sm:text-lg leading-relaxed">
          The premier network for spiritual growth, connection, and wisdom.
          Join a collective dedicated to elevating consciousness.
        </p>
        <Link
          href="/login"
          className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-12 py-4 font-bold text-ocean-950 shadow-xl shadow-gold-500/10 transition-all duration-300 hover:scale-105 hover:shadow-gold-500/30"
        >
          <span className="relative">Join the Collective</span>
        </Link>
      </section>

      {/* Features Section */}
      <section className="px-4 py-32 bg-ocean-950/30">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
          {/* Feature 1 */}
          <div className="rounded-3xl border border-ocean-800 bg-ocean-900/50 p-8 shadow-2xl backdrop-blur-sm transition-transform hover:-translate-y-2 hover:border-gold-500/50">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-100 dark:bg-gold-900/20 text-gold-600 dark:text-gold-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="mb-3 text-xl font-bold text-ocean-100">Curated Wisdom</h3>
            <p className="text-ocean-100/70">
              Access exclusive content, courses, and teachings from world-renowned spiritual masters.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-3xl border border-ocean-800 bg-ocean-900/50 p-8 shadow-2xl backdrop-blur-sm transition-transform hover:-translate-y-2 hover:border-gold-500/50">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-100 dark:bg-gold-900/20 text-gold-600 dark:text-gold-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="mb-3 text-xl font-bold text-ocean-100">Community Connection</h3>
            <p className="text-ocean-100/70">
              Find your soul tribe. Connect with like-minded seekers on the same path of ascension.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-3xl border border-ocean-800 bg-ocean-900/50 p-8 shadow-2xl backdrop-blur-sm transition-transform hover:-translate-y-2 hover:border-gold-500/50">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-100 dark:bg-gold-900/20 text-gold-600 dark:text-gold-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="mb-3 text-xl font-bold text-ocean-100">Live Events</h3>
            <p className="text-ocean-100/70">
              Participate in global meditations, workshops, and live streams to elevate your frequency.
            </p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 -z-10 bg-ocean-950/80" />
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-4 lg:flex-row">
          <div className="flex-1">
            <div className="aspect-square w-full max-w-md rounded-full bg-gradient-to-tr from-gold-500/20 to-ocean-500/10 blur-3xl animate-pulse" />
          </div>
          <div className="flex-1">
            <h2 className="mb-6 text-3xl font-bold text-ocean-50 sm:text-4xl">The Soul Wisdom Mission</h2>
            <p className="mb-6 text-lg text-ocean-100/70">
              We believe that we are all interconnected. The Soul Wisdom Network is built to facilitate the flow of ancient wisdom into the modern world.
            </p>
            <p className="text-lg text-ocean-100/70">
              Our platform uses technology not to distract, but to deepen. Every feature is designed with the intention of supporting your spiritual journey and connecting you with the truth of who you are.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ocean-800/30 bg-ocean-950 py-12">
        <div className="mx-auto max-w-6xl px-4 text-center text-ocean-100/30">
          <p className="mb-4">&copy; 2025 Soul Wisdom Network. All rights reserved.</p>
          <div className="flex justify-center gap-6">
            <Link href="#" className="hover:text-gold-500 transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-gold-500 transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-gold-500 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
