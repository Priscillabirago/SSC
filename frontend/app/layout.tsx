import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import { Toaster } from "@/components/ui/use-toast";
import { AuthGate } from "@/features/auth/components/auth-gate";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Smart Study Companion",
  description: "AI-driven study organizer and academic coach for students."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background antialiased`}>
        <Providers>
          <AuthGate>{children}</AuthGate>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}

