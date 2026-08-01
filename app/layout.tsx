import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { PLATFORM_DEFAULTS } from "@/lib/branding";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: PLATFORM_DEFAULTS.appName,
    template: `%s · ${PLATFORM_DEFAULTS.appName}`,
  },
  description: PLATFORM_DEFAULTS.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
