import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Server-side: use internal Docker URL to reach Kong; fallback to public URL for local dev
  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  // ── Admin routes: require admin role ──────────────────
  if (path.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // Check role from user metadata or DB
    const { data: dbUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (dbUser?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // ── Landing page: redirect authenticated users ────────
  if (path === "/" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Auth pages: redirect already-authenticated users ──
  const isAuth = path.startsWith("/login") || path.startsWith("/register");
  if (isAuth && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
