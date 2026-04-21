import { redirect } from "next/navigation";

// This file exists only to delegate the root "/" route to the localized
// landing under src/app/[locale]/page.tsx. Next.js cannot have both a
// static /page.tsx and a dynamic /[locale]/page.tsx matching the same
// segment, so we explicitly redirect to the default locale. The next-intl
// middleware will then rewrite internally based on cookies / Accept-Language.
export default function RootRedirect() {
  redirect("/it");
}
