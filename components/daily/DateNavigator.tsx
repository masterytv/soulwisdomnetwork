'use client';

import React from 'react';
import { format, addDays, subDays, isSameDay } from 'date-fns';

type DateNavigatorProps = {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
};

export default function DateNavigator({ selectedDate, onDateChange }: DateNavigatorProps) {
    const today = new Date();

    // Generate a window of dates (e.g., previous 2 days, today, next 2 days)
    // Actually for a daily board, usually we want to go back in time.
    // Let's show Today vs Yesterday vs 2 days ago.

    return (
        <div className="flex items-center justify-center gap-4 py-8">
            <button
                onClick={() => onDateChange(subDays(selectedDate, 1))}
                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div className="flex items-center gap-2 bg-white/5 rounded-full px-1 p-1 border border-white/10 backdrop-blur-md">
                <div className="px-6 py-2 rounded-full text-sm font-bold text-white bg-purple-500/20 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                    {isSameDay(selectedDate, today) ? 'Today' : format(selectedDate, 'MMMM d, yyyy')}
                </div>
            </div>

            <button
                onClick={() => onDateChange(addDays(selectedDate, 1))}
                disabled={isSameDay(selectedDate, today)}
                className={`p-2 rounded-full transition-colors ${isSameDay(selectedDate, today)
                        ? 'text-gray-700 cursor-not-allowed'
                        : 'hover:bg-white/10 text-gray-400 hover:text-white'
                    }`}
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
        </div>
    );
}
