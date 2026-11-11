import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AFTER CL TO MOON",
    short_name: "AFTER MOON",
    description: "AFTER CL TO MOON 클럽 일정, 이벤트, 회원권",
    lang: "ko",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c1620",
    theme_color: "#0c1620",
    categories: ["sports", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "내 회원권", url: "/me", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "이벤트", url: "/events", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
