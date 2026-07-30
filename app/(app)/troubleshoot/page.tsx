import Link from "next/link";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { listSymptoms } from "@/lib/troubleshoot";

// Static symptom list — no database needed, so it works even before setup.
export default function TroubleshootPage() {
  const symptoms = listSymptoms();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/guides" className="text-sm font-medium text-brand-600">
          ← Guides &amp; help
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          🔎 Something wrong?
        </h1>
        <p className="text-sm text-slate-500">
          Pick what you&apos;re seeing and I&apos;ll walk you through the likely
          causes and fixes — using your latest test reading where I can.
        </p>
      </div>

      <div className="space-y-3">
        {symptoms.map((s) => (
          <Link key={s.key} href={`/troubleshoot/${s.key}`}>
            <Card className="transition hover:border-brand-300">
              <div className="flex items-center gap-3">
                <Icon name={s.icon} size={30} className="text-brand-600" />
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{s.title}</p>
                  <p className="text-sm text-slate-500">{s.blurb}</p>
                </div>
                <span className="text-brand-600">→</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        General guidance only — always follow the instructions on your own
        chemical products, and never use the spa when a safety warning is
        showing.
      </p>
    </div>
  );
}
