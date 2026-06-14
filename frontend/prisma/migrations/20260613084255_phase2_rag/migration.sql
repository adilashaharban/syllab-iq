-- CreateTable
CREATE TABLE "Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subjectId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "schemeYear" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "filePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "parserVersion" TEXT,
    "processingError" TEXT,
    "uploadedFrom" TEXT,
    "uploaderId" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "approvedAt" DATETIME,
    "queuedAt" DATETIME,
    "parsedAt" DATETIME,
    "embeddedAt" DATETIME,
    "indexedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentVersion_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentVersionId" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "pageNumberStart" INTEGER NOT NULL,
    "pageNumberEnd" INTEGER NOT NULL,
    "sectionTitle" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'TEXT',
    "embeddingId" TEXT,
    "tokenCount" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Chunk_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Figure" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentVersionId" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "caption" TEXT,
    "imagePath" TEXT NOT NULL,
    "embeddingId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Figure_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionSet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionSet_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionSet_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionSetId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" JSONB,
    CONSTRAINT "GeneratedQuestion_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RetrievalLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "query" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "retrievedChunks" JSONB,
    "latency" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "retrievalConfig" JSONB,
    "retrievalVersion" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Document_subjectId_idx" ON "Document"("subjectId");

-- CreateIndex
CREATE INDEX "Document_branchId_idx" ON "Document"("branchId");

-- CreateIndex
CREATE INDEX "Document_semesterId_idx" ON "Document"("semesterId");

-- CreateIndex
CREATE INDEX "Document_schemeYear_idx" ON "Document"("schemeYear");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_checksum_key" ON "DocumentVersion"("checksum");

-- CreateIndex
CREATE INDEX "DocumentVersion_status_idx" ON "DocumentVersion"("status");

-- CreateIndex
CREATE INDEX "DocumentVersion_isLatest_idx" ON "DocumentVersion"("isLatest");

-- CreateIndex
CREATE INDEX "DocumentVersion_approvedAt_idx" ON "DocumentVersion"("approvedAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_deletedAt_idx" ON "DocumentVersion"("deletedAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE INDEX "DocumentVersion_uploaderId_idx" ON "DocumentVersion"("uploaderId");

-- CreateIndex
CREATE INDEX "Chunk_documentVersionId_idx" ON "Chunk"("documentVersionId");

-- CreateIndex
CREATE INDEX "Chunk_contentType_idx" ON "Chunk"("contentType");

-- CreateIndex
CREATE INDEX "Figure_documentVersionId_idx" ON "Figure"("documentVersionId");

-- CreateIndex
CREATE INDEX "QuestionSet_teacherId_idx" ON "QuestionSet"("teacherId");

-- CreateIndex
CREATE INDEX "QuestionSet_subjectId_idx" ON "QuestionSet"("subjectId");

-- CreateIndex
CREATE INDEX "GeneratedQuestion_questionSetId_idx" ON "GeneratedQuestion"("questionSetId");

-- CreateIndex
CREATE INDEX "RetrievalLog_userId_idx" ON "RetrievalLog"("userId");

-- CreateIndex
CREATE INDEX "RetrievalLog_subjectId_idx" ON "RetrievalLog"("subjectId");
