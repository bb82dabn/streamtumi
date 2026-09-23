import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StreamTumi",
    short_name: "StreamTumi",
    description: "Create, share, and discover independent online TV and Radio stations.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/branding/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/branding/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/branding/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
