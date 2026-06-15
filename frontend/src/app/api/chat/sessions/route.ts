import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Parse optional subjectId
  const { searchParams } = new URL(request.url);
  const subjectIdStr = searchParams.get("subjectId");
  const subjectId = subjectIdStr ? parseInt(subjectIdStr, 10) : null;

  if (subjectId) {
    // Subject locking: Verify the student has access based on branch, scheme, and non-archived status
    const student = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { branchId: true, currentScheme: true },
    });
    if (!student || !student.branchId) {
      return NextResponse.json({ error: "Student not found or not onboarded" }, { status: 403 });
    }

    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        branchId: student.branchId ?? undefined,
        schemeYear: student.currentScheme ?? undefined,
        isArchived: false,
      },
    });

    if (!subject) {
      return NextResponse.json({ error: "Unauthorized subject access" }, { status: 403 });
    }
  }

  // ── Fetch sessions ────────────────────────────────────────────────────────
  const chatSessions = await prisma.chatSession.findMany({
    where: {
      userId: session.userId,
      ...(subjectId ? { subjectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { message: true, sender: true, timestamp: true },
      },
    },
  });

  const result = chatSessions.map((s) => ({
    id: s.id,
    title: s.title,
    updatedAt: s.updatedAt,
    lastMessage: s.messages[0]
      ? {
          content: s.messages[0].message.slice(0, 120),
          isResponse: s.messages[0].sender === "ASSISTANT",
          createdAt: s.messages[0].timestamp,
        }
      : null,
  }));

  return NextResponse.json(result);
}

export async function DELETE() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Delete all sessions for this user (will cascade delete messages due to DB schema onDelete: Cascade)
  const deleteResult = await prisma.chatSession.deleteMany({
    where: { userId: session.userId },
  });

  return NextResponse.json({ success: true, deleted: deleteResult.count });
}
