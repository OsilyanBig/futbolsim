import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dönen Kale · Futbol Simülasyonu",
  description: "YouTube Shorts için 9:16 dönen kale futbol simülasyonu. Takımlarını seç, başlat ve videoyu indir.",
};

export const viewport: Viewport = {
  themeColor: "#06050d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
