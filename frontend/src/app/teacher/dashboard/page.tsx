import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Navigation } from "@/components/Navigation";
import Link from "next/link";
import { User, BookOpen, AlertCircle, FileText, BarChart3, HelpCircle, UploadCloud } from "lucide-react";
import { DocumentStatus } from "../../../../generated/prisma/enums";

export default async function TeacherDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "TEACHER") {
    redirect("/login");
  }

  // Fetch teacher details
  const teacher = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      teacherSubjects: {
        include: {
          subject: {
            include: {
              branch: true,
              semester: true,
            },
          },
        },
      },
    },
  });

  if (!teacher) {
    redirect("/login");
  }

  // Double check approval status
  if (teacher.status === "PENDING") {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Navigation />
        <main className="flex-1 w-full max-w-lg mx-auto flex flex-col items-center justify-center pt-24 px-4 text-center space-y-6">
          <div className="bg-yellow-500/10 border border-yellow-500/25 p-4 rounded-2xl flex items-center justify-center">
            <AlertCircle className="h-12 w-12 text-yellow-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Account Pending Approval</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your teacher profile for <strong>{teacher.fullName}</strong> is registered under the department of <strong>{teacher.department}</strong> at <strong>{teacher.college}</strong>. 
            An administrator must approve your account before you can access your dashboard.
          </p>
        </main>
      </div>
    );
  }

  const assignedSubjects = teacher.teacherSubjects.map((ts) => ts.subject);

  // Fetch Document metrics
  const uploadedCount = await prisma.documentVersion.count({
    where: { uploaderId: teacher.id },
  });

  const pendingCount = await prisma.documentVersion.count({
    where: { uploaderId: teacher.id, status: DocumentStatus.PENDING_APPROVAL },
  });

  const approvedCount = await prisma.documentVersion.count({
    where: { uploaderId: teacher.id, status: DocumentStatus.READY },
  });

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navigation />

      <main className="flex-1 w-full max-w-7xl mx-auto pt-24 px-4 md:px-6 pb-12 space-y-8">
        {/* Welcome Section */}
        <div className="bg-indigo-950/20 border border-indigo-500/15 rounded-2xl p-6 md:p-8 backdrop-blur-sm">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {teacher.fullName}!
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your assigned subjects, syllabus structures, and learning analytics.
          </p>
        </div>

        {/* Metric Placeholders */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card/40 border border-border/50 p-5 rounded-2xl">
            <span className="text-xs text-muted-foreground block font-medium uppercase tracking-wider">Assigned Subjects</span>
            <span className="text-2xl font-bold text-indigo-400 mt-2 block">{assignedSubjects.length}</span>
          </div>
          <div className="bg-card/40 border border-border/50 p-5 rounded-2xl">
            <span className="text-xs text-muted-foreground block font-medium uppercase tracking-wider">Uploaded Docs</span>
            <span className="text-2xl font-bold text-foreground mt-2 block">{uploadedCount}</span>
          </div>
          <div className="bg-card/40 border border-border/50 p-5 rounded-2xl">
            <span className="text-xs text-muted-foreground block font-medium uppercase tracking-wider">Pending Review</span>
            <span className="text-2xl font-bold text-yellow-400 mt-2 block">{pendingCount}</span>
          </div>
          <div className="bg-card/40 border border-border/50 p-5 rounded-2xl">
            <span className="text-xs text-muted-foreground block font-medium uppercase tracking-wider">Approved Docs</span>
            <span className="text-2xl font-bold text-emerald-400 mt-2 block">{approvedCount}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Grid: Assigned Subjects */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-indigo-400" />
                Your Assigned Subjects
              </h3>
            </div>

            {assignedSubjects.length === 0 ? (
              <div className="bg-card/30 border border-border/40 rounded-2xl p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  You are not currently assigned to any subjects. Please contact an administrator to get subjects assigned.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {assignedSubjects.map((subj) => (
                  <div
                    key={subj.id}
                    className="bg-card/40 border border-border/50 p-5 rounded-2xl flex flex-col justify-between min-h-[140px]"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[11px] font-semibold text-indigo-400 tracking-wider uppercase bg-indigo-500/10 px-2 py-0.5 rounded">
                          {subj.code}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Sem {subj.semester.semesterNumber} • {subj.branch.name}
                        </span>
                      </div>
                      <h4 className="text-base font-semibold text-foreground/90 mt-3 line-clamp-2">
                        {subj.name}
                      </h4>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
                      <span className="text-xs text-muted-foreground">
                        Scheme {subj.schemeYear}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {subj.credits} Credits
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar: Profile details & Portal Actions */}
          <div className="space-y-6">
            {/* Teacher Profile Card */}
            <div className="bg-card/40 border border-border/50 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-400" />
                Teacher Details
              </h3>
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground block">Department</span>
                  <span className="text-sm font-medium text-foreground">{teacher.department}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Employee ID</span>
                  <span className="text-sm font-medium text-foreground">{teacher.employeeId || "N/A"}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">College</span>
                  <span className="text-sm font-medium text-foreground">{teacher.college}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-card/40 border border-border/50 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
                Academic Management Tools
              </h3>
              <div className="space-y-3">
                <Link
                  href="/teacher/upload"
                  className="p-3 bg-indigo-600/5 hover:bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-start gap-3 transition-all"
                >
                  <UploadCloud className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold text-foreground/90">Upload Academic Resources</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Publish textbooks, lecture notes, and syllabus PDFs for RAG ingestion.</p>
                  </div>
                </Link>

                <div className="p-3 bg-background/50 border border-border/30 rounded-xl flex items-start gap-3 opacity-60">
                  <HelpCircle className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold text-foreground/90">Generate Question Sets</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Auto-generate exam sheets dynamically matching structural guidelines.</p>
                  </div>
                </div>

                <div className="p-3 bg-background/50 border border-border/30 rounded-xl flex items-start gap-3 opacity-60">
                  <BarChart3 className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold text-foreground/90">Analytics Dashboard</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Track student queries, common syllabus gaps, and response ratings.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
