export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-ink-05">
      <div className="bg-brand-ink px-6 py-3 flex items-center gap-3 border-b border-white/10">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" className="h-4 w-4">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="text-[14px] font-semibold text-white">Wamply Admin</span>
        <span className="rounded-pill bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">Solo admin</span>
        <a href="/" className="ml-auto text-[12px] text-white/60 hover:text-white">← Torna alla dashboard</a>
      </div>
      <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
    </div>
  );
}
