import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wamply — WhatsApp Campaign Manager",
  description: "Amplify your WhatsApp campaigns with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
