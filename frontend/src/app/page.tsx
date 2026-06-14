import Link from "next/link";
import { GraduationCap, ArrowRight, ShieldCheck, Sparkles, BookOpen, BrainCircuit } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-background to-background">
      {/* Header */}
      <header className="w-full max-w-7xl mx-auto h-16 flex items-center justify-between px-4 md:px-6 shrink-0 border-b border-border/25">
        <div className="flex items-center space-x-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-inner">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold tracking-tight text-foreground">SyllabiQ</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-xs font-semibold text-muted-foreground hover:text-white px-3 py-1.5 transition-all"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl transition-all shadow-md shadow-indigo-500/15"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-20 flex flex-col items-center justify-center space-y-16">
        
        {/* Hero Section */}
        <div className="text-center max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/25 rounded-full text-xs font-medium text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            Phase 1: Academic Platform Foundation
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-br from-white via-indigo-100 to-indigo-400 bg-clip-text text-transparent leading-none py-1">
            Learn Smarter. <br />Syllabus-Aligned AI.
          </h1>
          <p className="text-muted-foreground text-sm md:text-lg max-w-xl mx-auto leading-relaxed">
            SyllabiQ pairs student academic curriculum branch, semesters, and scheme versions with advanced RAG artificial intelligence.
          </p>
          <div className="flex justify-center gap-4 pt-4">
            <Link
              href="/register"
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
            >
              Join SyllabiQ
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Features / Why Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl pt-4">
          <div className="bg-card/40 border border-border/50 backdrop-blur-md p-6 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/25 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold">Curriculum Locked</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Subjects are organized strictly matching your Branch, Semester, and Scheme regulations. No irrelevant results.
            </p>
          </div>

          <div className="bg-card/40 border border-border/50 backdrop-blur-md p-6 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/25 flex items-center justify-center">
              <BrainCircuit className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold">Intelligent Retrieval</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Context-aware sessions allow the retrieval pipeline to precisely scope notes, papers, and books in Phase 2.
            </p>
          </div>

          <div className="bg-card/40 border border-border/50 backdrop-blur-md p-6 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/25 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold">Role-Based System</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tailored workspaces and control panels for Students, Teachers, and Administrators alike.
            </p>
          </div>
        </div>

        {/* Role Portal Cards */}
        <div className="w-full max-w-4xl space-y-6">
          <div className="text-center">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight">Access Portals</h2>
            <p className="text-xs text-muted-foreground mt-1">Select your role to register or sign in.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card/30 border border-border/40 p-5 rounded-2xl flex flex-col justify-between items-center text-center">
              <div>
                <span className="text-xs font-semibold text-indigo-400 tracking-wider uppercase bg-indigo-500/10 px-2 py-0.5 rounded">
                  STUDENTS
                </span>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Browse subjects, calculate semesters, and ask syllabus-locked questions.
                </p>
              </div>
              <Link
                href="/login"
                className="mt-4 text-xs font-semibold text-white bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/35 px-4 py-2 rounded-xl transition-all w-full"
              >
                Student Login
              </Link>
            </div>

            <div className="bg-card/30 border border-border/40 p-5 rounded-2xl flex flex-col justify-between items-center text-center">
              <div>
                <span className="text-xs font-semibold text-indigo-400 tracking-wider uppercase bg-indigo-500/10 px-2 py-0.5 rounded">
                  TEACHERS
                </span>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Oversee curriculum nodes, manage subject uploads, and review logs.
                </p>
              </div>
              <Link
                href="/login"
                className="mt-4 text-xs font-semibold text-white bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/35 px-4 py-2 rounded-xl transition-all w-full"
              >
                Teacher Login
              </Link>
            </div>

            <div className="bg-card/30 border border-border/40 p-5 rounded-2xl flex flex-col justify-between items-center text-center">
              <div>
                <span className="text-xs font-semibold text-indigo-400 tracking-wider uppercase bg-indigo-500/10 px-2 py-0.5 rounded">
                  ADMINISTRATORS
                </span>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Manage mappings, authorize roles, verify profiles, and audit statistics.
                </p>
              </div>
              <Link
                href="/login"
                className="mt-4 text-xs font-semibold text-white bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/35 px-4 py-2 rounded-xl transition-all w-full"
              >
                Admin Login
              </Link>
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border/25 py-6 text-center text-xs text-muted-foreground shrink-0">
        © {new Date().getFullYear()} SyllabiQ. Powered by Advanced RAG AI. All rights reserved.
      </footer>
    </div>
  );
}
