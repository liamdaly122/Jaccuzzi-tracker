import Link from "next/link";
import { notFound } from "next/navigation";
import GuideRunner from "@/components/GuideRunner";
import { getGuide } from "@/lib/guides";
import { getTasks } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export default async function GuidePage({ params }: { params: Params }) {
  const { key } = await params;
  const guide = getGuide(key);
  if (!guide) notFound();

  // Look up the maintenance task this guide completes (if any). If the DB isn't
  // reachable yet, the guide still works — just without the "mark done" button.
  let completesTaskId: number | null = null;
  if (guide.completesTaskKey) {
    try {
      const tasks = await getTasks();
      completesTaskId =
        tasks.find((t) => t.task_key === guide.completesTaskKey)?.id ?? null;
    } catch {
      completesTaskId = null;
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/guides" className="text-sm font-medium text-brand-600">
        ← All guides
      </Link>
      <h1 className="text-2xl font-bold text-slate-800">
        {guide.emoji} {guide.title}
      </h1>
      <GuideRunner guide={guide} completesTaskId={completesTaskId} />
    </div>
  );
}
