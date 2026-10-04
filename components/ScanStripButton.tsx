"use client";

import { useState } from "react";
import type { SanitizerType } from "@/lib/chemistry";
import type { NormalizedScan } from "@/lib/scan";
import Icon from "./Icon";
import { SourceLine, type SourceMessage } from "./IopoolButton";

interface Props {
  sanitizerType: SanitizerType;
  // Called with the AI-read (and server-normalised) numbers when at least one
  // pad was read. The parent decides how to pre-fill its own fields.
  onValues: (values: NormalizedScan) => void;
  /** When given, the parent shows the status line instead of this button. */
  onMessage?: (m: SourceMessage | null) => void;
  label?: string;
  className?: string;
}

// A self-contained "Scan a strip" button. It opens the phone
// camera, shrinks the photo in the browser (so it uploads and reads fast),
// POSTs to /api/scan-strip, and hands the numbers back via onValues. Shared by
// the reading form and the fresh-water setup wizard.
export default function ScanStripButton({
  sanitizerType,
  onValues,
  onMessage,
  label = "Scan a strip",
  className = "",
}: Props) {
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<SourceMessage | null>(null);
  const say = (m: SourceMessage | null) => {
    setMessage(m);
    onMessage?.(m);
  };
  const setScanError = (text: string) => say({ tone: "neutral", text });

  const rawBase64 = (dataUrl: string): string => {
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  };

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // Shrink the photo before uploading — a strip doesn't need full resolution,
  // and a smaller JPEG reads much faster (avoids timeouts). Falls back to the
  // raw file if the canvas path isn't available (e.g. HEIC decode).
  async function fileToScaledJpeg(
    file: File,
  ): Promise<{ base64: string; mimeType: string }> {
    const dataUrl = await readAsDataUrl(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("decode failed"));
        i.src = dataUrl;
      });
      const MAX = 1280;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0, w, h);
      return {
        base64: rawBase64(canvas.toDataURL("image/jpeg", 0.85)),
        mimeType: "image/jpeg",
      };
    } catch {
      return { base64: rawBase64(dataUrl), mimeType: file.type };
    }
  }

  async function onScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setScanning(true);
    say(null);
    try {
      const { base64: imageBase64, mimeType } = await fileToScaledJpeg(file);
      const res = await fetch("/api/scan-strip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      const data = await res.json();
      if (res.ok && data.values) {
        const v = data.values as NormalizedScan;
        const san =
          sanitizerType === "chlorine" ? v.freeChlorinePpm : v.brominePpm;
        const any =
          v.ph != null ||
          v.totalAlkalinityPpm != null ||
          san != null ||
          v.calciumHardnessPpm != null;
        if (any) {
          onValues(v);
          say({
            tone: "warn",
            text: `Filled in from your photo. Check each one against the strip, especially the ${
              sanitizerType === "chlorine" ? "chlorine" : "bromine"
            }.`,
          });
        } else {
          setScanError(
            "Couldn't read the pads clearly. Please enter the values yourself.",
          );
        }
      } else {
        setScanError(
          data.error || "Couldn't read that photo. Please enter the values yourself.",
        );
      }
    } catch {
      setScanError("Couldn't read that photo. Please enter the values yourself.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className={className}>
      <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-ctl border border-line bg-surface px-4 py-2.5 text-[15px] font-bold text-ink transition hover:bg-surface-2 has-[:disabled]:opacity-60">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onScanFile}
          disabled={scanning}
          className="sr-only"
        />
        <Icon name="camera" size={18} className="text-accent-ink" />
        {scanning ? "Reading your strip…" : label}
      </label>
      {message && !onMessage ? <SourceLine message={message} /> : null}
    </div>
  );
}
