import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { RegisterSW } from "@/components/register-sw";
import { PLATFORM_DEFAULTS } from "@/lib/branding";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: PLATFORM_DEFAULTS.appName,
    template: `%s · ${PLATFORM_DEFAULTS.appName}`,
  },
  description: PLATFORM_DEFAULTS.description,
  applicationName: PLATFORM_DEFAULTS.appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: PLATFORM_DEFAULTS.appName,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <RegisterSW />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
