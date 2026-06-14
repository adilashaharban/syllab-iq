-- CreateTable
CREATE TABLE "Concept" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "description" TEXT,
    CONSTRAINT "Concept_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConceptEdge" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fromConceptId" INTEGER NOT NULL,
    "toConceptId" INTEGER NOT NULL,
    "relationship" TEXT NOT NULL,
    "graphVersion" TEXT,
    CONSTRAINT "ConceptEdge_fromConceptId_fkey" FOREIGN KEY ("fromConceptId") REFERENCES "Concept" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConceptEdge_toConceptId_fkey" FOREIGN KEY ("toConceptId") REFERENCES "Concept" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudyPack" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sources" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyPack_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studyPackId" INTEGER NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    CONSTRAINT "Flashcard_studyPackId_fkey" FOREIGN KEY ("studyPackId") REFERENCES "StudyPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studyPackId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "options" JSONB,
    CONSTRAINT "PracticeQuestion_studyPackId_fkey" FOREIGN KEY ("studyPackId") REFERENCES "StudyPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "studyPackId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuizAttempt_studyPackId_fkey" FOREIGN KEY ("studyPackId") REFERENCES "StudyPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quizAttemptId" INTEGER NOT NULL,
    "practiceQuestionId" INTEGER NOT NULL,
    "selectedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    CONSTRAINT "QuestionAttempt_quizAttemptId_fkey" FOREIGN KEY ("quizAttemptId") REFERENCES "QuizAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionAttempt_practiceQuestionId_fkey" FOREIGN KEY ("practiceQuestionId") REFERENCES "PracticeQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Concept_slug_key" ON "Concept"("slug");

-- CreateIndex
CREATE INDEX "Concept_subjectId_idx" ON "Concept"("subjectId");

-- CreateIndex
CREATE INDEX "ConceptEdge_fromConceptId_idx" ON "ConceptEdge"("fromConceptId");

-- CreateIndex
CREATE INDEX "ConceptEdge_toConceptId_idx" ON "ConceptEdge"("toConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptEdge_fromConceptId_toConceptId_relationship_key" ON "ConceptEdge"("fromConceptId", "toConceptId", "relationship");

-- CreateIndex
CREATE INDEX "StudyPack_userId_idx" ON "StudyPack"("userId");

-- CreateIndex
CREATE INDEX "StudyPack_subjectId_idx" ON "StudyPack"("subjectId");

-- CreateIndex
CREATE INDEX "Flashcard_studyPackId_idx" ON "Flashcard"("studyPackId");

-- CreateIndex
CREATE INDEX "PracticeQuestion_studyPackId_idx" ON "PracticeQuestion"("studyPackId");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");

-- CreateIndex
CREATE INDEX "QuizAttempt_studyPackId_idx" ON "QuizAttempt"("studyPackId");

-- CreateIndex
CREATE INDEX "QuestionAttempt_quizAttemptId_idx" ON "QuestionAttempt"("quizAttemptId");

-- CreateIndex
CREATE INDEX "QuestionAttempt_practiceQuestionId_idx" ON "QuestionAttempt"("practiceQuestionId");
