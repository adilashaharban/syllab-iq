"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { UserRole, UserStatus } from "../../generated/prisma/enums";
import {
  hashPassword,
  verifyPassword,
  signToken,
  AUTH_COOKIE,
  cookieOptions,
} from "@/lib/auth";

export type AuthState = { error?: string; success?: boolean } | null;

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const phone = (formData.get("phone") as string)?.trim();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const college = (formData.get("college") as string)?.trim();
  const role = (formData.get("role") as string)?.trim(); // "STUDENT" or "TEACHER"
  const department = (formData.get("department") as string)?.trim() || null;
  const employeeId = (formData.get("employeeId") as string)?.trim() || null;

  // Basic validation
  if (!fullName || !email || !phone || !password || !confirmPassword || !college || !role) {
    return { error: "All required fields must be filled." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  // Check unique constraints
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return { error: "An account with this email already exists." };
  }

  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) {
    return { error: "An account with this phone number already exists." };
  }

  // Determine user status
  // Students are approved automatically, Teachers start as pending
  const status = role === "TEACHER" ? "PENDING" : "APPROVED";

  // Create user
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      phone,
      role: role as UserRole,
      status: status as UserStatus,
      college,
      department,
      employeeId,
      isActive: true,
    },
  });

  // Sign JWT and set cookie
  const token = signToken({ userId: user.id, email: user.email, name: user.fullName, role: user.role });
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, cookieOptions);

  // If student, they need onboarding
  if (role === "STUDENT") {
    redirect("/onboarding");
  } else {
    redirect("/teacher/dashboard");
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "Invalid email or password." };
  }

  if (!user.isActive) {
    return { error: "Your account is deactivated. Please contact an administrator." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password." };
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const token = signToken({ userId: user.id, email: user.email, name: user.fullName, role: user.role });
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, cookieOptions);

  // Redirect based on role
  if (user.role === "ADMIN") {
    redirect("/admin/dashboard");
  } else if (user.role === "TEACHER") {
    redirect("/teacher/dashboard");
  } else {
    // If student, check if they completed onboarding
    if (!user.branchId || !user.selectedSemester) {
      redirect("/onboarding");
    } else {
      redirect("/student/dashboard");
    }
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  redirect("/");
}
