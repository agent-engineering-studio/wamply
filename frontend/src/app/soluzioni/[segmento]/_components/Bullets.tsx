import type { SegmentBullet } from "@/content/soluzioni/_schema";

const ICON_PATHS: Record<string, string> = {
  calendar: "M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 3v4M16 3v4",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  clock: "M12 6v6l4 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  sparkles: "M12 3v3M12 18v3M3 12h3M18 12h3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12",
  check: "M5 13l4 4L19 7",
};

function Icon({ name }: { name: string }) {
  const d = ICON_PATHS[name] ?? ICON_PATHS.check;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d={d} />
    </svg>
  );
}

export function Bullets({ items }: { items: SegmentBullet[] }) {
  return (
    <section className="border-b border-white/10 py-16">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 px-6 md:grid-cols-3">
        {items.map((b, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
          >
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-teal/15 text-brand-teal">
              <Icon name={b.icon} />
            </div>
            <p className="text-[14px] leading-relaxed text-white">{b.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
