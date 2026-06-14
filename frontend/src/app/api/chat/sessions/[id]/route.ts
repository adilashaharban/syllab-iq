import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const authSession = token ? verifyToken(token) : null;

  if (!authSession) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // ── Parse id ──────────────────────────────────────────────────────────────
  const { id } = await params;
  const sessionId = parseInt(id, 10);

  if (isNaN(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  // ── Verify ownership ──────────────────────────────────────────────────────
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });

  if (!chatSession || chatSession.userId !== authSession.userId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // ── Delete session (cascades to messages in DB) ───────────────────
  await prisma.chatSession.delete({
    where: { id: sessionId },
  });

  return NextResponse.json({ success: true });
}
