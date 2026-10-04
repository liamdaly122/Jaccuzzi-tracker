import { Card } from "./ui";
import Icon from "./Icon";

// Shown when a page can't reach the database yet: almost always because the
// one-time Supabase and Vercel setup isn't finished. Friendly, not scary.
export default function SetupNeeded({ message }: { message: string }) {
  return (
    <div className="grid gap-[18px] pt-2">
      <Card tone="warn">
        <h1 className="flex items-center gap-2 text-[19px] font-extrabold text-warn-ink">
          <Icon name="cog" size={22} />
          One setup step left
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
          The app can&apos;t reach its database yet. That&apos;s normal before setup is finished.
          Follow the <strong className="text-ink">README</strong>: create the Supabase tables
          (paste <code>supabase/schema.sql</code> and run it), and check the Supabase and passcode
          values are saved in Vercel&apos;s Environment Variables.
        </p>
        <details className="mt-3 text-[13px] text-ink-2">
          <summary className="cursor-pointer font-bold text-accent-ink">Technical details</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-ctl bg-surface p-2.5 text-ink">{message}</pre>
        </details>
      </Card>
    </div>
  );
}
