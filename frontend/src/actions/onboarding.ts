"use server";

import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { redirect } from "next/navigation";

export interface OnboardingState {
  error?: string;
  success?: boolean;
}

export async function getBranches() {
  return prisma.branch.findMany({
    orderBy: { name: "asc" },
  });
}

export async function submitOnboarding(
  _prevState: OnboardingState | null,
  formData: FormData
): Promise<OnboardingState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "STUDENT") {
    return { error: "Unauthorized access." };
  }

  const branchId = Number(formData.get("branchId"));
  const admissionYear = Number(formData.get("admissionYear"));
  const graduationYear = Number(formData.get("graduationYear"));
  const currentScheme = Number(formData.get("currentScheme"));
  const selectedSemester = Number(formData.get("selectedSemester"));

  if (!branchId || !admissionYear || !graduationYear || !currentScheme || !selectedSemester) {
    return { error: "Please fill in all onboarding fields." };
  }

  try {
    // 1. Update student profile details
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        branchId,
        admissionYear,
        graduationYear,
        currentScheme,
        selectedSemester,
      },
    });

    // 2. Fetch semesters matching this branch and semester number
    const semester = await prisma.semester.findUnique({
      where: {
        branchId_semesterNumber: {
          branchId,
          semesterNumber: selectedSemester,
        },
      },
    });

    if (semester) {
      // 3. Find active subjects
      const subjects = await prisma.subject.findMany({
        where: {
          branchId,
          semesterId: semester.id,
          isArchived: false,
        },
      });

      // 4. Enroll the student (ignoring duplicates)
      for (const sub of subjects) {
        await prisma.courseEnrollment.upsert({
          where: {
            studentId_subjectId: {
              studentId: session.userId,
              subjectId: sub.id,
            },
          },
          update: {},
          create: {
            studentId: session.userId,
            subjectId: sub.id,
            status: "ACTIVE",
          },
        });
      }
    }
  } catch (err) {
    console.error("Onboarding error:", err);
    return { error: "Failed to update profile and enroll in courses. Please try again." };
  }

  redirect("/student/dashboard");
}
