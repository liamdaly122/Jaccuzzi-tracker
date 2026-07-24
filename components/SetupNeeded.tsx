import { Card } from "./ui";

// Shown when a page can't reach the database yet — almost always because the
// user hasn't finished the one-time Supabase/Vercel setup. Friendly, not scary.
export default function SetupNeeded({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <h2 className="mb-2 text-lg font-bold text-amber-900">
        🔧 Almost there — one setup step left
      </h2>
      <p className="mb-3 text-sm text-amber-900">
        The app can&apos;t reach its database yet. This is normal before setup is
        finished. Check the <strong>README</strong> steps: create the Supabase
        tables (paste <code>supabase/schema.sql</code> and run it), and make sure
        the Supabase and passcode values are saved in Vercel&apos;s Environment
        Variables.
      </p>
      <details className="text-xs text-amber-800">
        <summary className="cursor-pointer font-medium">
          Technical details
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-amber-100 p-2">
          {message}
        </pre>
      </details>
    </Card>
  );
}
