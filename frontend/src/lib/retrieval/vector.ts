import { prisma } from "../db";

export interface TextChunkCandidate {
  type: "CHUNK";
  id: number;
  text: string;
  page: number;
  docTitle: string;
  docId: number;
  version: number;
  priority: number;
  score: number;
  boundingBoxes?: any;
}

export async function fetchTextChunks(params: {
  subjectIds: number[];
  branchId: number;
  schemeYear: number;
  bookOnlyMode: boolean;
  message?: string;
  categoryPriorities: Record<string, number>;
}): Promise<TextChunkCandidate[]> {
  const versions = await prisma.documentVersion.findMany({
    where: {
      document: {
        subjectId: { in: params.subjectIds },
        branchId: params.branchId,
        schemeYear: params.schemeYear,
        deletedAt: null,
        ...(params.bookOnlyMode ? { category: "TEXTBOOK" } : {}),
      },
      status: "READY",
      isLatest: true,
      deletedAt: null,
    },
    include: {
      document: true,
      chunks: true,
    },
  });

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const queryText = params.message || "";

  if (queryText && versions.length > 0) {
    try {
      const response = await fetch(`${backendUrl}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, limit: 5 }),
      });
      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];
        const candidates: TextChunkCandidate[] = [];

        results.forEach((chunk: any) => {
          // Clean chunk filename to find matching version in SQLite
          const cleanFilename = chunk.filename.replace(/\.md$/, "");
          const matchingVer = versions.find(v => 
            v.originalFilename === cleanFilename || 
            chunk.filename.includes(v.originalFilename) || 
            v.originalFilename.includes(cleanFilename)
          );

          if (matchingVer) {
            const priorityVal = params.categoryPriorities[matchingVer.document.category] ?? 100;
            candidates.push({
              type: "CHUNK",
              id: matchingVer.id,
              text: chunk.text,
              page: chunk.chunk_index + 1, // Infer page or section from index
              docTitle: matchingVer.document.title,
              docId: matchingVer.document.id,
              version: matchingVer.version,
              priority: priorityVal,
              score: 0.95,
            });
          }
        });

        if (candidates.length > 0) {
          return candidates;
        }
      }
    } catch (err) {
      console.error("Failed to fetch text chunks from backend retrieve endpoint:", err);
    }
  }

  // Fallback mock behavior if retrieve failed or no query
  const candidates: TextChunkCandidate[] = [];
  versions.forEach((ver) => {
    const priorityVal = params.categoryPriorities[ver.document.category] ?? 100;
    candidates.push({
      type: "CHUNK",
      id: ver.id,
      text: `Syllabus document source: ${ver.document.title}`,
      page: 1,
      docTitle: ver.document.title,
      docId: ver.document.id,
      version: ver.version,
      priority: priorityVal,
      score: 0.95,
    });
  });

  return candidates;
}
