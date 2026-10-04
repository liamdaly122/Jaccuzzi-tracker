"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Callout, Field, inputClass } from "@/components/ui";
import Image from "next/image";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/dashboard";

  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        router.replace(redirect);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "That passcode isn't right.");
        setLoading(false);
      }
    } catch {
      setError("Couldn't check that. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <Image
            src="/app-icon-192.png"
            alt=""
            width={64}
            height={64}
            priority
            className="mx-auto mb-3.5 rounded-[15px]"
          />
          <h1 className="text-[28px] font-extrabold tracking-tight">Hot Tub Tracker</h1>
          <p className="mt-1 text-[15px] text-ink-2">Enter your passcode to carry on.</p>
        </div>

        <form onSubmit={onSubmit} className="grid gap-3.5 rounded-card border border-line bg-surface p-5">
          <Field label="Passcode">
            <input
              type="password"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className={inputClass}
              placeholder="Your passcode"
              autoComplete="current-password"
            />
          </Field>

          {error ? (
            <Callout tone="bad" icon="alert-triangle">
              {error}
            </Callout>
          ) : null}

          <Button type="submit" size="lg" block disabled={loading || passcode.length === 0}>
            {loading ? "Checking…" : "Unlock"}
          </Button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
