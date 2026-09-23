import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import SovereignCommandPalette from "@/components/sovereign/SovereignCommandPalette";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sovereign AI | Industrial AI Workstation",
  description:
    "Air-gapped on-premise agentic AI workstation using open-weight multimodal LLMs for confidential industrial operations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="relative flex h-full min-h-screen bg-transparent text-[#192730] antialiased selection:bg-[#9CAFBE]/40 selection:text-[#192730]"
      >
        {/* Ambient Glowing Cosmic Mesh */}
        <div className="ambient-mesh" />

        <SovereignCommandPalette />
        <Sidebar />
        <div className="relative z-10 ml-64 flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto px-8 py-7 bg-grid-technical">{children}</main>
        </div>
      </body>
    </html>
  );
}
