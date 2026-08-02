import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// One family, weight-differentiated. Inter's tabular figures are what stop a
// live-updating metric from shimmering as digit widths change.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VIGIL — connected consciousness monitor",
  description:
    "The monitor in every operating room measures whether the brain is talking to itself. VIGIL asks whether it is still listening to the room.",
};

export const viewport: Viewport = {
  themeColor: "#f1f5f9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
