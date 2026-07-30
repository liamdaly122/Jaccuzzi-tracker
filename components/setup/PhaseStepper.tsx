// =============================================================================
//  components/setup/PhaseStepper.tsx
//  Eleven stages is too many dots to read, so progress is shown as four named
//  phases. "Balance, step 2 of 3" tells you where you are in a way a bare
//  percentage never does.
// =============================================================================

import Icon from "@/components/Icon";
import { STARTUP_PHASES } from "@/lib/startup";

interface Props {
  /** Index of the phase currently in progress. */
  currentPhase: number;
  /** 0–1 progress within the current phase, for the partial fill. */
  phaseProgress?: number;
}

export default function PhaseStepper({
  currentPhase,
  phaseProgress = 0,
}: Props) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Setup progress">
      {STARTUP_PHASES.map((phase, i) => {
        const done = i < currentPhase;
        const active = i === currentPhase;
        const fill = done ? 100 : active ? Math.round(phaseProgress * 100) : 0;

        return (
          <li
            key={phase}
            className="flex-1"
            aria-current={active ? "step" : undefined}
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
                style={{ width: `${fill}%` }}
              />
            </div>
            <p
              className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${
                done
                  ? "text-emerald-700"
                  : active
                    ? "text-brand-700"
                    : "text-slate-400"
              }`}
            >
              {done ? <Icon name="check-circle" size={11} /> : null}
              {phase}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
