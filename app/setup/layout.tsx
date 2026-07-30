import type { ReactNode } from "react";

// Immersive, calm-spa canvas for the fresh-water setup wizard: a soft aqua
// gradient and no bottom navigation, so the flow feels like its own space.
export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-brand-100">
      {children}
    </div>
  );
}
