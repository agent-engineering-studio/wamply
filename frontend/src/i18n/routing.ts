import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["it", "en"],
  defaultLocale: "it",
  localePrefix: "always",
});

// Wrappers per Link/useRouter/redirect che tengono conto del locale corrente.
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
