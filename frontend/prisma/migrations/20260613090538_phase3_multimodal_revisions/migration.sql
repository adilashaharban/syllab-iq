-- CreateTable
CREATE TABLE "Table" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentVersionId" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "caption" TEXT,
    "csvRepresentation" TEXT NOT NULL,
    "embeddingId" TEXT,
    "boundingBoxes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Table_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Equation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentVersionId" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "latexRepresentation" TEXT,
    "confidence" REAL NOT NULL,
    "boundingBoxes" JSONB,
    "embeddingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Equation_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageQuery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "uploadedImagePath" TEXT NOT NULL,
    "visualType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "matchedDocumentId" INTEGER,
    "matchedFigureId" INTEGER,
    "matchedEquationId" INTEGER,
    "confidence" REAL NOT NULL,
    "retrievalMetadata" JSONB,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Figure" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentVersionId" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "caption" TEXT,
    "figureType" TEXT NOT NULL DEFAULT 'IMAGE',
    "imagePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "embeddingId" TEXT,
    "boundingBoxes" JSONB,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Figure_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Figure" ("caption", "createdAt", "documentVersionId", "embeddingId", "id", "imagePath", "metadata", "pageNumber") SELECT "caption", "createdAt", "documentVersionId", "embeddingId", "id", "imagePath", "metadata", "pageNumber" FROM "Figure";
DROP TABLE "Figure";
ALTER TABLE "new_Figure" RENAME TO "Figure";
CREATE INDEX "Figure_documentVersionId_idx" ON "Figure"("documentVersionId");
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
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetrievalLog_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RetrievalLog" ("branchId", "confidence", "id", "latency", "query", "rerankerVersion", "retrievalConfig", "retrievalVersion", "retrievedChunks", "schemeYear", "selectedBookFilter", "semester", "subjectId", "timestamp", "topK", "userId") SELECT "branchId", "confidence", "id", "latency", "query", "rerankerVersion", "retrievalConfig", "retrievalVersion", "retrievedChunks", "schemeYear", "selectedBookFilter", "semester", "subjectId", "timestamp", "topK", "userId" FROM "RetrievalLog";
DROP TABLE "RetrievalLog";
ALTER TABLE "new_RetrievalLog" RENAME TO "RetrievalLog";
CREATE INDEX "RetrievalLog_userId_idx" ON "RetrievalLog"("userId");
CREATE INDEX "RetrievalLog_subjectId_idx" ON "RetrievalLog"("subjectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Table_documentVersionId_idx" ON "Table"("documentVersionId");

-- CreateIndex
CREATE INDEX "Equation_documentVersionId_idx" ON "Equation"("documentVersionId");

-- CreateIndex
CREATE INDEX "Subject_schemeYear_idx" ON "Subject"("schemeYear");
