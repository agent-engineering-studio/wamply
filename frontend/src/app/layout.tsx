import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Wamply — WhatsApp Campaign Manager",
  description: "Amplify your WhatsApp campaigns with AI",
};

// Root layout shared by localized and non-localized routes.
// The <html lang> attribute is set per-locale in src/app/[locale]/layout.tsx;
// for non-localized routes (dashboard, admin) it stays "it" as before.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
