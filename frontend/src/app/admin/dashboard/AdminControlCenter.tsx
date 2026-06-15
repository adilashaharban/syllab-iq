"use client";

import { useState } from "react";
import {
  updateTeacherStatus,
  toggleUserActive,
  createBranch,
  createSubject,
  assignTeacherSubject,
  removeTeacherSubject,
  reviewDocument,
  retryIngestion,
} from "@/actions/admin";
import {
  Users,
  GraduationCap,
  FolderTree,
  BookMarked,
  Link as LinkIcon,
  Search,
  Check,
  X,
  Plus,
  Trash2,
  AlertCircle,
  Clock,
  Briefcase,
  FileText,
  Archive,
  RefreshCw,
} from "lucide-react";

interface UserData {
  id: number;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  status: string;
  college: string;
  isActive: boolean;
  admissionYear?: number | null;
  selectedSemester?: number | null;
  branch?: { name: string } | null;
  department?: string | null;
  employeeId?: string | null;
  lastLogin?: Date | null;
}

interface SubjectData {
  id: number;
  code: string;
  name: string;
  schemeYear: number;
  credits: number;
  branch: { name: string };
  semester: { semesterNumber: number };
}

interface BranchData {
  id: number;
  name: string;
}

interface AssignmentData {
  id: number;
  teacher: { id: number; fullName: string; email: string };
  subject: { id: number; code: string; name: string };
}

interface DocumentVersionData {
  id: number;
  version: number;
  status: string;
  filePath: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  isLatest: boolean;
  chunkCount: number;
  parserVersion?: string | null;
  processingError?: string | null;
  uploadedFrom?: string | null;
  uploader: { fullName: string; email: string };
  document: {
    title: string;
    description?: string | null;
    category: string;
    subject: { name: string; code: string };
  };
  createdAt: Date;
}

interface AdminControlCenterProps {
  students: UserData[];
  teachers: UserData[];
  branches: BranchData[];
  subjects: SubjectData[];
  assignments: AssignmentData[];
  documentVersions: DocumentVersionData[];
}

