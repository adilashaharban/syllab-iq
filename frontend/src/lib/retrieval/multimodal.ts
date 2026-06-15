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
      tables: true,
      equations: true,
    },
  });

  const candidates: MultimodalCandidate[] = [];
  const versionIds = versions.map((v) => v.id);

  // Set of valid figureType values according to schema.prisma
  const VALID_FIGURE_TYPES = new Set([
    "IMAGE",
    "LOGIC_CIRCUIT",
    "ELECTRICAL_SCHEMATIC",
    "NETWORK_TOPOLOGY",
    "STATE_MACHINE",
    "UML",
    "PIPELINE",
    "ARCHITECTURE",
    "SIGNAL_WAVEFORM",
    "FLOWCHART",
    "BLOCK_DIAGRAM",
    "GRAPH",
    "TABLE",
    "EQUATION_IMAGE",
  ]);

  let allFigures: any[] = [];
  if (versionIds.length > 0) {
    try {
      allFigures = await prisma.figure.findMany({
        where: { documentVersionId: { in: versionIds } },
      });
    } catch (err) {
      console.warn("[WARNING] Prisma failed to fetch figures due to enum mismatch. Falling back to queryRawUnsafe:", err);
      try {
        allFigures = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM Figure WHERE documentVersionId IN (${versionIds.join(",")})`
        );
      } catch (rawErr) {
        console.error("[ERROR] Failed to fetch figures via queryRawUnsafe:", rawErr);
      }
    }
  }

  // Group figures by version, filtering out invalid types resiliently
  const figuresByVersion: Record<number, any[]> = {};
  allFigures.forEach((fig) => {
    let parsedBboxes = fig.boundingBoxes;
    if (typeof parsedBboxes === "string") {
      try {
        parsedBboxes = JSON.parse(parsedBboxes);
      } catch {}
    }

    const figureTypeUpper = (fig.figureType || "").toUpperCase();
    if (!VALID_FIGURE_TYPES.has(figureTypeUpper)) {
      console.warn(`[WARNING] Skipping figure ID ${fig.id} with invalid figureType: "${fig.figureType}"`);
      return;
    }

    const normalizedFig = {
      ...fig,
      boundingBoxes: parsedBboxes,
    };

    if (!figuresByVersion[fig.documentVersionId]) {
      figuresByVersion[fig.documentVersionId] = [];
    }
    figuresByVersion[fig.documentVersionId].push(normalizedFig);
  });

  versions.forEach((ver) => {
    const priorityVal = params.categoryPriorities[ver.document.category] ?? 100;
    const verFigures = figuresByVersion[ver.id] || [];

    // 1. Figures
    verFigures.forEach((fig) => {
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
