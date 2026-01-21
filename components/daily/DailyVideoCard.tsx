import React from 'react';
import { formatDistanceToNow } from 'date-fns';

type DailyVideoCardProps = {
    video: {
        title: string;
        channel: string;
        publishedAt: string;
        url: string;
        videoId: string;
        ai_summary?: string;
        ai_score: number;
        ai_reasoning: string;
    };
};

export default function DailyVideoCard({ video }: DailyVideoCardProps) {
    // Score Color Logic
    const getScoreColor = (score: number) => {
        if (score >= 85) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        if (score >= 70) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        return 'bg-red-500/10 text-red-400 border-red-500/20';
    };

    return (
        <div className="group relative bg-[#1E1E1E] rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10">
            {/* Thumbnail & Video Link */}
            <a href={video.url} target="_blank" rel="noopener noreferrer" className="block relative aspect-video overflow-hidden">
                <img
                    src={`https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`}
                    alt={video.title}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1E1E1E] via-transparent to-transparent opacity-60" />

                {/* Score Badge */}
                <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-mono font-bold border backdrop-blur-md ${getScoreColor(video.ai_score)}`}>
                    {video.ai_score}/100
                </div>

                {/* Play Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-white/20 backdrop-blur-sm p-4 rounded-full">
                        <svg className="w-8 h-8 text-white fill-current" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            </a>

            {/* Content */}
            <div className="p-5 space-y-4">
                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-gray-500 uppercase tracking-wider font-medium">
                    <span className="text-purple-400">{video.channel}</span>
                    <span>{formatDistanceToNow(new Date(video.publishedAt))} ago</span>
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-gray-100 leading-tight group-hover:text-purple-300 transition-colors">
                    <a href={video.url} target="_blank" rel="noopener noreferrer">
                        {video.title}
                    </a>
                </h3>

                {/* AI Summary */}
                <div className="bg-white/5 rounded-lg p-4 border border-white/5">
                    <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">✨</span>
                        <p className="text-sm text-gray-300 leading-relaxed">
                            {video.ai_summary || video.ai_reasoning}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
