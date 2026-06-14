import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Navigation } from "@/components/Navigation";
import { AdminControlCenter } from "./AdminControlCenter";
import { Shield, GraduationCap, Users, FolderTree, BookOpen } from "lucide-react";

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  // 1. Fetch Stats counts
  const studentCount = await prisma.user.count({ where: { role: "STUDENT" } });
  const teacherCount = await prisma.user.count({ where: { role: "TEACHER" } });
  const branchCount = await prisma.branch.count();
  const subjectCount = await prisma.subject.count();

  // 2. Fetch Lists
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { branch: true },
    orderBy: { fullName: "asc" },
  });

  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER" },
    orderBy: { status: "asc" }, // Pending first
  });

  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
  });

  const subjects = await prisma.subject.findMany({
    include: {
      branch: true,
      semester: true,
    },
    orderBy: { code: "asc" },
  });

  const rawAssignments = await prisma.teacherSubject.findMany({
    include: {
      teacher: true,
      subject: true,
    },
    orderBy: { id: "desc" },
  });

  const assignments = rawAssignments.map((ass) => ({
    id: ass.id,
    teacher: {
      id: ass.teacher.id,
      fullName: ass.teacher.fullName,
      email: ass.teacher.email,
    },
    subject: {
      id: ass.subject.id,
      code: ass.subject.code,
      name: ass.subject.name,
    },
  }));

  // Fetch document versions for the approval table
  const documentVersions = await prisma.documentVersion.findMany({
    include: {
      document: {
        include: {
          subject: true,
        },
      },
      uploader: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navigation />

      <main className="flex-1 w-full max-w-7xl mx-auto pt-24 px-4 md:px-6 pb-12 space-y-8">
        {/* Welcome Banner */}
        <div className="bg-indigo-950/20 border border-indigo-500/15 rounded-2xl p-6 backdrop-blur-sm flex items-center gap-4">
          <div className="bg-indigo-600/10 p-3 border border-indigo-500/25 rounded-xl">
            <Shield className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Admin Control Center</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              Overview statistics, user authorizations, academic mapping, and subject revision schemes.
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card/40 border border-border/50 p-5 rounded-2xl flex items-center gap-4">
            <div className="bg-indigo-600/10 p-2.5 rounded-xl border border-indigo-500/20">
              <GraduationCap className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground block font-medium uppercase tracking-wider">Total Students</span>
              <span className="text-2xl font-bold text-foreground mt-0.5 block">{studentCount}</span>
            </div>
          </div>

          <div className="bg-card/40 border border-border/50 p-5 rounded-2xl flex items-center gap-4">
            <div className="bg-indigo-600/10 p-2.5 rounded-xl border border-indigo-500/20">
              <Users className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground block font-medium uppercase tracking-wider">Total Teachers</span>
              <span className="text-2xl font-bold text-foreground mt-0.5 block">{teacherCount}</span>
            </div>
          </div>

          <div className="bg-card/40 border border-border/50 p-5 rounded-2xl flex items-center gap-4">
            <div className="bg-indigo-600/10 p-2.5 rounded-xl border border-indigo-500/20">
              <FolderTree className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground block font-medium uppercase tracking-wider">Total Branches</span>
              <span className="text-2xl font-bold text-foreground mt-0.5 block">{branchCount}</span>
            </div>
          </div>

          <div className="bg-card/40 border border-border/50 p-5 rounded-2xl flex items-center gap-4">
            <div className="bg-indigo-600/10 p-2.5 rounded-xl border border-indigo-500/20">
              <BookOpen className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-xs text-muted-foreground block font-medium uppercase tracking-wider">Total Subjects</span>
              <span className="text-2xl font-bold text-foreground mt-0.5 block">{subjectCount}</span>
            </div>
          </div>
        </div>

        {/* Control Center Panel */}
        <AdminControlCenter
          students={students}
          teachers={teachers}
          branches={branches}
          subjects={subjects}
          assignments={assignments}
          documentVersions={documentVersions}
        />
      </main>
    </div>
  );
}
