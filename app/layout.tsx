import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

const description = "Create, share, and discover independent online TV and Radio stations.";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: "StreamTumi", template: "%s · StreamTumi" },
    description,
    applicationName: "StreamTumi",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/favicon.ico",
      apple: "/branding/apple-touch-icon.png",
    },
    openGraph: {
      type: "website",
      siteName: "StreamTumi",
      title: "StreamTumi",
      description,
      images: [{ url: "/branding/streamtumi-social.png", width: 1200, height: 630, alt: "StreamTumi" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "StreamTumi",
      description,
      images: ["/branding/streamtumi-social.png"],
    },
  };
}

export const viewport: Viewport = { colorScheme: "dark", themeColor: "#09090b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
