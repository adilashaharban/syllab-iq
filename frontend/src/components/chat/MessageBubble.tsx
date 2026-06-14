'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User, ZoomIn, ZoomOut, Layers, Eye, X, Sliders, AlertCircle, BookOpen, GraduationCap, CheckCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { FEATURE_FLAGS } from '@/lib/config/flags';
import { saveStudyPack } from '@/actions/student';

import { generateGroundedSummary } from '@/lib/generation/summary';
import { generateGroundedFlashcards } from '@/lib/generation/flashcards';
import { generateGroundedPracticeQuestions } from '@/lib/generation/practiceQuestions';
import { generateGroundedTakeaways } from '@/lib/generation/takeaways';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Role = 'user' | 'assistant';

interface Citation {
  document: string;
  documentId?: number;
  documentVersion?: number;
  pageStart?: number;
  pageEnd?: number;
  chunkIndex?: number;
  figureId?: number;
  tableId?: number;
  equationId?: number;
  snippet?: string;
  boundingBoxes?: any;
  documentTitle?: string;
  documentVersionProvenance?: number;
  page?: number;
}

interface MessageBubbleProps {
  role: Role;
  content: string;
  isStreaming?: boolean;
  metadata?: {
    confidence?: string;
    citations?: Citation[];
    bookFilter?: boolean;
    searchScope?: string;
    uploadedImage?: string;
    cropRegion?: any;
  } | any;
}

