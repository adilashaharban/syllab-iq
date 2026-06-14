import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ChatContainer } from "@/components/chat/ChatContainer";

interface ChatPageProps {
  searchParams: Promise<{
    subjectId?: string;
    sessionId?: string;
  }>;
}

export default async function StudentChatPage({ searchParams }: ChatPageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "STUDENT") {
    redirect("/login");
  }

  const { subjectId: subIdStr, sessionId: sessIdStr } = await searchParams;
  const subjectId = subIdStr ? parseInt(subIdStr, 10) : null;
  const sessionId = sessIdStr ? parseInt(sessIdStr, 10) : null;

  if (!subjectId) {
    redirect("/student/dashboard");
  }

  // Fetch student details to verify branch & selected semester (Subject Locking!)
  const student = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!student || !student.branchId || !student.selectedSemester) {
    redirect("/onboarding");
  }

  // Verify student course enrollment
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: {
      studentId_subjectId: {
        studentId: student.id,
        subjectId: subjectId,
      },
    },
    include: {
      subject: {
        include: {
          semester: true,
        },
      },
    },
  });

  if (!enrollment || enrollment.status !== "ACTIVE" || enrollment.subject.isArchived) {
    redirect("/student/dashboard");
  }

  const userInitials = student.fullName
    ? student.fullName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : student.email[0].toUpperCase();

  const userName = student.fullName || student.email;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-background">
      <div className="w-full max-w-7xl mx-auto h-screen relative">
        <ChatContainer
          userInitials={userInitials}
          userName={userName}
          userId={session.userId}
          subjectId={subjectId}
          initialSessionId={sessionId}
        />
      </div>
    </main>
  );
}
