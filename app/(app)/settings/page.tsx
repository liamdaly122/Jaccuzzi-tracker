import { headers } from "next/headers";
import SettingsForm from "@/components/SettingsForm";
import SetupNeeded from "@/components/SetupNeeded";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings;
  try {
    settings = await getSettings();
  } catch (err) {
    return (
      <SetupNeeded message={err instanceof Error ? err.message : "Unknown error"} />
    );
  }

  // Build the calendar subscription URL from the incoming request + the token.
  const token = process.env.ICS_FEED_TOKEN;
  let icsUrl: string | null = null;
  if (token) {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) {
      icsUrl = `${proto}://${host}/api/calendar.ics?token=${encodeURIComponent(token)}`;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">
          Tune your tub, targets, and reminders.
        </p>
      </div>
      <SettingsForm settings={settings} icsUrl={icsUrl} />
    </div>
  );
}
