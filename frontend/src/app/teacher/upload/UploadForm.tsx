"use client";

import { useActionState } from "react";
import { uploadDocument } from "@/actions/teacher";
import { Loader2, BookOpen, FileText, List, Upload, HelpCircle } from "lucide-react";
import Link from "next/link";

interface Subject {
  id: number;
  code: string;
  name: string;
}

interface UploadFormProps {
  subjects: Subject[];
}

export function UploadForm({ subjects }: UploadFormProps) {
  const [state, formAction, isPending] = useActionState(uploadDocument, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm font-medium">{state.error}</p>
        </div>
      )}

      {state?.success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-2">
          <p className="text-emerald-400 text-sm font-medium">Resource uploaded successfully!</p>
          <p className="text-[11px] text-emerald-300/80">Your resource will become searchable once it is reviewed and approved by an administrator.</p>
        </div>
      )}

      {/* Select Subject */}
      <div className="space-y-1.5">
        <label htmlFor="subjectId" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-400" />
          Assign to Subject
        </label>
        <select
          id="subjectId"
          name="subjectId"
          required
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        >
          <option value="">Select assigned subject</option>
          {subjects.map((sub) => (
            <option key={sub.id} value={sub.id}>
              [{sub.code}] {sub.name}
            </option>
          ))}
        </select>
      </div>

      {/* Document Title */}
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-400" />
          Resource Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="e.g. Unit 3 Process Sync Slides"
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-indigo-400" />
          Description <span className="text-muted-foreground font-normal text-xs">(Optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Provide a brief context or version detail..."
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
        />
      </div>

      {/* Document Category */}
      <div className="space-y-1.5">
        <label htmlFor="category" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <List className="h-4 w-4 text-indigo-400" />
          Resource Category
        </label>
        <select
          id="category"
          name="category"
          required
          className="w-full px-4 py-2.5 bg-background border border-border/60 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        >
          <option value="">Select category</option>
          <option value="TEXTBOOK">Textbook</option>
          <option value="REFERENCE_BOOK">Reference Book</option>
          <option value="LECTURE_NOTES">Lecture Notes</option>
          <option value="PPT">PowerPoint (PPT/PPTX)</option>
          <option value="SYLLABUS">Official Syllabus</option>
          <option value="MARKING_SCHEME">Marking Scheme</option>
          <option value="PREVIOUS_YEAR_PAPER">Previous Year Paper</option>
          <option value="LAB_MANUAL">Lab Manual</option>
        </select>
      </div>

      {/* File Upload input */}
      <div className="space-y-1.5">
        <label htmlFor="file" className="text-sm font-medium text-foreground/80 flex items-center gap-2">
          <Upload className="h-4 w-4 text-indigo-400" />
          Upload Document File
        </label>
        <div className="border-2 border-dashed border-border/60 hover:border-indigo-500/50 rounded-xl p-6 text-center cursor-pointer transition-all relative">
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".pdf,.ppt,.pptx"
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs font-semibold text-foreground/85">Drag & drop or click to choose file</p>
          <p className="text-[10px] text-muted-foreground mt-1">Accepts PDF or PowerPoint (.ppt, .pptx) files only.</p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 justify-end">
        <Link
          href="/teacher/dashboard"
          className="px-4 py-2.5 bg-background border border-border/60 hover:bg-white/5 text-sm font-semibold rounded-xl text-muted-foreground transition-all"
        >
          Back to Dashboard
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-xl transition-all duration-200"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload Resource
            </>
          )}
        </button>
      </div>
    </form>
  );
}
