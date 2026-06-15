import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Navigation } from "@/components/Navigation";
import { SemesterChanger } from "./SemesterChanger";
import Link from "next/link";
import { BookOpen, User as UserIcon, Calendar, ArrowRight, MessageCircle, Clock } from "lucide-react";

export default async function StudentDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "STUDENT") {
    redirect("/login");
  }

  // Fetch full student details
  const student = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { branch: true },
  });

  if (!student) {
    redirect("/login");
  }

  // If student hasn't completed onboarding, send them back
  if (!student.branchId || !student.selectedSemester) {
    redirect("/onboarding");
  }

  // Calculate computed semester dynamically
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const admissionYear = student.admissionYear ?? currentYear;
  let suggested = (currentYear - admissionYear) * 2;
  if (currentMonth >= 7) {
    suggested += 1;
  }
  const computedSemester = Math.max(1, Math.min(8, suggested));

  const subjects = await prisma.subject.findMany({
    where: {
      branchId: student.branchId ?? undefined,
      semester: {
        semesterNumber: student.selectedSemester,
      },
      schemeYear: student.currentScheme ?? undefined,
      isArchived: false,
    },
    orderBy: {
      code: "asc",
    },
  });

  // Fetch chat sessions grouped/sorted by subject
  const chatSessions = await prisma.chatSession.findMany({
    where: { userId: student.id },
    include: { subject: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navigation />

      <main className="flex-1 w-full max-w-7xl mx-auto pt-24 px-4 md:px-6 pb-12 space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-indigo-950/20 border border-indigo-500/15 rounded-2xl p-6 md:p-8 backdrop-blur-sm">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Welcome back, {student.fullName}!
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Access your subjects and chat history to start learning smarter.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SemesterChanger
              currentSemester={student.selectedSemester}
              computedSemester={computedSemester}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Grid: Subjects list */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-indigo-400" />
                Active Subjects (Semester {student.selectedSemester})
              </h3>
              <span className="text-xs text-muted-foreground bg-white/5 px-2.5 py-1 rounded-full font-medium">
                {subjects.length} Subjects Available
              </span>
            </div>

            {subjects.length === 0 ? (
              <div className="bg-card/30 border border-border/40 rounded-2xl p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  No subjects found for {student.branch?.name || "your branch"} in Semester {student.selectedSemester}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {subjects.map((subj) => (
                  <Link
                    key={subj.id}
                    href={`/student/chat?subjectId=${subj.id}`}
                    className="group bg-card/40 hover:bg-white/5 border border-border/50 hover:border-indigo-500/35 p-5 rounded-2xl transition-all duration-300 shadow-sm hover:shadow-indigo-500/10 hover:-translate-y-0.5 flex flex-col justify-between min-h-[150px]"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[11px] font-semibold text-indigo-400 tracking-wider uppercase bg-indigo-500/10 px-2 py-0.5 rounded">
                          {subj.code}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {subj.credits} Credits
                        </span>
                      </div>
                      <h4 className="text-base font-semibold text-foreground/90 group-hover:text-indigo-200 transition-colors mt-3 line-clamp-2">
                        {subj.name}
                      </h4>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
                      <span className="text-xs text-muted-foreground">
                        Scheme {subj.schemeYear}
                      </span>
                      <span className="text-xs font-medium text-indigo-400 group-hover:text-indigo-300 flex items-center gap-1 transition-colors">
                        Ask AI
                        <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar: Profile details & Chat History */}
          <div className="space-y-6">
            {/* Student Profile Card */}
            <div className="bg-card/40 border border-border/50 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-indigo-400" />
                Student Profile
              </h3>
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground block">Branch</span>
                  <span className="text-sm font-medium text-foreground">{student.branch?.name}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">College</span>
                  <span className="text-sm font-medium text-foreground">{student.college}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-muted-foreground block">Admission Year</span>
                    <span className="text-sm font-medium text-foreground">{student.admissionYear}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Curriculum Scheme</span>
                    <span className="text-sm font-medium text-foreground">{student.currentScheme}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-muted-foreground block">Computed Semester</span>
                    <span className="text-sm font-medium text-foreground">Semester {computedSemester}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Selected Semester</span>
                    <span className="text-sm font-medium text-foreground">Semester {student.selectedSemester}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat History Card */}
            <div className="bg-card/40 border border-border/50 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-400" />
                Recent Chat Sessions
              </h3>

              {chatSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No previous conversations found. Click a subject card above to start a session.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                  {chatSessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/student/chat?sessionId=${session.id}&subjectId=${session.subjectId}`}
                      className="block p-3 bg-background/50 hover:bg-white/5 border border-border/30 rounded-xl transition-all hover:border-indigo-500/20"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-semibold text-indigo-400 uppercase bg-indigo-500/10 px-1.5 py-0.5 rounded truncate max-w-[80px]">
                          {session.subject?.code}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(session.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-xs font-medium text-foreground/90 mt-2 truncate">
                        {session.title || "Untitled Chat"}
                      </h4>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
