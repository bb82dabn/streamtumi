import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "StreamTumi Radio", template: "%s · StreamTumi Radio" },
  description: "Build, program, broadcast, and discover independent online Radio stations.",
};

export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
