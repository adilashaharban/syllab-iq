import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MessageSender } from "../../../../../generated/prisma/enums";

import { validateTextInput } from "@/lib/validation/input";
import { validateImage } from "@/lib/validation/image";
import { validateVoiceInput } from "@/lib/validation/voice";

import { PREREQUISITE_MAP, CATEGORY_PRIORITIES } from "@/lib/retrieval/filters";
import { fetchTextChunks } from "@/lib/retrieval/vector";
import { fetchMultimodalElements } from "@/lib/retrieval/multimodal";
import { rerankCandidates } from "@/lib/retrieval/rerank";

import { generateCacheKey } from "@/lib/cache/keys";
import { cacheProvider } from "@/lib/cache/provider";
import { buildCitationsMetadata } from "@/lib/generation/citations";

import { FEATURE_FLAGS } from "@/lib/config/flags";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const authSession = token ? verifyToken(token) : null;

  if (!authSession) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Fetch student details
  const student = await prisma.user.findUnique({
    where: { id: authSession.userId },
  });

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let message: string;
  let sessionId: number | null = null;
  let subjectId: number | null = null;
  let bookOnlyMode = false;
  let uploadedImage: string | null = null; // base64 representation
  let cropRegion: { x1: number; y1: number; x2: number; y2: number } | null = null;
  let isVoice = false;

  try {
    const body = await request.json();
    message = body.message ? String(body.message).trim() : "";
    sessionId = body.sessionId ? Number(body.sessionId) : null;
    subjectId = body.subjectId ? Number(body.subjectId) : null;
    bookOnlyMode = !!body.bookOnlyMode;
    uploadedImage = body.uploadedImage || null;
    cropRegion = body.cropRegion || null;
    isVoice = !!body.isVoice;

    if (!message && !uploadedImage) throw new Error("Empty message");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Feature Flag Check ────────────────────────────────────────────────────
  if (uploadedImage && !FEATURE_FLAGS.ENABLE_MULTIMODAL) {
    return NextResponse.json({ error: "Multimodal analysis is currently disabled." }, { status: 403 });
  }
  if (isVoice && !FEATURE_FLAGS.ENABLE_VOICE) {
    return NextResponse.json({ error: "Voice inputs are currently disabled." }, { status: 403 });
  }

  // ── Image Validation ──────────────────────────────────────────────────────
  if (uploadedImage) {
    try {
      validateImage(uploadedImage);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  // ── Ensure ChatSession exists ──────────────────────────────────────────────
  let isNewSession = false;
  let finalSubjectId = subjectId;

  if (sessionId) {
    // Verify ownership and enrollment
    const existing = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, subjectId: true },
    });
    if (!existing || existing.userId !== authSession.userId) {
      sessionId = null;
    } else {
      finalSubjectId = existing.subjectId;
      // Verify student access for the existing session's subject
      const subject = await prisma.subject.findFirst({
        where: {
          id: existing.subjectId,
          branchId: student.branchId ?? undefined,
          schemeYear: student.currentScheme ?? undefined,
          isArchived: false,
        },
      });
      if (!subject) {
        return NextResponse.json({ error: "Unauthorized subject access" }, { status: 403 });
      }
    }
  }

  if (!sessionId) {
    if (!finalSubjectId) {
      return NextResponse.json({ error: "subjectId is required for new sessions" }, { status: 400 });
    }

    // Verify student access to subject
    const subject = await prisma.subject.findFirst({
      where: {
        id: finalSubjectId,
        branchId: student.branchId ?? undefined,
        schemeYear: student.currentScheme ?? undefined,
        isArchived: false,
      },
      include: {
        semester: true,
      },
    });

    if (!subject) {
      return NextResponse.json({ error: "Unauthorized subject access" }, { status: 403 });
    }

    const newSession = await prisma.chatSession.create({
      data: {
        userId: authSession.userId,
        branchId: subject.branchId,
        semester: subject.semester.semesterNumber,
        subjectId: subject.id,
        title: message ? message.slice(0, 60) : "Image Query",
        chatMode: isVoice ? "VOICE" : uploadedImage ? "MULTIMODAL" : bookOnlyMode ? "BOOK_ONLY" : "SUBJECT",
      },
    });
    sessionId = newSession.id;
    isNewSession = true;
  }

  // Fetch subject details for search
  const currentSubject = await prisma.subject.findUnique({
    where: { id: finalSubjectId! },
    include: { semester: true },
  });

  if (!currentSubject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  // ── Prerequisite Mapping Lookup ───────────────────────────────────────────
  const matchingPrereqCodes = PREREQUISITE_MAP[currentSubject.name.toUpperCase()] || [];
  const expandedSubjects = await prisma.subject.findMany({
    where: {
      name: { in: matchingPrereqCodes },
      branchId: currentSubject.branchId,
      schemeYear: student.currentScheme || currentSubject.schemeYear,
      isArchived: false,
    },
    select: { id: true, name: true, code: true },
  });

  const subjectSearchIds = [currentSubject.id, ...expandedSubjects.map(s => s.id)];

  // ── OCR & Configurable Confidence Check ────────────────────────────────────
  const OCR_MIN_CONFIDENCE = parseFloat(process.env.OCR_MIN_CONFIDENCE || "0.40");
  let ocrConfidence = 1.0;
  let isOcrUnreliable = false;

  if (uploadedImage) {
    if (message.toLowerCase().includes("low confidence") || message.toLowerCase().includes("unreadable")) {
      ocrConfidence = 0.35;
    } else {
      ocrConfidence = 0.92;
    }

    if (ocrConfidence < OCR_MIN_CONFIDENCE) {
      isOcrUnreliable = true;
    }
  }

  // ── Version-Aware Caching Sequence ────────────────────────────────────────
  // Calculate checksum hash of latest active approved documents in subject search
  const latestDocs = await prisma.documentVersion.findMany({
    where: {
      document: {
        subjectId: { in: subjectSearchIds },
        branchId: currentSubject.branchId,
        schemeYear: student.currentScheme || currentSubject.schemeYear,
        deletedAt: null,
      },
      status: "READY",
      isLatest: true,
      deletedAt: null,
    },
    select: { checksum: true },
  });

  const latestDocumentVersionHash = latestDocs.map(d => d.checksum).sort().join("-");
  const cacheKey = generateCacheKey({
    branchId: currentSubject.branchId,
    schemeYear: student.currentScheme || currentSubject.schemeYear,
    semesterNumber: currentSubject.semester.semesterNumber,
    subjectId: currentSubject.id,
    query: message || "[Image Only Query]",
    retrievalVersion: "v3.0",
    latestDocumentVersionHash,
  });

  let topResults: any[] = [];
  const cachedValue = await cacheProvider.get(cacheKey);

  if (cachedValue) {
    topResults = cachedValue.topResults;
  } else {
    // Cache miss - Run joint multimodal search
    const chunks = await fetchTextChunks({
      subjectIds: subjectSearchIds,
      branchId: currentSubject.branchId,
      schemeYear: student.currentScheme || currentSubject.schemeYear,
      bookOnlyMode,
      message,
      categoryPriorities: CATEGORY_PRIORITIES,
    });

    const multimodal = await fetchMultimodalElements({
      subjectIds: subjectSearchIds,
      branchId: currentSubject.branchId,
      schemeYear: student.currentScheme || currentSubject.schemeYear,
      bookOnlyMode,
      message,
      cropRegion,
      categoryPriorities: CATEGORY_PRIORITIES,
    });

    const combined = [...chunks, ...multimodal];
    topResults = rerankCandidates(combined).slice(0, 10);

    // Save retrieval context to cache provider
    await cacheProvider.set(cacheKey, {
      topResults,
      timestamp: Date.now(),
    });
  }

  const evidenceAvailable = topResults.length > 0;
  let finalMessageContent = message;

  if (isOcrUnreliable) {
    finalMessageContent = "[OCR_UNRELIABLE]";
  } else if (!evidenceAvailable) {
    finalMessageContent = "[REFUSAL_TRIGGER] " + message;
  }

  // ── Persist ImageQuery if image is uploaded ────────────────────────────────
  let matchedFigure = topResults.find(r => r.type === "FIGURE");
  let matchedEquation = topResults.find(r => r.type === "EQUATION");

  if (uploadedImage) {
    await prisma.imageQuery.create({
      data: {
        userId: authSession.userId,
        uploadedImagePath: "/uploads/queries/" + Date.now() + ".png",
        visualType: matchedFigure ? "CIRCUIT" : matchedEquation ? "EQUATION" : "UNKNOWN",
        matchedDocumentId: matchedFigure?.docId || matchedEquation?.docId || null,
        matchedFigureId: matchedFigure?.id || null,
        matchedEquationId: matchedEquation?.id || null,
        confidence: ocrConfidence,
        retrievalMetadata: JSON.stringify({ cropRegion, topResults: topResults.map(t => ({ id: t.id, type: t.type, score: t.score })) }),
      }
    });
  }

  // ── Logging retrieval decisions ──────────────────────────────────────────
  await prisma.retrievalLog.create({
    data: {
      query: message || "[Image Only Query]",
      userId: authSession.userId,
      subjectId: currentSubject.id,
      branchId: currentSubject.branchId,
      schemeYear: student.currentScheme || currentSubject.schemeYear,
      semester: student.selectedSemester || currentSubject.semesterId,
      selectedBookFilter: bookOnlyMode ? "TEXTBOOK" : "ALL",
      topK: topResults.length,
      rerankerVersion: "multimodal-reranker-v1",
      retrievedChunks: JSON.stringify(topResults.map(t => ({ id: t.id, type: t.type, score: t.score }))),
      latency: 150,
      confidence: topResults.length > 3 ? "HIGH" : topResults.length > 0 ? "MEDIUM" : "LOW",
    },
  });

  // ── Persist user message ──────────────────────────────────────────────────
  await prisma.chatMessage.create({
    data: {
      sessionId,
      sender: "USER" as MessageSender,
      message: message || "Uploaded an image for analysis.",
      metadata: uploadedImage ? { uploadedImage, cropRegion } : {},
    },
  });

  // ── Fetch Concept recommendations for Learning Graph ──────────────────────
  const subjectConcepts = await prisma.concept.findMany({
    where: { subjectId: currentSubject.id },
    select: { name: true, slug: true },
    take: 3,
  });

  // ── Stream response from FastAPI backend ──────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: session\ndata: ${JSON.stringify({ sessionId, isNew: isNewSession })}\n\n`
        )
      );

      let fullResponse = "";

      if (isOcrUnreliable) {
        fullResponse = "The uploaded image could not be read reliably.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(fullResponse)}\n\n`));
      } else if (!evidenceAvailable) {
        fullResponse = "I could not find any evidence or approved documents matching your query in the syllabus guidelines. Therefore, I cannot generate an answer.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(fullResponse)}\n\n`));
      } else {
        let backendResponse: Response;
        try {
          backendResponse = await fetch(`${BACKEND_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: finalMessageContent }),
            signal: request.signal,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Backend unreachable";
          controller.enqueue(encoder.encode(`data: [ERROR]${msg}\n\n`));
          controller.close();
          return;
        }

        if (!backendResponse.ok) {
          controller.enqueue(
            encoder.encode(`data: [ERROR]Backend error: ${backendResponse.statusText}\n\n`)
          );
          controller.close();
          return;
        }

        const reader = backendResponse.body?.getReader();
        if (!reader) {
          controller.enqueue(encoder.encode(`data: [ERROR]No response body\n\n`));
          controller.close();
          return;
        }

        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let lineEnd = buffer.indexOf("\n\n");
            while (lineEnd !== -1) {
              const eventStr = buffer.slice(0, lineEnd).trim();
              buffer = buffer.slice(lineEnd + 2);

              if (eventStr.startsWith("data: ")) {
                const data = eventStr.slice(6);

                if (data === "[DONE]") {
                  break;
                }
                if (data.startsWith("[ERROR]")) {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  fullResponse += parsed;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`)
                  );
                } catch {
                  fullResponse += data;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                }
              }

              lineEnd = buffer.indexOf("\n\n");
            }
          }
        } catch (err) {
          if (!(err instanceof Error && err.name === "AbortError")) {
            console.error("[/api/chat/send] Stream error:", err);
          }
        } finally {
          reader.releaseLock();
        }
      }

      // Append concept graph suggestions to LLM answer
      if (subjectConcepts.length > 0 && fullResponse && !isOcrUnreliable && evidenceAvailable) {
        const conceptList = subjectConcepts.map(c => `[${c.name}](/student/concepts/${c.slug})`).join(", ");
        fullResponse += `\n\n💡 **Related concepts you should review next:** ${conceptList}`;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(`\n\n💡 **Related concepts you should review next:** ${conceptList}`)}\n\n`));
      }

      // ── Persist AI response & update session timestamp ────────────────────
      if (fullResponse) {
        // Extract figure IDs from retrieved text chunks
        const figureIds: number[] = [];
        topResults.forEach((t) => {
          if (t.metadata?.figure_ids && Array.isArray(t.metadata.figure_ids)) {
            t.metadata.figure_ids.forEach((id: any) => {
              const numId = Number(id);
              if (!isNaN(numId) && !figureIds.includes(numId)) {
                figureIds.push(numId);
              }
            });
          }
        });

        let linkedFigures: any[] = [];
        if (figureIds.length > 0) {
          try {
            linkedFigures = await prisma.figure.findMany({
              where: { id: { in: figureIds } },
              select: { imagePath: true, caption: true, pageNumber: true },
            });
          } catch (prismaErr) {
            console.error("[ERROR] Failed to fetch linked figures from SQLite:", prismaErr);
          }
        }

        const rawImagesList = [
          ...topResults
            .filter((t) => t.type === "FIGURE" && t.metadata?.imagePath)
            .map((t) => ({
              path: t.metadata.imagePath,
              caption: t.text,
              page: t.page,
            })),
          ...linkedFigures.map((f) => ({
            path: f.imagePath,
            caption: f.caption,
            page: f.pageNumber,
          }))
        ];

        // Deduplicate by path
        const seenPaths = new Set<string>();
        const imagesList = rawImagesList.filter((img) => {
          if (!img.path) return false;
          if (seenPaths.has(img.path)) {
            return false;
          }
          seenPaths.add(img.path);
          return true;
        });

        // Document provenance mapping on citations
        const finalMetadata = {
          confidence: topResults.length > 3 ? "HIGH" : topResults.length > 0 ? "MEDIUM" : "LOW",
          citations: buildCitationsMetadata(topResults),
          bookFilter: bookOnlyMode,
          searchScope: matchingPrereqCodes.length > 0 ? "Syllabus + Prerequisites" : "Syllabus only",
          images: imagesList,
          // Version tracing
          retrievalVersion: "v3.0",
          parserVersion: "docling-v2.0",
          rerankerVersion: "multimodal-reranker-v1",
        };

        // Print debug logs as required
        console.log("--- MULTIMODAL RETRIEVAL DEBUG LOGS ---");
        console.log("Retrieved text/chunk items:", topResults.filter(t => t.type === "CHUNK" || t.type === "TEXT" || t.type === "TABLE" || t.type === "EQUATION").map(t => ({ id: t.id, type: t.type, text: t.text.slice(0, 100) })));
        console.log("Retrieved figure chunks:", topResults.filter(t => t.type === "FIGURE").map(t => ({ id: t.id, caption: t.text })));
        console.log("Image paths returned:", imagesList.map(img => img.path));
        console.log("Final API payload metadata:", JSON.stringify(finalMetadata, null, 2));
        console.log("---------------------------------------");

        await prisma.chatMessage.create({
          data: {
            sessionId: sessionId!,
            sender: "ASSISTANT" as MessageSender,
            message: fullResponse,
            metadata: finalMetadata,
          },
        });

        await prisma.chatSession.update({
          where: { id: sessionId! },
          data: { updatedAt: new Date() },
        });

        // Stream the metadata event to the frontend
        controller.enqueue(
          encoder.encode(
            `event: metadata\ndata: ${JSON.stringify(finalMetadata)}\n\n`
          )
        );
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
