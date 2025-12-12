import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import { Toaster } from "@/components/ui/use-toast";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { ErrorBoundary } from "@/components/error-boundary";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Smart Study Companion",
  description: "AI-driven study organizer and academic coach for students."
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background antialiased`}>
        <ErrorBoundary>
          <Providers>
            <AuthGate>{children}</AuthGate>
            <Toaster />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}

