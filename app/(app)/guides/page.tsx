// Guides and help. No database needed: guides and tips are fixed content, so
// this works even before setup is finished.
import PageHeader from "@/components/PageHeader";
import WhyButton from "@/components/WhyButton";
import Icon from "@/components/Icon";
import { Card, Row, Section } from "@/components/ui";
import { GUIDES } from "@/lib/guides";
import { TIPS } from "@/lib/tips";

export default function GuidesPage() {
  return (
    <div className="grid gap-[18px]">
      <PageHeader title="Guides" subtitle="Step by step, in plain English" back={{ href: "/care", label: "Back to Care" }} />

      <Card tone="accent" flush>
        <Row href="/troubleshoot" icon="search" title="Something wrong?" sub="Cloudy, foamy, green or smelly water" />
      </Card>

      <Section title="Step by step">
        <Card flush>
          {/* Fresh fill has its own guided setup, so that one goes there. */}
          {GUIDES.map((g) => (
            <Row
              key={g.key}
              href={g.key === "fresh-fill-startup" ? "/setup" : `/guides/${g.key}`}
              icon={g.icon}
              title={g.title}
              sub={g.key === "fresh-fill-startup" ? "Guided, with live readings" : `${g.steps.length} steps`}
            />
          ))}
        </Card>
      </Section>

      <Section title="What each chemical does">
        <Card flush>
          {TIPS.map((t) => (
            <div key={t.key} className="flex items-start gap-3 px-3.5 py-3 [&+&]:border-t [&+&]:border-line">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-2">
                <Icon name={t.icon} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-snug">{t.title}</p>
                <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">
                  {t.what}
                  {" · "}
                  <WhyButton title={t.title}>
                    <p>{t.what}</p>
                    <p>{t.why}</p>
                  </WhyButton>
                </p>
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <p className="text-center text-[13px] text-ink-3">
        General guidance only. Always follow the instructions on your own products.
      </p>
    </div>
  );
}
