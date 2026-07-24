import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hot Tub Tracker",
    short_name: "Hot Tub",
    description:
      "Chemical dosing calculator and maintenance schedule for your hot tub.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#eff9ff",
    theme_color: "#2385f0",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
