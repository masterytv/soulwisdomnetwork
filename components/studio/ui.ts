// The Podcast Studio's shared look. Gold, filled: the one step to take now. Outlined: everything
// else. Green: approving (Checkpoints D and E). The sizes and greys are set for the whole Studio in
// app/globals.css (`.studio`, docs/specs/024-studio-readability.md): text-xs is 15px there, gray-400
// and gray-500 pass AA, and border-studio-edge is a control's edge.

export const button = "text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
export const primary = "text-sm px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors disabled:bg-white/10 disabled:text-gray-500 disabled:cursor-not-allowed";
export const secondary = `${button} border-studio-edge text-gray-200 hover:bg-white/10`;
// A picked option among several (a crop, a text).
export const chosen = `${button} border-amber-400/60 text-amber-200 bg-amber-500/10`;
export const approveButton = "text-sm px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
export const hint = "text-xs text-gray-400 leading-relaxed";
export const field = "w-full bg-studio-page border border-studio-edge rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500/50";
