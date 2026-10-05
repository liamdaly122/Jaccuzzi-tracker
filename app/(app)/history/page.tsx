// History: every saved test, dose and soak, newest first. Reached from Water.
import SetupNeeded from "@/components/SetupNeeded";
import PageHeader from "@/components/PageHeader";
import DeleteReadingButton from "@/components/DeleteReadingButton";
import { Card, Row, Section } from "@/components/ui";
import { getRecentReadings, getRecentDosing, getSettings, getRecentUsage } from "@/lib/data";
import { CHEMICAL_LABELS, type UsageLogRow } from "@/lib/types";
import { formatDateTime } from "@/lib/display";

export const dynamic = "force-dynamic";

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <p className="text-[14.5px] text-ink-2">{children}</p>
    </Card>
  );
}

export default async function HistoryPage() {
  let readings, dosing, settings;
  try {
    [readings, dosing, settings] = await Promise.all([
      getRecentReadings(50),
      getRecentDosing(50),
      getSettings(),
    ]);
  } catch (err) {
    return <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />;
  }

  // Usage is optional (its table may not exist yet), so never break the page.
  let usage: UsageLogRow[] = [];
  try {
    usage = await getRecentUsage(50);
  } catch {
    usage = [];
  }

  const isChlorine = settings.sanitizer_type === "chlorine";

  return (
    <div className="grid gap-[18px]">
      <PageHeader title="History" subtitle="Tests, doses and soaks" back={{ href: "/water", label: "Back to Water" }} />

      <Section title="Tests" aside={readings.length ? `${readings.length}` : undefined}>
        {readings.length === 0 ? (
          <Empty>No tests saved yet.</Empty>
        ) : (
          <Card flush>
            {readings.map((r) => {
              const san = isChlorine ? r.free_chlorine_ppm : r.bromine_ppm;
              const parts = [
                `pH ${r.ph}`,
                `Alk ${r.total_alkalinity_ppm}`,
                san !== null ? `${isChlorine ? "Cl" : "Br"} ${san}` : null,
                r.orp_mv !== null ? `${r.orp_mv}\u00a0mV` : null,
                r.calcium_hardness_ppm !== null ? `Ca ${r.calcium_hardness_ppm}` : null,
              ].filter(Boolean);
              return (
                <Row
                  key={r.id}
                  title={<span className="tabular-nums">{parts.join(" · ")}</span>}
                  sub={
                    <>
                      {formatDateTime(r.recorded_at)}
                      {r.is_fresh_fill ? " · fresh fill" : ""}
                      {r.notes ? <span className="block italic">{r.notes}</span> : null}
                    </>
                  }
                  right={<DeleteReadingButton readingId={r.id} />}
                />
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="Chemicals added" aside={dosing.length ? `${dosing.length}` : undefined}>
        {dosing.length === 0 ? (
          <Empty>No doses logged yet. After a test, tap &ldquo;I&apos;ve added it&rdquo; to keep a record.</Empty>
        ) : (
          <Card flush>
            {dosing.map((d) => (
              <Row
                key={d.id}
                title={`${CHEMICAL_LABELS[d.chemical]} · ${d.amount_grams}\u00a0g`}
                sub={
                  <>
                    {formatDateTime(d.logged_at)}
                    {d.note ? <span className="block italic">{d.note}</span> : null}
                  </>
                }
              />
            ))}
          </Card>
        )}
      </Section>

      {usage.length > 0 ? (
        <Section title="Soaks" aside={`${usage.length}`}>
          <Card flush>
            {usage.map((u) => (
              <Row
                key={u.id}
                icon="bath"
                title={`${u.bathers} ${u.bathers === 1 ? "person" : "people"}`}
                sub={formatDateTime(u.used_at)}
              />
            ))}
          </Card>
        </Section>
      ) : null}
    </div>
  );
}
