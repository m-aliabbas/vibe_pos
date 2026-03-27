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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <ConfirmCloseGuard />
          <div className="no-print">
            <Navbar />
          </div>
          <div className="no-print">
            <AutoBreadcrumb />
          </div>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
