import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBranches } from "@/actions/onboarding";
import { OnboardingForm } from "./OnboardingForm";
import { GraduationCap } from "lucide-react";

export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "STUDENT") {
    redirect("/login");
  }

  const branches = await getBranches();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-background to-background py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-500/20 mb-4">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-center">
            Welcome to SyllabiQ!
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            Let&apos;s customize your academic profile to unlock your subjects.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-card/40 border border-border/50 backdrop-blur-xl rounded-2xl p-8 shadow-2xl shadow-black/20">
          <OnboardingForm branches={branches} />
        </div>
      </div>
    </div>
  );
}
