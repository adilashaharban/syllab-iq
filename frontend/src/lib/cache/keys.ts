import { createHash } from "crypto";

export function generateCacheKey(params: {
  branchId: number;
  schemeYear: number;
  semesterNumber: number;
  subjectId: number;
  query: string;
  retrievalVersion: string;
  latestDocumentVersionHash: string;
}) {
  const queryHash = createHash("sha256").update(params.query.trim().toLowerCase()).digest("hex");
  const rawString = `${params.branchId}-${params.schemeYear}-${params.semesterNumber}-${params.subjectId}-${queryHash}-${params.retrievalVersion}-${params.latestDocumentVersionHash}`;
  return createHash("sha256").update(rawString).digest("hex");
}
