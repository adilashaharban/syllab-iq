import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Navigation } from "@/components/Navigation";
import { StudentProfileForm } from "./StudentProfileForm";
import { User } from "lucide-react";

export default async function StudentProfilePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "STUDENT") {
    redirect("/login");
  }

  const student = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { branch: true },
  });

  if (!student) {
    redirect("/login");
  }

  const initialData = {
    fullName: student.fullName,
    email: student.email,
    phone: student.phone,
    college: student.college,
    selectedSemester: student.selectedSemester || 1,
    branchName: student.branch?.name || "None",
    currentScheme: student.currentScheme || 2024,
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navigation />

      <main className="flex-1 w-full max-w-xl mx-auto pt-24 px-4 pb-12 space-y-6">
        <div className="flex items-center gap-3 border-b border-border/40 pb-3">
          <div className="bg-indigo-600/10 p-2.5 rounded-xl border border-indigo-500/20">
            <User className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Edit Academic Profile</h2>
            <p className="text-xs text-muted-foreground">Keep your university credentials and semesters up to date.</p>
          </div>
        </div>

        <div className="bg-card/40 border border-border/50 backdrop-blur-md rounded-2xl p-6 shadow-xl">
          <StudentProfileForm initialData={initialData} />
        </div>
      </main>
    </div>
  );
}
