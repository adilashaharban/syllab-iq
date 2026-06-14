import { prisma } from "../db";

export interface MultimodalCandidate {
  type: "FIGURE" | "TABLE" | "EQUATION";
  id: number;
  text: string;
  page: number;
  docTitle: string;
  docId: number;
  version: number;
  priority: number;
  score: number;
  metadata?: any;
  boundingBoxes?: any;
}

export async function fetchMultimodalElements(params: {
  subjectIds: number[];
  branchId: number;
  schemeYear: number;
  bookOnlyMode: boolean;
  message?: string;
  cropRegion?: { x1: number; y1: number; x2: number; y2: number } | null;
  categoryPriorities: Record<string, number>;
}): Promise<MultimodalCandidate[]> {
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
      figures: true,
      tables: true,
      equations: true,
    },
  });

  const candidates: MultimodalCandidate[] = [];

  versions.forEach((ver) => {
    const priorityVal = params.categoryPriorities[ver.document.category] ?? 100;

    // 1. Figures
    ver.figures.forEach((fig) => {
      let score = Math.random() * 0.4 + 0.45;
      if (params.message) {
        const queryTerms = params.message.toUpperCase();
        if (queryTerms.includes("CIRCUIT") && (fig.figureType === "LOGIC_CIRCUIT" || fig.figureType === "ELECTRICAL_SCHEMATIC")) {
          score += 0.25;
        } else if (queryTerms.includes("FLOWCHART") && fig.figureType === "FLOWCHART") {
          score += 0.25;
        } else if (queryTerms.includes("GRAPH") && fig.figureType === "GRAPH") {
          score += 0.25;
        } else if (fig.caption && fig.caption.toLowerCase().includes(params.message.toLowerCase())) {
          score += 0.15;
        }
      }

      if (params.cropRegion && fig.boundingBoxes) {
        score += 0.1;
      }

      candidates.push({
        type: "FIGURE",
        id: fig.id,
        text: fig.caption || "Unnamed Figure",
        page: fig.pageNumber,
        docTitle: ver.document.title,
        docId: ver.document.id,
        version: ver.version,
        priority: priorityVal,
        score,
        metadata: { imagePath: fig.imagePath, figureType: fig.figureType },
        boundingBoxes: fig.boundingBoxes,
      });
    });

    // 2. Tables
    ver.tables.forEach((tbl) => {
      let score = Math.random() * 0.3 + 0.4;
      if (params.message && tbl.caption?.toLowerCase().includes(params.message.toLowerCase())) {
        score += 0.25;
      }
      candidates.push({
        type: "TABLE",
        id: tbl.id,
        text: tbl.caption || "Table Data",
        page: tbl.pageNumber,
        docTitle: ver.document.title,
        docId: ver.document.id,
        version: ver.version,
        priority: priorityVal,
        score,
        metadata: { csv: tbl.csvRepresentation },
        boundingBoxes: tbl.boundingBoxes,
      });
    });

    // 3. Equations
    ver.equations.forEach((eq) => {
      let score = Math.random() * 0.3 + 0.4;
      if (params.message && (eq.rawText.toLowerCase().includes(params.message.toLowerCase()) || (eq.latexRepresentation && eq.latexRepresentation.toLowerCase().includes(params.message.toLowerCase())))) {
        score += 0.3;
      }
      candidates.push({
        type: "EQUATION",
        id: eq.id,
        text: eq.latexRepresentation || eq.rawText,
        page: eq.pageNumber,
        docTitle: ver.document.title,
        docId: ver.document.id,
        version: ver.version,
        priority: priorityVal,
        score,
        metadata: { rawText: eq.rawText, latexRepresentation: eq.latexRepresentation },
        boundingBoxes: eq.boundingBoxes,
      });
    });
  });

  return candidates;
}
