"use client";

import { useActionState, useState } from "react";
import { register } from "@/actions/auth";
import type { AuthState } from "@/actions/auth";
import { GraduationCap, Mail, Lock, User, Phone, School, Briefcase, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    register,
    null
  );

  const [role, setRole] = useState<"STUDENT" | "TEACHER">("STUDENT");

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-background to-background py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-500/20 mb-4">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Join SyllabiQ and learn smarter
          </p>
        </div>

        {/* Card */}
        <div className="bg-card/40 border border-border/50 backdrop-blur-xl rounded-2xl p-6 md:p-8 shadow-2xl shadow-black/20">
          <form action={formAction} className="space-y-4">
            {/* Error */}
            {state?.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{state.error}</p>
              </div>
            )}

            {/* Role Selection */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground/80">I am a...</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("STUDENT")}
                  className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                    role === "STUDENT"
                      ? "bg-indigo-600/15 border-indigo-500 text-indigo-400"
                      : "bg-background/40 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setRole("TEACHER")}
                  className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                    role === "TEACHER"
                      ? "bg-indigo-600/15 border-indigo-500 text-indigo-400"
                      : "bg-background/40 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Teacher
                </button>
              </div>
              <input type="hidden" name="role" value={role} />
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm font-medium text-foreground/80">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground transition-all"
                  placeholder="John Doe"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground/80">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground transition-all"
                  placeholder="you@university.edu"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-sm font-medium text-foreground/80">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground transition-all"
                  placeholder="1234567890"
                />
              </div>
            </div>

            {/* College */}
            <div className="space-y-1.5">
              <label htmlFor="college" className="text-sm font-medium text-foreground/80">
                College / University
              </label>
              <div className="relative">
                <School className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="college"
                  name="college"
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground transition-all"
                  placeholder="SyllabiQ Academy"
                />
              </div>
            </div>

            {/* Teacher Specific Fields */}
            {role === "TEACHER" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fadeIn">
                <div className="space-y-1.5">
                  <label htmlFor="department" className="text-sm font-medium text-foreground/80">
                    Department
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      id="department"
                      name="department"
                      type="text"
                      required={role === "TEACHER"}
                      className="w-full pl-10 pr-4 py-2 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground transition-all"
                      placeholder="Computer Science"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="employeeId" className="text-sm font-medium text-foreground/80">
                    Employee ID <span className="text-[10px] text-muted-foreground">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      id="employeeId"
                      name="employeeId"
                      type="text"
                      className="w-full pl-10 pr-4 py-2 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground transition-all"
                      placeholder="T1001"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Passwords */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground/80">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground transition-all"
                    placeholder="Min. 8 characters"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground/80">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-foreground transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2 rounded-xl transition-all duration-200 shadow-md hover:shadow-indigo-500/25 mt-2 text-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
