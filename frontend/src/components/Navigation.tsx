import Link from "next/link";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { logout } from "@/actions/auth";
import { GraduationCap, LogOut, LayoutDashboard, BookOpen, User as UserIcon, MessageSquare } from "lucide-react";

export async function Navigation() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session) return null;

  const dashboardUrl =
    session.role === "ADMIN"
      ? "/admin/dashboard"
      : session.role === "TEACHER"
      ? "/teacher/dashboard"
      : "/student/dashboard";

  const userInitials = session.name
    ? session.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session.email[0].toUpperCase();

  return (
    <header className="fixed top-0 inset-x-0 h-16 bg-background/80 backdrop-blur-md border-b border-border/50 flex items-center px-4 md:px-6 z-50 shadow-sm">
      <div className="flex items-center space-x-2">
        <div className="bg-indigo-600 p-1.5 rounded-lg shadow-inner">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <Link href={dashboardUrl} className="font-semibold tracking-tight text-foreground hover:opacity-90">
          SyllabiQ
        </Link>
      </div>

      {/* Dynamic Nav Menu */}
      <nav className="hidden md:flex items-center ml-8 space-x-6 text-sm font-medium text-muted-foreground">
        <Link href={dashboardUrl} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>

        {session.role === "STUDENT" && (
          <>
            <Link href="/student/profile" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <UserIcon className="h-4 w-4" />
              Profile
            </Link>
          </>
        )}

        {session.role === "TEACHER" && (
          <>
            <Link href="/teacher/profile" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <UserIcon className="h-4 w-4" />
              Profile
            </Link>
          </>
        )}

        {session.role === "ADMIN" && (
          <>
            {/* Admin specifics */}
          </>
        )}
      </nav>

      {/* User Section */}
      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600/80 ring-1 ring-indigo-500/40 flex items-center justify-center text-xs font-semibold text-white select-none">
            {userInitials}
          </div>
          <span className="text-sm text-muted-foreground hidden sm:block">
            {session.name || session.email}
          </span>
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider hidden xs:inline-block">
            {session.role}
          </span>
        </div>

        <form action={logout}>
          <button
            type="submit"
            title="Sign out"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
