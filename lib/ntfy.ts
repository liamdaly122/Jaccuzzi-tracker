// =============================================================================
//  lib/ntfy.ts
//  Send a push notification by POSTing to ntfy.sh. No API key exists — the
//  topic name IS the address, so it is kept in an env var and never exposed.
// =============================================================================

interface NtfyOptions {
  title?: string;
  priority?: "min" | "low" | "default" | "high" | "urgent";
  tags?: string[]; // ntfy renders these as emoji, e.g. ["droplet"]
  clickUrl?: string;
}

// Returns true if the push was accepted. Never throws — a failed notification
// must not break the cron route.
export async function sendNtfy(
  message: string,
  options: NtfyOptions = {},
): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.error("NTFY_TOPIC not set — skipping push notification.");
    return false;
  }

  const headers: Record<string, string> = {};
  if (options.title) headers["Title"] = options.title;
  if (options.priority) headers["Priority"] = options.priority;
  if (options.tags?.length) headers["Tags"] = options.tags.join(",");
  if (options.clickUrl) headers["Click"] = options.clickUrl;

  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers,
      body: message,
    });
    if (!res.ok) {
      console.error(`ntfy responded ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("ntfy request failed:", err);
    return false;
  }
}