function getStatusDisplay(status: string) {
  const statusUpper = (status || "").toUpperCase();
  switch (statusUpper) {
    case "READY":
      return { label: "Ready", className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" };
    case "FAILED":
      return { label: "Failed", className: "bg-red-500/10 text-red-400 border border-red-500/20" };
    case "PENDING_APPROVAL":
      return { label: "Pending Approval", className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" };
    case "APPROVED":
      return { label: "Approved", className: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" };
    case "QUEUED":
      return { label: "Queued", className: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" };
    case "PARSING":
      return { label: "Parsing", className: "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse" };
    case "OCR":
      return { label: "OCR", className: "bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse" };
    case "IMAGE_EXTRACTION":
      return { label: "Image Extraction", className: "bg-pink-500/10 text-pink-400 border border-pink-500/20 animate-pulse" };
    case "CHUNKING":
      return { label: "Chunking", className: "bg-teal-500/10 text-teal-400 border border-teal-500/20 animate-pulse" };
    case "EMBEDDING":
      return { label: "Embedding", className: "bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse" };
    case "INDEXING":
      return { label: "Indexing", className: "bg-violet-500/10 text-violet-400 border border-violet-500/20 animate-pulse" };
    case "UPLOADED":
      return { label: "Uploaded", className: "bg-gray-500/10 text-gray-400 border border-gray-500/20" };
    case "ARCHIVED":
      return { label: "Archived", className: "bg-orange-500/10 text-orange-400 border border-orange-500/20" };
    case "REJECTED":
      return { label: "Rejected", className: "bg-rose-500/10 text-rose-400 border border-rose-500/20" };
    case "PENDING":
      return { label: "Pending", className: "bg-amber-500/10 text-amber-400 border border-amber-500/20" };
    default:
      return { label: "Processing", className: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse" };
  }
}

export function AdminControlCenter({
  students,
  teachers,
  branches,
  subjects,
  assignments,
  documentVersions,
}: AdminControlCenterProps) {
  const [activeTab, setActiveTab] = useState<"students" | "teachers" | "branches" | "subjects" | "assignments" | "documents">("students");

  // Search states
  const [studentSearch, setStudentSearch] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [docSearch, setDocSearch] = useState("");

  // Form states
  const [newBranchName, setNewBranchName] = useState("");
  const [newSubCode, setNewSubCode] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newSubBranch, setNewSubBranch] = useState("");
  const [newSubSem, setNewSubSem] = useState("1");
  const [newSubScheme, setNewSubScheme] = useState("2024");
  const [newSubCredits, setNewSubCredits] = useState("4");

  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignSubjectId, setAssignSubjectId] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reviewPending, setReviewPending] = useState<number | null>(null);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Handlers
  const handleTeacherApproval = async (id: number, approve: boolean) => {
    clearMessages();
    try {
      await updateTeacherStatus(id, approve ? "APPROVED" : "REJECTED");
      setSuccessMessage(`Teacher account status updated successfully.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update teacher status");
    }
  };

  const handleUserToggle = async (id: number, currentActive: boolean) => {
    clearMessages();
    try {
      await toggleUserActive(id, currentActive);
      setSuccessMessage("User active state toggled successfully.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to toggle user status");
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      const res = await createBranch(newBranchName);
      if (res && !res.success) {
        setErrorMessage(res.error || "Failed to create branch");
        return;
      }
      setNewBranchName("");
      setSuccessMessage("Branch and Semesters 1-8 created successfully!");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create branch");
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      const res = await createSubject({
        code: newSubCode,
        name: newSubName,
        branchId: Number(newSubBranch),
        semesterNumber: Number(newSubSem),
        schemeYear: Number(newSubScheme),
        credits: Number(newSubCredits),
      });
      if (res && !res.success) {
        setErrorMessage(res.error || "Failed to create subject");
        return;
      }
      setNewSubCode("");
      setNewSubName("");
      setSuccessMessage("Subject created successfully!");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create subject");
    }
  };

  const handleAssignSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      await assignTeacherSubject(Number(assignTeacherId), Number(assignSubjectId));
      setAssignTeacherId("");
      setAssignSubjectId("");
      setSuccessMessage("Subject assigned to teacher successfully!");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to assign subject");
    }
  };

  const handleRemoveAssignment = async (id: number) => {
    clearMessages();
    try {
      await removeTeacherSubject(id);
      setSuccessMessage("Assignment removed successfully.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to remove assignment");
    }
  };

  const handleDocumentReview = async (versionId: number, action: "APPROVE" | "REJECT" | "ARCHIVE") => {
    clearMessages();
    let comment = undefined;
    if (action === "REJECT") {
      const inputVal = prompt("Please provide a reason for rejecting this document:");
      if (inputVal === null) return; // cancel review action
      comment = inputVal.trim() || undefined;
    }
    setReviewPending(versionId);
    try {
      await reviewDocument(versionId, action, comment);
      setSuccessMessage(`Document version review action completed successfully.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to review document");
    } finally {
      setReviewPending(null);
    }
  };

  const handleDocumentRetry = async (versionId: number) => {
    clearMessages();
    setReviewPending(versionId);
    try {
      await retryIngestion(versionId);
      setSuccessMessage("Document ingestion retry triggered successfully.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to retry document ingestion");
    } finally {
      setReviewPending(null);
    }
  };

  // Filters
  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.branch?.name || "").toLowerCase().includes(studentSearch.toLowerCase())
  );

  const filteredTeachers = teachers.filter(
    (t) =>
      t.fullName.toLowerCase().includes(teacherSearch.toLowerCase()) ||
      t.email.toLowerCase().includes(teacherSearch.toLowerCase()) ||
      (t.department || "").toLowerCase().includes(teacherSearch.toLowerCase())
  );

  const filteredSubjects = subjects.filter(
    (sub) =>
      sub.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
      sub.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
      sub.branch.name.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const filteredDocs = documentVersions.filter(
    (v) =>
      v.document.title.toLowerCase().includes(docSearch.toLowerCase()) ||
      v.document.subject.code.toLowerCase().includes(docSearch.toLowerCase()) ||
      v.uploader.fullName.toLowerCase().includes(docSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm font-medium">{errorMessage}</p>
        </div>
      )}
      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-emerald-400 text-sm font-medium">{successMessage}</p>
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-border/40 overflow-x-auto gap-2">
        {[
          { id: "students", label: "Students", icon: GraduationCap },
          { id: "teachers", label: "Teachers", icon: Users },
          { id: "branches", label: "Branches", icon: FolderTree },
          { id: "subjects", label: "Subjects", icon: BookMarked },
          { id: "assignments", label: "Assignments", icon: LinkIcon },
          { id: "documents", label: "Documents", icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                clearMessages();
              }}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENTS */}

      {/* STUDENTS TAB */}
      {activeTab === "students" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-background/50 border border-border/60 px-4 py-2.5 rounded-xl max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search students by name, email, branch..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm text-foreground w-full placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="bg-card/30 border border-border/50 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-border/40 text-muted-foreground font-medium">
                  <th className="p-4">Student Name</th>
                  <th className="p-4">Branch & Sem</th>
                  <th className="p-4">College</th>
                  <th className="p-4">Phone</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No student records found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => (
                    <tr key={s.id} className="border-b border-border/30 hover:bg-white/5 transition-all">
                      <td className="p-4">
                        <div className="font-semibold text-foreground">{s.fullName}</div>
                        <div className="text-[11px] text-muted-foreground">{s.email}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-foreground">{s.branch?.name || "Pending Onboarding"}</div>
                        {s.selectedSemester && (
                          <div className="text-[11px] text-indigo-400 font-semibold">Semester {s.selectedSemester}</div>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground">{s.college}</td>
                      <td className="p-4 text-muted-foreground">{s.phone}</td>
                      <td className="p-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleUserToggle(s.id, s.isActive)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                              s.isActive
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                            }`}
                          >
                            {s.isActive ? "Active" : "Suspended"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TEACHERS TAB */}
      {activeTab === "teachers" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-background/50 border border-border/60 px-4 py-2.5 rounded-xl max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search teachers by name, department..."
              value={teacherSearch}
              onChange={(e) => setTeacherSearch(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm text-foreground w-full placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="bg-card/30 border border-border/50 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-border/40 text-muted-foreground font-medium">
                  <th className="p-4">Teacher Name</th>
                  <th className="p-4">Department & ID</th>
                  <th className="p-4">College</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeachers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No teacher records found.
                    </td>
                  </tr>
                ) : (
                  filteredTeachers.map((t) => (
                    <tr key={t.id} className="border-b border-border/30 hover:bg-white/5 transition-all">
                      <td className="p-4">
                        <div className="font-semibold text-foreground">{t.fullName}</div>
                        <div className="text-[11px] text-muted-foreground">{t.email}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-foreground">{t.department}</div>
                        <div className="text-[11px] text-muted-foreground">ID: {t.employeeId || "N/A"}</div>
                      </td>
                      <td className="p-4 text-muted-foreground">{t.college}</td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.status === "APPROVED"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : t.status === "PENDING"
                              ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2 justify-center">
                          {t.status === "PENDING" && (
                            <>
                              <button
                                onClick={() => handleTeacherApproval(t.id, true)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-all"
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleTeacherApproval(t.id, false)}
                                className="p-1 bg-red-600 hover:bg-red-500 text-white rounded transition-all"
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleUserToggle(t.id, t.isActive)}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-all border ${
                              t.isActive
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                            }`}
                          >
                            {t.isActive ? "Active" : "Suspended"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BRANCHES TAB */}
      {activeTab === "branches" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-card/30 border border-border/50 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-border/40 text-muted-foreground font-medium">
                  <th className="p-4">Branch ID</th>
                  <th className="p-4">Branch Name</th>
                  <th className="p-4">Semesters Enabled</th>
                </tr>
              </thead>
              <tbody>
                {branches.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-muted-foreground">
                      No branches defined yet.
                    </td>
                  </tr>
                ) : (
                  branches.map((b) => (
                    <tr key={b.id} className="border-b border-border/30 hover:bg-white/5 transition-all">
                      <td className="p-4 text-muted-foreground">{b.id}</td>
                      <td className="p-4 font-semibold text-foreground">{b.name}</td>
                      <td className="p-4 text-xs text-indigo-300 font-semibold">Semesters 1 - 8</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-card/40 border border-border/50 rounded-2xl p-5 h-fit space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Plus className="h-4 w-4 text-indigo-400" />
              Add New Branch
            </h4>
            <form onSubmit={handleAddBranch} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="branchName" className="text-xs text-muted-foreground font-medium">
                  Branch Name
                </label>
                <input
                  id="branchName"
                  type="text"
                  required
                  placeholder="e.g. Computer Science"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Branch
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBJECTS TAB */}
      {activeTab === "subjects" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3 bg-background/50 border border-border/60 px-4 py-2.5 rounded-xl max-w-md">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search subjects by code or name..."
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                className="bg-transparent border-none focus:outline-none text-sm text-foreground w-full placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="bg-card/30 border border-border/50 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-white/5 border-b border-border/40 text-muted-foreground font-medium">
                    <th className="p-4">Code</th>
                    <th className="p-4">Subject Name</th>
                    <th className="p-4">Branch & Sem</th>
                    <th className="p-4">Scheme & Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubjects.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        No subject records found.
                      </td>
                    </tr>
                  ) : (
                    filteredSubjects.map((sub) => (
                      <tr key={sub.id} className="border-b border-border/30 hover:bg-white/5 transition-all">
                        <td className="p-4">
                          <span className="font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                            {sub.code}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-foreground">{sub.name}</td>
                        <td className="p-4">
                          <div className="text-foreground">{sub.branch.name}</div>
                          <div className="text-[11px] text-muted-foreground">Semester {sub.semester.semesterNumber}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-foreground">Scheme {sub.schemeYear}</div>
                          <div className="text-[11px] text-muted-foreground">{sub.credits} Credits</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card/40 border border-border/50 rounded-2xl p-5 h-fit space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Plus className="h-4 w-4 text-indigo-400" />
              Add New Subject
            </h4>
            <form onSubmit={handleAddSubject} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="subCode" className="text-xs text-muted-foreground font-medium">
                  Subject Code
                </label>
                <input
                  id="subCode"
                  type="text"
                  required
                  placeholder="e.g. CSL302"
                  value={newSubCode}
                  onChange={(e) => setNewSubCode(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="subName" className="text-xs text-muted-foreground font-medium">
                  Subject Name
                </label>
                <input
                  id="subName"
                  type="text"
                  required
                  placeholder="e.g. Compiler Design"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="subBranch" className="text-xs text-muted-foreground font-medium">
                  Branch
                </label>
                <select
                  id="subBranch"
                  required
                  value={newSubBranch}
                  onChange={(e) => setNewSubBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label htmlFor="subSem" className="text-xs text-muted-foreground font-medium">
                    Semester
                  </label>
                  <select
                    id="subSem"
                    value={newSubSem}
                    onChange={(e) => setNewSubSem(e.target.value)}
                    className="w-full px-2 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="subScheme" className="text-xs text-muted-foreground font-medium">
                    Scheme
                  </label>
                  <input
                    id="subScheme"
                    type="number"
                    required
                    value={newSubScheme}
                    onChange={(e) => setNewSubScheme(e.target.value)}
                    className="w-full px-2 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="subCredits" className="text-xs text-muted-foreground font-medium">
                    Credits
                  </label>
                  <input
                    id="subCredits"
                    type="number"
                    required
                    value={newSubCredits}
                    onChange={(e) => setNewSubCredits(e.target.value)}
                    className="w-full px-2 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Subject
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGNMENTS TAB */}
      {activeTab === "assignments" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-card/30 border border-border/50 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-border/40 text-muted-foreground font-medium">
                  <th className="p-4">Teacher</th>
                  <th className="p-4">Subject</th>
                  <th className="p-4 text-center">Remove</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-muted-foreground">
                      No subject assignments found.
                    </td>
                  </tr>
                ) : (
                  assignments.map((ass) => (
                    <tr key={ass.id} className="border-b border-border/30 hover:bg-white/5 transition-all">
                      <td className="p-4">
                        <div className="font-semibold text-foreground">{ass.teacher.fullName}</div>
                        <div className="text-[11px] text-muted-foreground">{ass.teacher.email}</div>
                      </td>
                      <td className="p-4">
                        <span className="font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded text-[10px] inline-block mr-2">
                          {ass.subject.code}
                        </span>
                        <span className="text-foreground font-semibold">{ass.subject.name}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleRemoveAssignment(ass.id)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-all"
                            title="Delete Assignment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-card/40 border border-border/50 rounded-2xl p-5 h-fit space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-indigo-400" />
              Assign Teacher ↔ Subject
            </h4>
            <form onSubmit={handleAssignSubject} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="assignTeacher" className="text-xs text-muted-foreground font-medium">
                  Select Teacher
                </label>
                <select
                  id="assignTeacher"
                  required
                  value={assignTeacherId}
                  onChange={(e) => setAssignTeacherId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                >
                  <option value="">Select Teacher</option>
                  {teachers
                    .filter((t) => t.status === "APPROVED")
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName} ({t.department || "No Dept"})
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="assignSub" className="text-xs text-muted-foreground font-medium">
                  Select Subject
                </label>
                <select
                  id="assignSub"
                  required
                  value={assignSubjectId}
                  onChange={(e) => setAssignSubjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-foreground"
                >
                  <option value="">Select Subject</option>
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      [{sub.code}] {sub.name} ({sub.branch.name} Sem {sub.semester.semesterNumber})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                Assign Subject
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {activeTab === "documents" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-background/50 border border-border/60 px-4 py-2.5 rounded-xl max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search documents by title, code, or uploader..."
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm text-foreground w-full placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="bg-card/30 border border-border/50 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse text-xs md:text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-border/40 text-muted-foreground font-medium">
                  <th className="p-4">Title & Subject</th>
                  <th className="p-4">Uploader</th>
                  <th className="p-4">Category & Size</th>
                  <th className="p-4">Status & Details</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No document versions uploaded yet.
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((v) => (
                    <tr key={v.id} className="border-b border-border/30 hover:bg-white/5 transition-all">
                      <td className="p-4">
                        <div className="font-semibold text-foreground">{v.document.title}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <span className="text-indigo-400 font-semibold uppercase">[{v.document.subject.code}]</span>
                          <span>v{v.version}</span>
                          {v.isLatest && <span className="bg-indigo-500/10 text-indigo-400 font-bold px-1 rounded text-[9px]">LATEST</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-foreground">{v.uploader.fullName}</div>
                        <div className="text-[11px] text-muted-foreground">{v.uploader.email}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-foreground">{v.document.category}</div>
                        <div className="text-[11px] text-muted-foreground">{(v.fileSize / 1024 / 1024).toFixed(2)} MB</div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          {(() => {
                            const badge = getStatusDisplay(v.status);
                            return (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase w-fit ${badge.className}`}>
                                {badge.label}
                              </span>
                            );
                          })()}
                          {v.status === "FAILED" && v.processingError && (
                            <span className="text-[10px] text-red-400 font-medium">Reason: {v.processingError}</span>
                          )}
                          {v.status === "READY" && (
                            <span className="text-[10px] text-muted-foreground">{v.chunkCount} Chunks Indexed</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2 justify-center">
                          {v.status === "PENDING_APPROVAL" && (
                            <>
                              <button
                                onClick={() => handleDocumentReview(v.id, "APPROVE")}
                                disabled={reviewPending === v.id}
                                className="flex items-center justify-center p-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-55 text-white rounded transition-all"
                                title="Approve & Process Ingestion"
                              >
                                {reviewPending === v.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleDocumentReview(v.id, "REJECT")}
                                disabled={reviewPending === v.id}
                                className="flex items-center justify-center p-1 bg-red-600 hover:bg-red-500 disabled:opacity-55 text-white rounded transition-all"
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {(v.status === "READY" || v.status === "APPROVED") && (
                            <button
                              onClick={() => handleDocumentReview(v.id, "ARCHIVE")}
                              className="flex items-center justify-center p-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/25 rounded transition-all"
                              title="Archive Document"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                          {v.status === "FAILED" && (
                            <button
                              onClick={() => handleDocumentRetry(v.id)}
                              disabled={reviewPending === v.id}
                              className="flex items-center justify-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-55 text-white text-xs font-semibold rounded transition-all"
                              title="Retry Processing"
                            >
                              {reviewPending === v.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              <span>Retry</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
