import SetupNeeded from "@/components/SetupNeeded";
import DeleteReadingButton from "@/components/DeleteReadingButton";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import {
  getRecentReadings,
  getRecentDosing,
  getSettings,
  getRecentUsage,
} from "@/lib/data";
import { CHEMICAL_LABELS, type UsageLogRow } from "@/lib/types";
import { formatDateTime } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  let readings, dosing, settings;
  try {
    [readings, dosing, settings] = await Promise.all([
      getRecentReadings(50),
      getRecentDosing(50),
      getSettings(),
    ]);
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  // Usage is optional (its table may not exist yet) — never break the page.
  let usage: UsageLogRow[] = [];
  try {
    usage = await getRecentUsage(50);
  } catch {
    usage = [];
  }

  const isChlorine = settings.sanitizer_type === "chlorine";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">History</h1>
        <p className="text-sm text-slate-500">Your past readings and doses.</p>
      </div>

      <section>
        <h2 className="mb-2 font-semibold text-slate-700">Test readings</h2>
        {readings.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">No readings logged yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {readings.map((r) => (
              <Card key={r.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(r.recorded_at)}
                      {r.is_fresh_fill ? " · fresh fill" : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                      <span>pH {r.ph}</span>
                      <span>TA {r.total_alkalinity_ppm}</span>
                      <span>
                        {isChlorine ? "Cl" : "Br"}{" "}
                        {isChlorine
                          ? r.free_chlorine_ppm ?? "—"
                          : r.bromine_ppm ?? "—"}
                      </span>
                      {r.calcium_hardness_ppm !== null ? (
                        <span>CH {r.calcium_hardness_ppm}</span>
                      ) : null}
                    </div>
                    {r.notes ? (
                      <p className="mt-1 text-xs italic text-slate-500">
                        {r.notes}
                      </p>
                    ) : null}
                  </div>
                  <DeleteReadingButton readingId={r.id} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-slate-700">Chemicals added</h2>
        {dosing.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              No doses logged yet. When you add a chemical, tap “Log this as
              added” to keep a record.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {dosing.map((d) => (
              <Card key={d.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {CHEMICAL_LABELS[d.chemical]} — {d.amount_grams} g
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(d.logged_at)}
                    </p>
                    {d.note ? (
                      <p className="mt-0.5 text-xs italic text-slate-500">
                        {d.note}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {usage.length > 0 ? (
        <section>
          <h2 className="mb-2 font-semibold text-slate-700">Recent soaks</h2>
          <div className="space-y-2">
            {usage.map((u) => (
              <Card key={u.id}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">
                    <Icon name="bath" size={14} className="mr-1 inline align-[-2px]" />
                    {u.bathers} {u.bathers === 1 ? "person" : "people"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDateTime(u.used_at)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
