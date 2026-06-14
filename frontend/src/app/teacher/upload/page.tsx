import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Navigation } from "@/components/Navigation";
import { UploadForm } from "@/app/teacher/upload/UploadForm";
import { FileText } from "lucide-react";

export default async function TeacherUploadPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "TEACHER") {
    redirect("/login");
  }

  // Fetch teacher subjects
  const teacher = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      teacherSubjects: {
        include: {
          subject: true,
        },
      },
    },
  });

  if (!teacher || teacher.status !== "APPROVED") {
    redirect("/teacher/dashboard");
  }

  const assignedSubjects = teacher.teacherSubjects.map((ts) => ts.subject);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navigation />

      <main className="flex-1 w-full max-w-xl mx-auto pt-24 px-4 pb-12 space-y-6">
        <div className="flex items-center gap-3 border-b border-border/40 pb-3">
          <div className="bg-indigo-600/10 p-2.5 rounded-xl border border-indigo-500/20">
            <FileText className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Upload Syllabus Resources</h2>
            <p className="text-xs text-muted-foreground">Add textbooks, lecture slides, and question papers to your subjects.</p>
          </div>
        </div>

        <div className="bg-card/40 border border-border/50 backdrop-blur-md rounded-2xl p-6 shadow-xl">
          <UploadForm subjects={assignedSubjects} />
        </div>
      </main>
    </div>
  );
}
