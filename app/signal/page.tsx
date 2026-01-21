import Link from "next/link";
import { ArrowRight, Sparkles, Brain, Clock, Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 overflow-hidden font-sans">

      {/* --- Ambient Background Effects --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-3xl opacity-40 animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-3xl opacity-40 animate-pulse-slow delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-24 sm:py-32">

        {/* --- Hero Section --- */}
        <div className="text-center space-y-8 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-medium tracking-wide mb-4">
            <Sparkles className="w-4 h-4" />
            <span>AI-Powered Content Intelligence</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-500">
            Cure the Signal <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">from the Noise</span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Your personal AI scout for Consciousness, UFOs, and Frontier Science.
            We filter the clickbait so you only watch what matters.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link
              href="/curate"
              className="group relative px-8 py-4 bg-white text-black font-bold rounded-lg overflow-hidden transition-transform active:scale-95 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            >
              <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 group-hover:opacity-10 transition-opacity"></span>
              <span className="relative flex items-center gap-2">
                Start Curating <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <Link
              href="/daily"
              className="group relative px-8 py-4 bg-transparent border border-white/20 text-white font-bold rounded-lg overflow-hidden transition-all active:scale-95 hover:bg-white/5 hover:border-purple-500/50"
            >
              <span className="relative flex items-center gap-2">
                Daily Wisdom <Clock className="w-5 h-5 group-hover:text-purple-400 transition-colors" />
              </span>
            </Link>
          </div>
        </div>

        {/* --- Features Grid --- */}
        <div className="grid md:grid-cols-3 gap-8 mt-32">

          <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/30 transition-colors group">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Instant Credibility Scoring</h3>
            <p className="text-gray-400 leading-relaxed">
              Our AI evaluates every video against a strict rubric. No more wasted time on fear-mongering or baseless claims.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 transition-colors group">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Brain className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Adaptive Learning</h3>
            <p className="text-gray-400 leading-relaxed">
              The Agent learns who you trust. Block channels instantly or mark them as trusted, refining future searches.
            </p>
          </div>

          <Link href="/daily" className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-pink-500/30 transition-colors group cursor-pointer block">
            <div className="w-12 h-12 rounded-lg bg-pink-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Clock className="w-6 h-6 text-pink-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3 group-hover:text-pink-400 transition-colors">Daily "Deep Harvest" &rarr;</h3>
            <p className="text-gray-400 leading-relaxed">
              Wake up to a fresh batch of 10-15 high-signal videos every morning, summarized and ready for your review.
            </p>
          </Link>

        </div>

      </div>
    </div>
  );
}
