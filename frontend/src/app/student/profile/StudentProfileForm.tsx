"use client";

import { useActionState } from "react";
import { updateStudentProfile } from "@/actions/profile";
import { Loader2, User, Phone, School, HelpCircle, Save } from "lucide-react";

interface StudentProfileFormProps {
  initialData: {
    fullName: string;
    email: string;
    phone: string;
    college: string;
    selectedSemester: number;
    branchName: string;
    currentScheme: number;
  };
}

export function StudentProfileForm({ initialData }: StudentProfileFormProps) {
  const [state, formAction, isPending] = useActionState(updateStudentProfile, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm font-medium">{state.error}</p>
        </div>
      )}

      {state?.success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <p className="text-emerald-400 text-sm font-medium">Profile updated successfully!</p>
        </div>
      )}

      {/* Read-only email */}
      <div className="space-y-1.5 opacity-70">
        <label className="text-sm font-medium text-foreground/80">Email (Cannot change)</label>
        <input
          type="email"
          disabled
          value={initialData.email}
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-muted-foreground cursor-not-allowed"
        />
      </div>

      {/* Full Name */}
      <div className="space-y-1.5">
        <label htmlFor="fullName" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <User className="h-4 w-4 text-indigo-400" />
          Full Name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          defaultValue={initialData.fullName}
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <label htmlFor="phone" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <Phone className="h-4 w-4 text-indigo-400" />
          Phone Number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={initialData.phone}
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>

      {/* College */}
      <div className="space-y-1.5">
        <label htmlFor="college" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <School className="h-4 w-4 text-indigo-400" />
          College / University
        </label>
        <input
          id="college"
          name="college"
          type="text"
          required
          defaultValue={initialData.college}
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>

      {/* Read-only Branch */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5 opacity-70">
          <label className="text-sm font-medium text-foreground/80">Branch</label>
          <input
            type="text"
            disabled
            value={initialData.branchName}
            className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-muted-foreground cursor-not-allowed"
          />
        </div>

        <div className="space-y-1.5 opacity-70">
          <label className="text-sm font-medium text-foreground/80">Curriculum Scheme</label>
          <input
            type="text"
            disabled
            value={`Scheme ${initialData.currentScheme}`}
            className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-muted-foreground cursor-not-allowed"
          />
        </div>
      </div>

      {/* Selected Semester */}
      <div className="space-y-1.5">
        <label htmlFor="selectedSemester" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-indigo-400" />
          Selected Semester
        </label>
        <select
          id="selectedSemester"
          name="selectedSemester"
          required
          defaultValue={initialData.selectedSemester}
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
            <option key={sem} value={sem} className="bg-background text-foreground">
              Semester {sem}
            </option>
          ))}
        </select>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-all duration-200"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving Profile…
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save Profile
          </>
        )}
      </button>
    </form>
  );
}
