import { AdminSidebar } from "./admin/_components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-brand-navy-deep">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-linear-to-r from-brand-navy to-brand-navy-light px-6 py-3">
        <svg viewBox="0 0 400 400" className="h-7 w-7 shrink-0">
          <defs>
            <linearGradient id="adminLogoBg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1B2A4A" />
              <stop offset="100%" stopColor="#0F1B33" />
            </linearGradient>
          </defs>
          <rect width="400" height="400" rx="80" fill="url(#adminLogoBg)" />
          <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M90 140 L130 290 L170 190 L200 290 L230 190 L270 290 L310 140" fill="none" stroke="#0D9488" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        </svg>
        <span className="text-[14px] font-semibold text-white">Wamply Admin</span>
        <span className="rounded-pill bg-brand-teal/20 px-2 py-0.5 text-[10px] font-semibold text-brand-teal">Admin</span>
      </header>

      {/* Sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
