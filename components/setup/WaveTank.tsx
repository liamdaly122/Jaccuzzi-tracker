// =============================================================================
//  components/setup/WaveTank.tsx
//  A small tub with real moving water: two offset wave paths drifting at
//  different speeds behind a rising level. Replaces the earlier scaleY-stretched
//  rectangle, which read as a growing block rather than as water.
//  Motion is CSS-only and disabled under prefers-reduced-motion.
// =============================================================================

interface Props {
  /** Water level, 0–1. */
  level?: number;
  className?: string;
}

// One period of a gentle wave, repeated twice so it can scroll seamlessly.
const WAVE =
  "M0 10 q 30 -8 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 v 40 H0 Z";

export default function WaveTank({ level = 0.62, className = "" }: Props) {
  const l = Math.min(1, Math.max(0.12, level));
  const waterTop = 100 - l * 100; // % from the top

  return (
    <div
      className={`relative mx-auto h-32 w-44 overflow-hidden rounded-[1.6rem] border-2 border-accent/30 bg-accent-soft ${className}`}
      aria-hidden="true"
    >
      {/* Water body, rising to the level */}
      <div
        className="absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-out"
        style={{ height: `${100 - waterTop}%` }}
      >
        {/* Back wave — slower, paler */}
        <svg
          viewBox="0 0 360 50"
          preserveAspectRatio="none"
          className="anim-wave-back absolute inset-x-0 top-0 h-6 w-[200%]"
        >
          <path d={WAVE} className="fill-accent/30" />
        </svg>
        {/* Front wave */}
        <svg
          viewBox="0 0 360 50"
          preserveAspectRatio="none"
          className="anim-wave-front absolute inset-x-0 top-1 h-6 w-[200%]"
        >
          <path d={WAVE} className="fill-accent/60" />
        </svg>
        {/* Body fill below the waves */}
        <div className="absolute inset-x-0 bottom-0 top-4 bg-gradient-to-b from-accent/60 to-accent/80" />
      </div>

      {/* A couple of drifting bubbles for life */}
      <span className="anim-float absolute bottom-6 left-8 h-2 w-2 rounded-full bg-surface/70" />
      <span
        className="anim-float absolute bottom-10 right-10 h-1.5 w-1.5 rounded-full bg-surface/60"
        style={{ animationDelay: "1.2s" }}
      />
    </div>
  );
}