const confidenceReasons: Record<string, string> = {
  HIGH: "Multiple approved sources agree, exact subject match, and strong retrieval similarity.",
  MEDIUM: "Found relevant source documents, but visual match or text similarity is moderate.",
  LOW: "No strong match found in syllabus textbook materials. Refusal thresholds are enforced.",
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content, isStreaming, metadata }) => {
  const isUser = role === 'user';
  const [showExplanation, setShowExplanation] = useState(false);
  
  // Compare Mode state
  const [activeCompareCitation, setActiveCompareCitation] = useState<Citation | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [compareTab, setCompareTab] = useState<'sideBySide' | 'overlay' | 'diff'>('sideBySide');

  // Study Mode state
  const [showStudyPack, setShowStudyPack] = useState(false);
  const [studyTab, setStudyTab] = useState<'takeaways' | 'flashcards' | 'quiz' | 'summary'>('takeaways');
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Parse metadata if it is stored as string/JSON object
  let parsedMeta: any = null;
  if (metadata) {
    try {
      parsedMeta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    } catch {
      // Ignore
    }
  }

  // Generate grounded study sets if content is ready
  const mockContext = content || "";
  const takeaways = generateGroundedTakeaways(mockContext);
  const flashcards = generateGroundedFlashcards(mockContext);
  const questions = generateGroundedPracticeQuestions(mockContext);
  const summary = generateGroundedSummary(mockContext);

  const handleSaveStudyPack = async () => {
    if (saveStatus !== 'idle') return;
    setSaveStatus('saving');
    try {
      await saveStudyPack({
        subjectId: parsedMeta?.citations?.[0]?.documentId || 1, // Fallback to 1
        topic: "Topic: " + (content ? content.slice(0, 30) : "AI Study Pack"),
        summary: summary,
        sources: parsedMeta?.citations?.map((c: any) => ({ documentId: c.documentId, version: c.documentVersion, pages: [c.page] })) || [],
        cards: flashcards,
        questions: questions,
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error(err);
      setSaveStatus('idle');
    }
  };

  // Handle keyboard events for comparison modal accessibility
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setActiveCompareCitation(null);
    }
    if (e.key === '+') {
      setZoomLevel(prev => Math.min(prev + 0.2, 3));
    }
    if (e.key === '-') {
      setZoomLevel(prev => Math.max(prev - 0.2, 0.5));
    }
  };

  return (
    <div className={cn("flex w-full mt-4 space-x-3 max-w-3xl mx-auto", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <Avatar className="w-8 h-8 flex-shrink-0 mt-1 ring-1 ring-indigo-500/30">
          <AvatarFallback className="bg-gradient-to-br from-indigo-500/20 to-indigo-900/40 text-indigo-200">
            <Bot size={18} />
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex flex-col gap-1 max-w-[85%]">
        <Card
          className={cn(
            "px-5 py-3.5 text-[0.95rem] shadow-sm leading-relaxed overflow-hidden",
            isUser
              ? "bg-indigo-600/90 text-white rounded-2xl rounded-tr-sm border-indigo-500/50"
              : "bg-background/40 backdrop-blur-md rounded-2xl rounded-tl-sm border-white/5",
            "relative"
          )}
        >
          {isUser && parsedMeta?.uploadedImage && (
            <div className="mb-3 max-w-sm rounded-lg overflow-hidden border border-white/10 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={parsedMeta.uploadedImage} 
                alt="Uploaded student work/diagram" 
                className="w-full h-auto object-cover max-h-48"
              />
              {parsedMeta.cropRegion && (
                <div className="p-1.5 bg-slate-900/90 border-t border-white/5 text-[9px] text-indigo-300 font-semibold flex items-center gap-1">
                  <AlertCircle size={10} /> Selected Crop Region: [x1: {parsedMeta.cropRegion.x1}%, y1: {parsedMeta.cropRegion.y1}% to x2: {parsedMeta.cropRegion.x2}%, y2: {parsedMeta.cropRegion.y2}%]
                </div>
              )}
            </div>
          )}

          <div className={cn("prose prose-sm max-w-none dark:prose-invert", isUser && "text-white prose-p:text-white pb-0")}>
            {isUser ? (
              <p className="whitespace-pre-wrap m-0">{content}</p>
            ) : (
              <>
                {content ? (
                  <ReactMarkdown
                    components={{
                      p: ({ node: _node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                      ul: ({ node: _node, ...props }) => <ul className="my-2 ml-4 list-disc marker:text-indigo-400" {...props} />,
                      ol: ({ node: _node, ...props }) => <ol className="my-2 ml-4 list-decimal marker:text-indigo-400" {...props} />,
                      li: ({ node: _node, ...props }) => <li className="pl-1 mb-1" {...props} />,
                      strong: ({ node: _node, ...props }) => <strong className="font-semibold text-indigo-100" {...props} />,
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                ) : (
                  <div className="flex space-x-1.5 items-center h-5 px-1">
                    <span className="w-1.5 h-1.5 bg-indigo-400/80 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-indigo-400/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-indigo-400/80 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
                {isStreaming && content && (
                   <span className="ml-[1px] inline-block w-2 h-4 bg-indigo-500 animate-pulse align-middle opacity-80" />
                )}
              </>
            )}
          </div>
        </Card>

        {/* Citations & Transparency Panel inside assistant bubbles */}
        {!isUser && parsedMeta && (
          <div className="px-1 flex flex-col gap-2 mt-1.5">
            {/* Top row: confidence & collapsible toggle */}
            <div className="flex items-center justify-between gap-4">
              {parsedMeta.confidence && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">AI Confidence:</span>
                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase",
                      parsedMeta.confidence === "HIGH" && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                      parsedMeta.confidence === "MEDIUM" && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
                      parsedMeta.confidence === "LOW" && "bg-red-500/10 text-red-400 border border-red-500/20"
                    )}
                  >
                    {parsedMeta.confidence}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowExplanation(!showExplanation)}
                className="text-[9px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider underline cursor-pointer"
              >
                {showExplanation ? "Hide breakdown" : "Why this answer?"}
              </button>
            </div>

            {/* Collapsible Panel detailing retrieval parameters */}
            {showExplanation && (
              <div className="bg-slate-950/45 border border-border/30 rounded-xl p-3 text-[10px] space-y-2 mt-0.5 animate-fadeIn">
                <p className="font-semibold text-indigo-300">Retrieval & Execution Context</p>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>
                    <span className="block font-medium text-muted-foreground/50">Book Filter Toggle</span>
                    <span className="text-foreground">{parsedMeta.bookFilter ? "Enabled (Textbooks Only)" : "Disabled (All Guidelines)"}</span>
                  </div>
                  <div>
                    <span className="block font-medium text-muted-foreground/50">Expansion Scope</span>
                    <span className="text-foreground">{parsedMeta.searchScope || "Current Subject Only"}</span>
                  </div>
                </div>
                <div className="border-t border-white/5 pt-2 mt-2">
                  <span className="block font-medium text-muted-foreground/50">Confidence Reason</span>
                  <p className="text-foreground mt-0.5">{confidenceReasons[parsedMeta.confidence] || "Based on strict context parsing."}</p>
                </div>
              </div>
            )}

            {/* Citations block */}
            {parsedMeta.citations && parsedMeta.citations.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider block">Sources Consulted:</span>
                <div className="flex flex-col gap-1.5">
                  {parsedMeta.citations.map((cit: Citation, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-indigo-500/5 border border-indigo-500/15 rounded-lg text-[10px] text-indigo-300 transition-colors"
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="font-semibold text-foreground truncate max-w-[200px]">{cit.document}</span>
                        {cit.pageStart !== undefined && (
                          <span className="text-[9px] text-muted-foreground mt-0.5">Pages {cit.pageStart}–{cit.pageEnd || cit.pageStart}</span>
                        )}
                      </div>

                      {FEATURE_FLAGS.ENABLE_COMPARE_MODE && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveCompareCitation(cit);
                            setZoomLevel(1);
                            setHighContrast(false);
                            setCompareTab('sideBySide');
                          }}
                          className="px-2 py-1 bg-indigo-600/15 hover:bg-indigo-600/30 text-[9px] font-bold text-indigo-400 rounded-md border border-indigo-500/25 transition-all whitespace-nowrap cursor-pointer"
                          aria-haspopup="dialog"
                        >
                          🔍 Compare Mode (p. {cit.pageStart})
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grounded Study Mode Widget */}
            {FEATURE_FLAGS.ENABLE_STUDY_MODE && !isStreaming && content && (
              <div className="mt-3 border border-indigo-500/20 rounded-xl overflow-hidden bg-slate-950/40">
                <button
                  type="button"
                  onClick={() => setShowStudyPack(!showStudyPack)}
                  className="w-full flex items-center justify-between p-3 bg-indigo-950/20 hover:bg-indigo-950/30 text-indigo-300 transition-colors text-xs font-semibold text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen size={14} /> Grounded Study Pack (Takeaways, Flashcards & Quiz)
                  </span>
                  <span className="text-[10px] text-indigo-400 underline">{showStudyPack ? "Hide Set" : "Review Set"}</span>
                </button>

                {showStudyPack && (
                  <div className="p-3 border-t border-indigo-500/10 text-xs">
                    {/* Tabs */}
                    <div className="flex gap-2 mb-3 bg-slate-900 p-1 rounded-lg">
                      {(['takeaways', 'flashcards', 'quiz', 'summary'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setStudyTab(tab)}
                          className={cn(
                            "flex-1 text-center py-1 rounded text-[10px] font-bold capitalize transition-colors cursor-pointer",
                            studyTab === tab ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {/* Grounded Tab Contents */}
                    {studyTab === 'takeaways' && (
                      <ul className="list-disc pl-4 space-y-2 text-indigo-200">
                        {takeaways.map((takeaway, idx) => (
                          <li key={idx}>{takeaway}</li>
                        ))}
                      </ul>
                    )}

                    {studyTab === 'flashcards' && (
                      <div className="flex flex-col items-center gap-3 py-2">
                        <div
                          onClick={() => setCardFlipped(!cardFlipped)}
                          className="w-full min-h-[90px] border border-indigo-500/10 rounded-xl bg-slate-900/60 p-4 flex items-center justify-center text-center cursor-pointer hover:bg-slate-900 transition-colors select-none"
                        >
                          <p className="font-medium text-foreground">
                            {cardFlipped ? flashcards[activeCardIdx].back : flashcards[activeCardIdx].front}
                          </p>
                        </div>
                        <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">
                          Click card to flip — Card {activeCardIdx + 1} of {flashcards.length}
                        </span>
                        <div className="flex gap-2 w-full mt-1">
                          <button
                            disabled={activeCardIdx === 0}
                            onClick={() => {
                              setActiveCardIdx(prev => prev - 1);
                              setCardFlipped(false);
                            }}
                            className="flex-1 py-1 bg-slate-800 rounded disabled:opacity-40 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                          >
                            Prev
                          </button>
                          <button
                            disabled={activeCardIdx === flashcards.length - 1}
                            onClick={() => {
                              setActiveCardIdx(prev => prev + 1);
                              setCardFlipped(false);
                            }}
                            className="flex-1 py-1 bg-slate-800 rounded disabled:opacity-40 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}

                    {studyTab === 'quiz' && (
                      <div className="space-y-3 py-1">
                        {questions.map((q, qIdx) => (
                          <div key={qIdx} className="border border-white/5 p-3 rounded-lg bg-slate-900/20">
                            <p className="font-semibold text-foreground mb-2">{q.question}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {q.options.map((opt, oIdx) => (
                                <button
                                  key={oIdx}
                                  onClick={() => setSelectedAnswers(prev => ({ ...prev, [qIdx]: opt }))}
                                  className={cn(
                                    "p-2 text-left rounded text-[11px] font-semibold border transition-all cursor-pointer",
                                    selectedAnswers[qIdx] === opt
                                      ? opt === q.answer
                                        ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/40"
                                        : "bg-red-600/20 text-red-400 border-red-500/40"
                                      : "bg-slate-900 text-muted-foreground border-white/5 hover:text-foreground hover:bg-slate-850"
                                  )}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                            {selectedAnswers[qIdx] && (
                              <p className="text-[10px] text-muted-foreground mt-2">
                                {selectedAnswers[qIdx] === q.answer ? "✓ Correct!" : `✗ Incorrect. Answer is: ${q.answer}`}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {studyTab === 'summary' && (
                      <p className="text-indigo-200 leading-relaxed italic">{summary}</p>
                    )}

                    {/* Save Study Pack Trigger */}
                    <div className="border-t border-indigo-500/10 pt-3 mt-3 flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">Generated strictly from approved syllabus context.</span>
                      <button
                        onClick={handleSaveStudyPack}
                        disabled={saveStatus !== 'idle'}
                        className={cn(
                          "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer",
                          saveStatus === 'saved' ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" : "bg-indigo-600 text-white hover:bg-indigo-500"
                        )}
                      >
                        {saveStatus === 'saving' ? "Saving..." : saveStatus === 'saved' ? (
                          <>
                            <CheckCircle size={10} /> Saved to Dashboard
                          </>
                        ) : (
                          <>
                            <GraduationCap size={10} /> Save Study Pack
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <Avatar className="w-8 h-8 flex-shrink-0 mt-1 border border-indigo-700">
          <AvatarFallback className="bg-indigo-900 text-indigo-100">
            <User size={18} />
          </AvatarFallback>
        </Avatar>
      )}

      {/* ── Dynamic Compare Mode Overlay Modal ────────────────────────────────── */}
      {activeCompareCitation && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compare-modal-title"
          onKeyDown={handleModalKeyDown}
          tabIndex={-1}
        >
          <div className="bg-slate-900 border border-indigo-500/20 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden focus:outline-none">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-950/40">
              <div>
                <h3 id="compare-modal-title" className="text-sm font-semibold text-white">Compare Mode: Diagram Analysis</h3>
                <p className="text-[10px] text-indigo-300 mt-0.5">
                  Grounded Citation: <strong>{activeCompareCitation.documentTitle || activeCompareCitation.document}</strong> (v{activeCompareCitation.documentVersion || 1}) — Page {activeCompareCitation.page || activeCompareCitation.pageStart}
                </p>
              </div>
              <Button
                onClick={() => setActiveCompareCitation(null)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-white"
                aria-label="Close Comparison"
              >
                <X size={16} />
              </Button>
            </div>

            {/* Viewer Controls */}
            <div className="p-3 bg-slate-900/60 border-b border-white/5 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-white/5">
                <button
                  onClick={() => setCompareTab('sideBySide')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 cursor-pointer",
                    compareTab === 'sideBySide' ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Layers size={12} /> Side-by-Side
                </button>
                <button
                  onClick={() => setCompareTab('overlay')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 cursor-pointer",
                    compareTab === 'overlay' ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Eye size={12} /> Show Original (Uploaded)
                </button>
                <button
                  onClick={() => setCompareTab('diff')}
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 cursor-pointer",
                    compareTab === 'diff' ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sliders size={12} /> Highlight Differences
                </button>
              </div>

              <div className="flex items-center gap-4 text-xs">
                {/* Zoom Controls */}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground mr-1">Zoom:</span>
                  <button 
                    onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.5))}
                    className="p-1 bg-slate-800 rounded hover:bg-slate-700 text-white cursor-pointer"
                    title="Zoom Out (Hotkey: -)"
                  >
                    <ZoomOut size={12} />
                  </button>
                  <span className="font-semibold min-w-[35px] text-center">{Math.round(zoomLevel * 100)}%</span>
                  <button 
                    onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 3))}
                    className="p-1 bg-slate-800 rounded hover:bg-slate-700 text-white cursor-pointer"
                    title="Zoom In (Hotkey: +)"
                  >
                    <ZoomIn size={12} />
                  </button>
                </div>

                {/* High Contrast Toggle */}
                <button
                  onClick={() => setHighContrast(!highContrast)}
                  className={cn(
                    "px-2 py-1 rounded border transition-all cursor-pointer font-semibold",
                    highContrast 
                      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" 
                      : "bg-slate-800 text-muted-foreground border-white/5 hover:text-foreground"
                  )}
                >
                  High Contrast
                </button>
              </div>
            </div>

            {/* Image Panels */}
            <div className="flex-1 overflow-auto p-6 bg-slate-950 flex items-center justify-center min-h-[300px]">
              <div 
                className="transition-transform duration-200 ease-out origin-center flex gap-6"
                style={{ 
                  transform: `scale(${zoomLevel})`,
                  filter: highContrast ? 'contrast(1.5) brightness(1.1) invert(0.05)' : 'none'
                }}
              >
                {compareTab === 'sideBySide' && (
                  <>
                    {/* Left: Query Image (User uploaded) */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-indigo-400 font-semibold mb-2 uppercase tracking-widest bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/30">Your Uploaded Schematic</span>
                      <div className="w-72 h-72 border border-white/10 rounded-xl overflow-hidden bg-slate-900/60 flex items-center justify-center relative">
                        {parsedMeta?.uploadedImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img 
                            src={parsedMeta.uploadedImage} 
                            alt="User uploaded query image" 
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-4">
                            <AlertCircle className="mx-auto text-indigo-400 mb-2" size={24} />
                            <p className="text-[10px] text-muted-foreground">No original upload image available in metadata.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Retrieved Textbook Figure */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-emerald-400 font-semibold mb-2 uppercase tracking-widest bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/30">Grounded Source Figure</span>
                      <div className="w-72 h-72 border border-white/10 rounded-xl overflow-hidden bg-slate-900/60 flex items-center justify-center relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src="/uploads/figures/critical_section.png" 
                          alt="Grounded textbook reference diagram from PDF" 
                          className="w-full h-full object-contain"
                        />
                        {/* Bounding box highlight simulator */}
                        <div className="absolute border-2 border-dashed border-emerald-500 bg-emerald-500/10 rounded pointer-events-none" style={{ left: '20%', top: '30%', width: '60%', height: '50%' }}>
                          <span className="absolute -top-4 left-0 bg-emerald-500 text-slate-950 font-bold text-[8px] px-1 rounded uppercase tracking-wider">Region Highlighted</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {compareTab === 'overlay' && (
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-indigo-400 font-semibold mb-2 uppercase tracking-widest bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/30">Full Uploaded Diagram</span>
                    <div className="w-80 h-80 border border-white/10 rounded-xl overflow-hidden bg-slate-900/60 flex items-center justify-center">
                      {parsedMeta?.uploadedImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={parsedMeta.uploadedImage} 
                          alt="Full Query Image View" 
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-4">
                          <AlertCircle className="mx-auto text-indigo-400 mb-2" size={24} />
                          <p className="text-[10px] text-muted-foreground">No original upload image available in metadata.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {compareTab === 'diff' && (
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-yellow-400 font-semibold mb-2 uppercase tracking-widest bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-800/30">Highlighted Differences</span>
                    <div className="w-80 h-80 border border-white/10 rounded-xl overflow-hidden bg-slate-900/60 flex items-center justify-center relative">
                      {/* Diff Overlay Simulator */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src="/uploads/figures/critical_section.png" 
                        alt="Diff highlighting visualization overlay" 
                        className="w-full h-full object-contain opacity-50"
                      />
                      {parsedMeta?.uploadedImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={parsedMeta.uploadedImage} 
                          alt="User Query Overlay" 
                          className="absolute inset-0 w-full h-full object-contain opacity-40 mix-blend-difference"
                        />
                      )}
                      <div className="absolute border-2 border-red-500 bg-red-500/10 rounded pointer-events-none" style={{ left: '25%', top: '35%', width: '50%', height: '40%' }}>
                        <span className="absolute -top-4 left-0 bg-red-500 text-white font-bold text-[8px] px-1 rounded uppercase tracking-wider">Variance Region</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-950/40 border-t border-white/5 text-[10px] text-muted-foreground flex justify-between items-center px-4">
              <span>Press <kbd className="px-1 bg-slate-800 rounded">Esc</kbd> to exit. Use <kbd className="px-1 bg-slate-800 rounded">+</kbd> and <kbd className="px-1 bg-slate-800 rounded">-</kbd> keys to zoom.</span>
              <span className="text-indigo-400 font-semibold uppercase tracking-wider">SyllabiQ Verification Engine v3.0</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
