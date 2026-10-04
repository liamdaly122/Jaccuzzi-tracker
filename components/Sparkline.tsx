// A tiny trend line for a stat tile: the shape of the last day, the ideal band
// behind it, and a dot on the latest value. Decorative — the number beside it
// carries the value.
export default function Sparkline({
  values,
  band,
}: {
  values: number[];
  band?: [number, number] | null;
}) {
  if (values.length < 2) return <div className="h-[30px]" aria-hidden />;
  const w = 100;
  const h = 30;
  const p = 3;
  const lo = Math.min(...values, ...(band ?? []));
  const hi = Math.max(...values, ...(band ?? []));
  const span = hi - lo || 1;
  const x = (i: number) => p + (i * (w - p * 2)) / (values.length - 1);
  const y = (v: number) => h - p - ((v - lo) / span) * (h - p * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <div className="relative h-[30px]" aria-hidden>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {band ? (
          <rect className="fill-good-soft" x={0} y={y(band[1])} width={w} height={Math.max(0, y(band[0]) - y(band[1]))} />
        ) : null}
        <path d={d} className="fill-none stroke-accent" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
        style={{ left: `${x(last)}%`, top: `${(y(values[last]) / h) * 100}%` }}
      />
    </div>
  );
}
