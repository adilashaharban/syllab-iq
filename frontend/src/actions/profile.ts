"use server";

import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export interface ProfileState {
  error?: string;
  success?: boolean;
}

export async function updateStudentProfile(
  _prevState: ProfileState | null,
  formData: FormData
): Promise<ProfileState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "STUDENT") {
    return { error: "Unauthorized" };
  }

  const fullName = (formData.get("fullName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const college = (formData.get("college") as string)?.trim();
  const selectedSemester = Number(formData.get("selectedSemester"));

  if (!fullName || !phone || !college || !selectedSemester) {
    return { error: "All profile fields are required." };
  }

  try {
    // Check if phone is taken by another user
    const existingPhone = await prisma.user.findFirst({
      where: { phone, NOT: { id: session.userId } },
    });
    if (existingPhone) {
      return { error: "Phone number is already taken." };
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        fullName,
        phone,
        college,
        selectedSemester,
      },
    });

    revalidatePath("/student/dashboard");
    revalidatePath("/student/profile");
    return { success: true };
  } catch (err) {
    console.error(err);
    return { error: "Failed to update student profile." };
  }
}

export async function updateTeacherProfile(
  _prevState: ProfileState | null,
  formData: FormData
): Promise<ProfileState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "TEACHER") {
    return { error: "Unauthorized" };
  }

  const fullName = (formData.get("fullName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const college = (formData.get("college") as string)?.trim();
  const department = (formData.get("department") as string)?.trim();
  const employeeId = (formData.get("employeeId") as string)?.trim() || null;

  if (!fullName || !phone || !college || !department) {
    return { error: "All profile fields are required." };
  }

  try {
    // Check phone
    const existingPhone = await prisma.user.findFirst({
      where: { phone, NOT: { id: session.userId } },
    });
    if (existingPhone) {
      return { error: "Phone number is already taken." };
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        fullName,
        phone,
        college,
        department,
        employeeId,
      },
    });

    revalidatePath("/teacher/dashboard");
    revalidatePath("/teacher/profile");
    return { success: true };
  } catch (err) {
    console.error(err);
    return { error: "Failed to update teacher profile." };
  }
}
