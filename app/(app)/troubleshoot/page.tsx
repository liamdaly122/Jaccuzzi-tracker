// Something wrong? Pick what you're seeing. Fixed content, so no database
// needed and it works even before setup.
import PageHeader from "@/components/PageHeader";
import { Card, Row } from "@/components/ui";
import { listSymptoms } from "@/lib/troubleshoot";

export default function TroubleshootPage() {
  return (
    <div className="grid gap-[18px]">
      <PageHeader title="Something wrong?" subtitle="Pick what you're seeing" back={{ href: "/care", label: "Back to Care" }} />
      <Card flush>
        {listSymptoms().map((s) => (
          <Row key={s.key} href={`/troubleshoot/${s.key}`} icon={s.icon} title={s.title} sub={s.blurb} />
        ))}
      </Card>
      <p className="text-center text-[13px] text-ink-3">
        General guidance only. Follow your own products&apos; instructions, and never get in while a
        safety warning is showing.
      </p>
    </div>
  );
}
