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

  // ── Parse sessionId ───────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("sessionId");
  const sessionId = rawId ? parseInt(rawId, 10) : NaN;

  if (isNaN(sessionId)) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  // ── Verify ownership and enrollment (subject locking) ──────────────────────
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { userId: true, subjectId: true },
  });

  if (!chatSession || chatSession.userId !== session.userId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const student = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { branchId: true, currentScheme: true },
  });

  if (!student || !student.branchId) {
    return NextResponse.json({ error: "Student not found or not onboarded" }, { status: 403 });
  }

  const subject = await prisma.subject.findFirst({
    where: {
      id: chatSession.subjectId,
      branchId: student.branchId ?? undefined,
      schemeYear: student.currentScheme ?? undefined,
      isArchived: false,
    },
  });

  if (!subject) {
    return NextResponse.json({ error: "Unauthorized subject access" }, { status: 403 });
  }

  // ── Fetch messages ────────────────────────────────────────────────────────
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { timestamp: "asc" },
    select: { id: true, sender: true, message: true, timestamp: true, metadata: true },
  });

  // Map to the format the frontend hooks expect
  const mapped = messages.map((m) => ({
    id: m.id,
    isResponse: m.sender === "ASSISTANT",
    content: m.message,
    createdAt: m.timestamp,
    metadata: m.metadata,
  }));

  return NextResponse.json(mapped);
}
