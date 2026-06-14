import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/auth";
import { logout } from "@/actions/auth";
import { LogOut } from "lucide-react";

export async function UserAvatar() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session) return null;

  const initials = session.name
    ? session.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session.email[0].toUpperCase();

  return (
    <div className="flex items-center gap-3 ml-auto">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-indigo-600/80 ring-1 ring-indigo-500/40 flex items-center justify-center text-xs font-semibold text-white select-none">
          {initials}
        </div>
        <span className="text-sm text-muted-foreground hidden sm:block">
          {session.name ?? session.email}
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
  );
}
