import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

// Self-hosted at build time by next/font: no request to a third party at runtime.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Northgate Freight — Shipment Tracking",
    template: "%s | Northgate Freight",
  },
  description:
    "Track a shipment or manage shipment records. Demonstration application built with fictional data only.",
};

export const viewport: Viewport = {
  themeColor: "#1a37b5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
