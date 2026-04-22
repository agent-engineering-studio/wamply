import { Sidebar } from "@/components/layout/Sidebar";
import { TrialBanner } from "@/components/layout/TrialBanner";
import { AIKeyBanner } from "@/components/layout/AIKeyBanner";
import { CreditsBanner } from "@/components/layout/CreditsBanner";
import { MetaApplicationBanner } from "@/components/layout/MetaApplicationBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-brand-navy-deep">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <TrialBanner />
          <MetaApplicationBanner />
          <AIKeyBanner />
          <CreditsBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
