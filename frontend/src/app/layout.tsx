import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIGIL — connected consciousness monitor",
  description:
    "The monitor in every operating room measures whether the brain is talking to itself. VIGIL asks whether it is still listening to the room.",
};

export const viewport: Viewport = {
  themeColor: "#0a0e0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
