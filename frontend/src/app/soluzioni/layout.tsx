import type { ReactNode } from "react";

export default function SoluzioniLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-linear-to-br from-brand-navy via-brand-navy-light to-brand-navy-deep text-white">
      {children}
    </div>
  );
}
