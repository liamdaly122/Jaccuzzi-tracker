// =============================================================================
//  components/setup/DoseCard.tsx
//  How a dose should look: the amount as a large tabular figure, a teaspoon
//  equivalent for anyone without kitchen scales (the ClearWater leaflet gives
//  1 tsp ~= 5 g of granules), and a scoop that fills in proportion so the
//  quantity is legible at a glance rather than just a number.
// =============================================================================

import Icon from "@/components/Icon";
import { gramsToTeaspoons } from "@/lib/startup";

interface Props {
  label: string;
  /** Numeric amount + unit, e.g. 21 and "g". */
  amount: number;
  unit: string;
  instructions?: string;
  /** Teaspoon hint only makes sense for granules measured in grams. */
  showTeaspoons?: boolean;
  /** Fill fraction 0–1 for the scoop illustration. */
  fill?: number;
  children?: React.ReactNode;
}

function Scoop({ fill }: { fill: number }) {
  const f = Math.min(1, Math.max(0.08, fill));
  // Scoop bowl is 26px tall internally; fill rises from the bottom.
  const bowlTop = 14;
  const bowlH = 22;
  const levelY = bowlTop + bowlH * (1 - f);

  return (
    <svg viewBox="0 0 64 48" className="h-14 w-16 shrink-0" aria-hidden="true">
      <defs>
        <clipPath id="scoop-bowl">
          <path d="M10 14h34a4 4 0 0 1 4 4v8a14 14 0 0 1-14 14H20A14 14 0 0 1 6 26v-8a4 4 0 0 1 4-4Z" />
        </clipPath>
      </defs>
      {/* Granule fill */}
      <g clipPath="url(#scoop-bowl)">
        <rect x="0" y={levelY} width="64" height="48" className="fill-accent/25" />
        <rect x="0" y={levelY} width="64" height="3" className="fill-accent/60" />
      </g>
      {/* Bowl outline */}
      <path
        d="M10 14h34a4 4 0 0 1 4 4v8a14 14 0 0 1-14 14H20A14 14 0 0 1 6 26v-8a4 4 0 0 1 4-4Z"
        fill="none"
        className="stroke-accent"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Handle */}
      <path
        d="M48 20h7a3 3 0 0 1 3 3v3"
        fill="none"
        className="stroke-accent"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function DoseCard({
  label,
  amount,
  unit,
  instructions,
  showTeaspoons = false,
  fill = 0.6,
  children,
}: Props) {
  const tsp = showTeaspoons ? gramsToTeaspoons(amount) : 0;

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
        {label}
      </p>

      <div className="mt-2 flex items-center gap-4">
        <Scoop fill={fill} />
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            <span className="num-tabular text-4xl font-extrabold leading-none">
              {amount}
            </span>
            <span className="text-lg font-bold text-ink-3">{unit}</span>
          </p>
          {showTeaspoons && tsp > 0 ? (
            <p className="mt-1 text-sm text-ink-2">
              ≈ <span className="num-tabular font-semibold">{tsp}</span>{" "}
              {tsp === 1 ? "teaspoon" : "teaspoons"}
            </p>
          ) : null}
        </div>
      </div>

      {instructions ? (
        <p className="mt-3 text-sm text-ink-2">{instructions}</p>
      ) : null}

      <p className="mt-3 flex items-start gap-1.5 text-[13px] text-ink-3">
        <Icon name="bulb" size={14} className="mt-px shrink-0" />
        Check the amount against your product&apos;s label: pack strengths vary.
      </p>

      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
