import Link from "next/link";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { GUIDES } from "@/lib/guides";
import { TIPS } from "@/lib/tips";

// No database needed — guides and tips are static content, so this page works
// even before setup is finished.
export default function GuidesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Guides &amp; help</h1>
        <p className="text-sm text-slate-500">
          Step-by-step routines and plain-English explanations.
        </p>
      </div>

      <Link href="/troubleshoot">
        <Card className="border-brand-200 bg-brand-50 transition hover:border-brand-300">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔎</span>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">Something wrong?</p>
              <p className="text-sm text-slate-600">
                Cloudy, foamy, green, or smelly water? Get likely causes and
                fixes tailored to your latest test.
              </p>
            </div>
            <span className="text-brand-600">→</span>
          </div>
        </Card>
      </Link>

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-700">Step-by-step routines</h2>
        {/* The fresh-fill routine now has a guided, interactive wizard, so send
            that one to /setup instead of the plain checklist. */}
        {GUIDES.map((g) => (
          <Link
            key={g.key}
            href={g.key === "fresh-fill-startup" ? "/setup" : `/guides/${g.key}`}
          >
            <Card className="transition hover:border-brand-300">
              <div className="flex items-center gap-3">
                <Icon name={g.icon} size={30} className="text-brand-600" />
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">
                    {g.title}
                    {g.key === "fresh-fill-startup" ? " (guided)" : ""}
                  </p>
                  <p className="text-sm text-slate-500">{g.intro}</p>
                </div>
                <span className="text-brand-600">→</span>
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-700">
          What does each chemical do?
        </h2>
        {TIPS.map((t) => (
          <Card key={t.key}>
            <div className="flex items-start gap-3">
              <Icon name={t.icon} size={24} className="text-brand-600" />
              <div>
                <p className="font-semibold text-slate-800">{t.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{t.what}</p>
                <p className="mt-1 text-sm text-slate-500">{t.why}</p>
              </div>
            </div>
          </Card>
        ))}
      </section>

      <p className="text-center text-xs text-slate-400">
        General guidance only — always follow the instructions on your own
        chemical products.
      </p>
    </div>
  );
}
