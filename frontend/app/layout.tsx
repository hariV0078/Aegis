import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";
import "../styles/workflow.css";

export const metadata: Metadata = {
  title: "PrivacyForge",
  description: "Build AI agents that see patterns, never people.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <header className="topbar">
            <Link href="/" className="brand">
              PrivacyForge
            </Link>
            <nav className="topbar__nav">
              <Link href="/dashboard">Dashboard</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
