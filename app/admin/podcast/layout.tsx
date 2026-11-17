import { StudioFrame } from '@/components/studio/readability';

// Every Podcast Studio page: its readability (text size and high contrast, docs/specs/024-studio-readability.md).
export default function StudioLayout({ children }: { children: React.ReactNode }) {
    return <StudioFrame>{children}</StudioFrame>;
}
