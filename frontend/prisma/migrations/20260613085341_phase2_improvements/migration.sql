-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN "approvalComment" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subjectId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "schemeYear" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "sourcePriority" INTEGER NOT NULL DEFAULT 100,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("branchId", "category", "createdAt", "deletedAt", "description", "id", "schemeYear", "semesterId", "subjectId", "title", "updatedAt") SELECT "branchId", "category", "createdAt", "deletedAt", "description", "id", "schemeYear", "semesterId", "subjectId", "title", "updatedAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE INDEX "Document_subjectId_idx" ON "Document"("subjectId");
CREATE INDEX "Document_branchId_idx" ON "Document"("branchId");
CREATE INDEX "Document_semesterId_idx" ON "Document"("semesterId");
CREATE INDEX "Document_schemeYear_idx" ON "Document"("schemeYear");
CREATE INDEX "Document_category_idx" ON "Document"("category");
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
CREATE TABLE "new_RetrievalLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "query" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "schemeYear" INTEGER,
    "semester" INTEGER,
    "selectedBookFilter" TEXT,
    "topK" INTEGER NOT NULL DEFAULT 10,
    "rerankerVersion" TEXT,
    "retrievedChunks" JSONB,
    "latency" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "retrievalConfig" JSONB,
    "retrievalVersion" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RetrievalLog" ("confidence", "id", "latency", "query", "retrievalConfig", "retrievalVersion", "retrievedChunks", "subjectId", "timestamp", "userId") SELECT "confidence", "id", "latency", "query", "retrievalConfig", "retrievalVersion", "retrievedChunks", "subjectId", "timestamp", "userId" FROM "RetrievalLog";
DROP TABLE "RetrievalLog";
ALTER TABLE "new_RetrievalLog" RENAME TO "RetrievalLog";
CREATE INDEX "RetrievalLog_userId_idx" ON "RetrievalLog"("userId");
CREATE INDEX "RetrievalLog_subjectId_idx" ON "RetrievalLog"("subjectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
