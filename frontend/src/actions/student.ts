"use server";

import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function changeSemester(semester: number) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "STUDENT") {
    throw new Error("Unauthorized");
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { selectedSemester: semester },
  });

  revalidatePath("/student/dashboard");
}

export async function saveStudyPack(data: {
  subjectId: number;
  topic: string;
  summary: string;
  sources: any;
  cards: { front: string; back: string }[];
  questions: { question: string; answer: string; options: string[] }[];
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "STUDENT") {
    throw new Error("Unauthorized");
  }

  const pack = await prisma.studyPack.create({
    data: {
      userId: session.userId,
      subjectId: data.subjectId,
      topic: data.topic,
      summary: data.summary,
      sources: data.sources,
      cards: {
        create: data.cards,
      },
      questions: {
        create: data.questions.map(q => ({
          question: q.question,
          answer: q.answer,
          options: q.options,
        })),
      },
    },
  });

  revalidatePath("/student/dashboard");
  return pack.id;
}

