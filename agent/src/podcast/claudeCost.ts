// Why: prompt caching for the Podcast Studio's Claude calls, and what each call cost with it.
// A cached prefix is billed differently from plain input: written at 1.25x (5-minute cache) or 2x
// (1-hour cache) the input price, read back at the model's cache-read price. Every job records its
// cost through claudeUsd so the daily spending limit and the Usage page count those tokens too.

// US dollars per million tokens.
export interface ClaudePrice { input: number; output: number; cacheRead: number }

export const CLAUDE_PRICES: Record<string, ClaudePrice> = {
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
    'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
};

// The usage fields a Messages API response reports (beta or not); cache fields are absent or null
// when nothing was cached.
export interface ClaudeUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
}

// The price of the first model listed that has one (the model that answered, then the one asked for:
// a fallback may have stepped in). The last one must be in CLAUDE_PRICES.
export function priceOf(...models: (string | undefined)[]): ClaudePrice {
    for (const m of models) if (m && CLAUDE_PRICES[m]) return CLAUDE_PRICES[m];
    throw new Error(`No price for ${models.join(', ')}`);
}

// What one response cost, in US dollars (unrounded).
export function claudeUsd(usage: ClaudeUsage, price: ClaudePrice): number {
    const written = usage.cache_creation_input_tokens ?? 0;
    const written1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const written5m = Math.max(0, written - written1h);
    const read = usage.cache_read_input_tokens ?? 0;
    return (usage.input_tokens * price.input
        + written5m * price.input * 1.25
        + written1h * price.input * 2
        + read * price.cacheRead
        + usage.output_tokens * price.output) / 1e6;
}

// A text block cached up to and including itself. '5m' suits requests that follow each other within
// minutes (translation batches, a retried round); '1h' suits a prefix a producer re-runs later (a redraft).
export function cachedText(text: string, ttl: '5m' | '1h' = '5m') {
    return {
        type: 'text' as const,
        text,
        cache_control: ttl === '1h' ? { type: 'ephemeral' as const, ttl: '1h' as const } : { type: 'ephemeral' as const },
    };
}
