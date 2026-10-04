import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Figtree, self-hosted (SIL Open Font License, see app/fonts/Figtree-OFL.txt):
// no request to Google at build time or on the phone.
const figtree = localFont({
  src: "./fonts/Figtree-latin.woff2",
  weight: "300 900",
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hot Tub Tracker",
  description:
    "Chemical dosing calculator and maintenance schedule for your Lay-Z-Spa hot tub.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hot Tub",
  },
};

// No maximumScale: people must be able to pinch-zoom.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F5F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0C1516" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" className={figtree.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
