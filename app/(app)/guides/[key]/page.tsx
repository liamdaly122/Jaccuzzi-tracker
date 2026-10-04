import { notFound } from "next/navigation";
import GuideRunner from "@/components/GuideRunner";
import PageHeader from "@/components/PageHeader";
import { getGuide } from "@/lib/guides";
import { getTasks } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function GuidePage({ params }: { params: Params }) {
  const { key } = await params;
  const guide = getGuide(key);
  if (!guide) notFound();

  // The job this guide ticks off, if any. Without the database the guide
  // still works, just without "Finish and mark done".
  let completesTaskId: number | null = null;
  if (guide.completesTaskKey) {
    try {
      const tasks = await getTasks();
      completesTaskId = tasks.find((t) => t.task_key === guide.completesTaskKey)?.id ?? null;
    } catch {
      completesTaskId = null;
    }
  }

  return (
    <div className="grid gap-[18px]">
      <PageHeader title={guide.title} back={{ href: "/care", label: "Back to Care" }} />
      <GuideRunner guide={guide} completesTaskId={completesTaskId} />
    </div>
  );
}
