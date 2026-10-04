import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hot Tub Tracker",
    short_name: "Hot Tub",
    description:
      "Chemical dosing calculator and maintenance schedule for your hot tub.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F2F5F4",
    theme_color: "#0B6E6A",
    // Drawn from design/app-icon.svg. Full-bleed squares: the phone cuts its
    // own shape, and everything sits inside the middle 80% so Android's
    // circle crop ("maskable") never clips the steam or the tub.
    icons: [
      {
        src: "/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
