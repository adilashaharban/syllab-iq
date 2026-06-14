"use client";

import { useActionState, useState, useEffect } from "react";
import { submitOnboarding } from "@/actions/onboarding";
import { Loader2, BookOpen, Calendar, HelpCircle, ArrowRight } from "lucide-react";

interface Branch {
  id: number;
  name: string;
}

interface OnboardingFormProps {
  branches: Branch[];
}

export function OnboardingForm({ branches }: OnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(submitOnboarding, null);

  const [admissionYear, setAdmissionYear] = useState<number>(new Date().getFullYear() - 3);
  const [graduationYear, setGraduationYear] = useState<number>(new Date().getFullYear() + 1);
  const [suggestedSemester, setSuggestedSemester] = useState<number>(6);
  const [useSuggested, setUseSuggested] = useState<boolean>(true);
  const [overrideSemester, setOverrideSemester] = useState<number>(6);

  // Dynamic suggested semester calculation
  useEffect(() => {
    if (admissionYear && admissionYear > 2000 && admissionYear < 2100) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1; // 1-12
      let suggested = (currentYear - admissionYear) * 2;
      if (currentMonth >= 7) {
        suggested += 1;
      }
      const finalSuggested = Math.max(1, Math.min(8, suggested));
      setSuggestedSemester(finalSuggested);
      if (useSuggested) {
        setOverrideSemester(finalSuggested);
      }
    }
  }, [admissionYear, useSuggested]);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm font-medium">{state.error}</p>
        </div>
      )}

      {/* Branch Select */}
      <div className="space-y-1.5">
        <label htmlFor="branchId" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-400" />
          Academic Branch
        </label>
        <select
          id="branchId"
          name="branchId"
          required
          className="w-full px-4 py-2.5 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-foreground"
        >
          <option value="" className="bg-background text-foreground">Select your branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id} className="bg-background text-foreground">
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Admission Year & Expected Pass-out */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="admissionYear" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-400" />
            Admission Year
          </label>
          <input
            id="admissionYear"
            name="admissionYear"
            type="number"
            required
            min={2000}
            max={2100}
            value={admissionYear}
            onChange={(e) => setAdmissionYear(Number(e.target.value))}
            className="w-full px-4 py-2.5 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-muted-foreground/50 text-foreground"
            placeholder="2023"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="graduationYear" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-400" />
            Expected Graduation
          </label>
          <input
            id="graduationYear"
            name="graduationYear"
            type="number"
            required
            min={2000}
            max={2100}
            value={graduationYear}
            onChange={(e) => setGraduationYear(Number(e.target.value))}
            className="w-full px-4 py-2.5 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-muted-foreground/50 text-foreground"
            placeholder="2027"
          />
        </div>
      </div>

      {/* Scheme Year */}
      <div className="space-y-1.5">
        <label htmlFor="currentScheme" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-indigo-400" />
          Curriculum Scheme Year
        </label>
        <input
          id="currentScheme"
          name="currentScheme"
          type="number"
          required
          min={2000}
          max={2100}
          defaultValue={2024}
          className="w-full px-4 py-2.5 bg-background/60 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-muted-foreground/50 text-foreground"
          placeholder="2024"
        />
      </div>

      {/* Suggested Semester Helper */}
      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-indigo-200 font-medium">
            Suggested Semester: <strong className="text-white text-base">Semester {suggestedSemester}</strong>
          </span>
        </div>

        {/* Use Suggested Choice */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="radio"
              checked={useSuggested}
              onChange={() => {
                setUseSuggested(true);
                setOverrideSemester(suggestedSemester);
              }}
              className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
            />
            <span className="text-sm text-foreground/80">Yes, enroll me in Semester {suggestedSemester}</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="radio"
              checked={!useSuggested}
              onChange={() => setUseSuggested(false)}
              className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
            />
            <span className="text-sm text-foreground/80">Choose another semester (supplementary/backlog)</span>
          </label>
        </div>

        {/* Override Semester Select */}
        {!useSuggested && (
          <div className="pt-2 animate-fadeIn">
            <label htmlFor="selectedSemester" className="block text-xs font-semibold text-indigo-300 mb-1">
              Select Custom Semester
            </label>
            <select
              id="selectedSemester"
              value={overrideSemester}
              onChange={(e) => setOverrideSemester(Number(e.target.value))}
              className="w-full px-3 py-2 bg-background/80 border border-indigo-500/30 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                <option key={sem} value={sem} className="bg-background text-foreground">
                  Semester {sem}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Hidden input to submit the final selected semester */}
      <input type="hidden" name="selectedSemester" value={overrideSemester} />

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-all duration-200 shadow-md hover:shadow-indigo-500/25 mt-4"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving Profile…
          </>
        ) : (
          <>
            Complete Onboarding
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
