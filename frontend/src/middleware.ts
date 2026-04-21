import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Marketing/landing paths are handled by next-intl (handles locale detection,
  // prefix enforcement, cookie NEXT_LOCALE). These are public pages with no auth.
  const isLocalizedMarketingPath = /^\/(it|en)(\/|$)/.test(pathname);
  if (isLocalizedMarketingPath) {
    return intlMiddleware(request);
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Server-side: use internal Docker URL to reach Kong; fallback to public URL for local dev
  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publicHost = new URL(publicUrl).hostname.split(".")[0];
  const cookieName = `sb-${publicHost}-auth-token`;

  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: cookieName },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as never);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // ── Protected routes: require login ───────────────────
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/contacts") ||
    path.startsWith("/campaigns") ||
    path.startsWith("/templates") ||
    path.startsWith("/analytics") ||
    path.startsWith("/settings") ||
    path.startsWith("/groups") ||
    path.startsWith("/history") ||
    path.startsWith("/agent");

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Email not confirmed: redirect to confirmation page ─
  if (isProtected && user && !user.email_confirmed_at) {
    return NextResponse.redirect(new URL("/confirm-email", request.url));
  }

  // ── Admin routes: require admin or collaborator role ──
  if (path.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const { data: dbUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (dbUser?.role !== "admin" && dbUser?.role !== "collaborator") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Lazy helper: fetches user.role once if needed
  let cachedRole: string | null | undefined = undefined;
  async function homeForUser(): Promise<string> {
    if (!user) return "/login";
    if (cachedRole === undefined) {
      const { data: row } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();
      cachedRole = (row?.role as string | undefined) ?? null;
    }
    return cachedRole === "admin" || cachedRole === "collaborator" ? "/admin" : "/dashboard";
  }

  // ── Confirm-email page: for unconfirmed users, or post-signup with ?email= ─
  if (path.startsWith("/confirm-email")) {
    const hasEmailParam = request.nextUrl.searchParams.has("email");
    if (!user && !hasEmailParam) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (user?.email_confirmed_at) {
      return NextResponse.redirect(new URL(await homeForUser(), request.url));
    }
    return response;
  }

  // ── Unconfirmed users: always redirect to confirm-email ─
  const needsConfirmation = user && !user.email_confirmed_at;

  // ── Landing page: redirect authenticated users ────────
  if (path === "/" && user) {
    return NextResponse.redirect(
      new URL(needsConfirmation ? "/confirm-email" : await homeForUser(), request.url),
    );
  }

  // ── Auth pages: redirect already-authenticated users ──
  const isAuth = path.startsWith("/login") || path.startsWith("/register");
  if (isAuth && user) {
    return NextResponse.redirect(
      new URL(needsConfirmation ? "/confirm-email" : await homeForUser(), request.url),
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
