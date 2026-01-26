import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export interface ConceptVideoProps {
    title?: string;
    subtitle?: string;
}

export const ConceptVideo: React.FC<ConceptVideoProps> = ({ title, subtitle }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const opacity = interpolate(frame, [0, 30], [0, 1], {
        extrapolateRight: "clamp",
    });

    return (
        <AbsoluteFill className="bg-ocean-950 items-center justify-center font-sans text-sand-50">
            <div style={{ opacity }} className="text-center p-20 border-4 border-gold-500 rounded-3xl bg-ocean-900/50 backdrop-blur-md shadow-2xl">
                <h1 className="text-8xl font-bold mb-8 text-gold-400">
                    {title}
                </h1>
                <p className="text-4xl text-sand-50/80">
                    {subtitle}
                </p>
            </div>

            {/* Decorative Brand Elements */}
            <div
                className="absolute bottom-10 right-10 w-32 h-32 border-t-4 border-l-4 border-gold-600 opacity-30"
                style={{ transform: `rotate(${frame}deg)` }}
            />
            <div
                className="absolute top-10 left-10 w-32 h-32 border-b-4 border-r-4 border-gold-600 opacity-30"
                style={{ transform: `rotate(${-frame}deg)` }}
            />
        </AbsoluteFill>
    );
};
