import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "syllabiq-super-secret-jwt-key-change-me-in-production-2026"
);

const AUTH_COOKIE = "auth_token";

// Paths that are publicly accessible without authentication (except exact "/" which we handle separately)
const AUTH_PUBLIC_PATHS = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files, api routes, and Next.js internals through
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;

  // Validate token if present
  let isAuthenticated = false;
  let userRole: string | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      isAuthenticated = true;
      userRole = (payload.role as string) || null;
    } catch {
      isAuthenticated = false;
    }
  }

  const isAuthPublicPath = AUTH_PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isLandingPage = pathname === "/";

  // 1. Unauthenticated users
  if (!isAuthenticated) {
    if (isAuthPublicPath || isLandingPage) {
      return NextResponse.next();
    }
    // Redirect other pages to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Helper to get dashboard URL based on role
  const getDashboardUrl = (role: string | null) => {
    if (role === "ADMIN") return "/admin/dashboard";
    if (role === "TEACHER") return "/teacher/dashboard";
    return "/student/dashboard";
  };

  // 2. Authenticated users trying to access login/register or landing page
  if (isAuthPublicPath || isLandingPage) {
    return NextResponse.redirect(new URL(getDashboardUrl(userRole), request.url));
  }

  // 3. Role-based Authorization Checks
  if (pathname.startsWith("/admin") && userRole !== "ADMIN") {
    return NextResponse.redirect(new URL(getDashboardUrl(userRole), request.url));
  }

  if (pathname.startsWith("/teacher") && userRole !== "TEACHER") {
    return NextResponse.redirect(new URL(getDashboardUrl(userRole), request.url));
  }

  if ((pathname.startsWith("/student") || pathname.startsWith("/onboarding") || pathname.startsWith("/chat")) && userRole !== "STUDENT") {
    return NextResponse.redirect(new URL(getDashboardUrl(userRole), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
