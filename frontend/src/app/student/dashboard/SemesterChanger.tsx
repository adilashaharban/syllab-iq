"use client";

import { useState } from "react";
import { changeSemester } from "@/actions/student";
import { RefreshCw, Check, AlertCircle } from "lucide-react";

interface SemesterChangerProps {
  currentSemester: number;
  computedSemester: number;
}

export function SemesterChanger({ currentSemester, computedSemester }: SemesterChangerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSem, setSelectedSem] = useState(currentSemester);
  const [isPending, setIsPending] = useState(false);

  const handleSave = async () => {
    setIsPending(true);
    try {
      await changeSemester(selectedSem);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-medium py-1.5 px-4 rounded-xl transition-all text-xs"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Change Semester (Supplementary)
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 bg-card border border-border/80 rounded-2xl p-4 shadow-2xl z-50 animate-fadeIn">
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-indigo-400" />
              Switch Academic Semester
            </h4>
            <p className="text-xs text-muted-foreground mb-4">
              Your default suggested semester is <strong>Semester {computedSemester}</strong>. 
              You can override it for backlog or supplementary exams.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="modalSem" className="text-xs text-muted-foreground font-medium">
                  Select Semester
                </label>
                <select
                  id="modalSem"
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                    <option key={sem} value={sem} className="bg-background text-foreground">
                      Semester {sem} {sem === computedSemester ? "(Suggested)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 bg-background border border-border hover:bg-white/5 rounded-lg text-xs font-medium text-muted-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-lg text-xs font-medium transition-all"
                >
                  {isPending ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Apply
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
