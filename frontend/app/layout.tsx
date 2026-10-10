import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibePOS - by vibe.exe",
  description: "VibePOS by vibe.exe team",
};

import { AutoBreadcrumb } from "@/components/AutoBreadcrumb";
import { Navbar } from "@/components/Navbar";
import { AuthProvider } from "@/components/AuthProvider";
import { ConfirmCloseGuard } from "@/components/ConfirmCloseGuard";
import { AppConfigProvider } from "@/components/AppConfigProvider";
import { CapabilityRouteGuard } from "@/components/CapabilityRouteGuard";
import { ModuleUiContributionProvider } from "@/components/ModuleUiContributions";
import { LicenseExpiryBanner } from "@/components/LicenseExpiryBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen flex flex-col overflow-hidden`}
      >
        <AuthProvider>
          <AppConfigProvider>
            <ModuleUiContributionProvider contributions={{}}>
              <ConfirmCloseGuard />
              <div className="no-print shrink-0">
                <Navbar />
              </div>
              <LicenseExpiryBanner />
              <div className="no-print shrink-0">
                <AutoBreadcrumb />
              </div>
              <main className="flex-1 min-h-0 overflow-hidden">
                <CapabilityRouteGuard>{children}</CapabilityRouteGuard>
              </main>
            </ModuleUiContributionProvider>
          </AppConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
