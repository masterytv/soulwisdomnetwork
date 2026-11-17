import { StudioFrame } from '@/components/studio/readability';

// The Usage page is part of the Studio, so it reads the same way (docs/specs/024-studio-readability.md).
export default function UsageLayout({ children }: { children: React.ReactNode }) {
    return <StudioFrame>{children}</StudioFrame>;
}
