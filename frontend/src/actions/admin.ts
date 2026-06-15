"use server";

import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { UserStatus, DocumentStatus, ChunkContentType } from "../../generated/prisma/enums";

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
}

export async function updateTeacherStatus(teacherId: number, status: "APPROVED" | "REJECTED") {
  await verifyAdmin();
  await prisma.user.update({
    where: { id: teacherId },
    data: { status: status as UserStatus },
  });
  revalidatePath("/admin/dashboard");
}

export async function toggleUserActive(userId: number, currentActive: boolean) {
  await verifyAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !currentActive },
  });
  revalidatePath("/admin/dashboard");
}

export async function createBranch(name: string) {
  try {
    await verifyAdmin();
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: "Branch name required" };
    }

    const existing = await prisma.branch.findUnique({
      where: { name: trimmed },
    });
    if (existing) {
      return { success: false, error: "Branch with this name already exists" };
    }

    // Automatically create semesters 1 to 8 when a new branch is created!
    const branch = await prisma.branch.create({
      data: { name: trimmed },
    });

    for (let sem = 1; sem <= 8; sem++) {
      await prisma.semester.create({
        data: {
          branchId: branch.id,
          semesterNumber: sem,
        },
      });
    }

    revalidatePath("/admin/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create branch" };
  }
}

export async function createSubject(data: {
  code: string;
  name: string;
  branchId: number;
  semesterNumber: number;
  schemeYear: number;
  credits: number;
}) {
  try {
    await verifyAdmin();

    const codeUpper = data.code.trim().toUpperCase();
    const nameTrimmed = data.name.trim();

    if (!codeUpper || !nameTrimmed) {
      return { success: false, error: "Subject code and name are required" };
    }

    // 1. Verify branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
    });
    if (!branch) {
      return { success: false, error: "The selected branch does not exist." };
    }

    // 2. Verify semester exists for this branch mapping
    const semester = await prisma.semester.findUnique({
      where: {
        branchId_semesterNumber: {
          branchId: data.branchId,
          semesterNumber: data.semesterNumber,
        },
      },
    });

    if (!semester) {
      return { success: false, error: "Specified semester/branch combination does not exist." };
    }

    // 3. Verify subject code is unique for this branch and schemeYear
    const existingSubject = await prisma.subject.findFirst({
      where: {
        code: codeUpper,
        branchId: data.branchId,
        schemeYear: data.schemeYear,
      },
    });

    if (existingSubject) {
      return {
        success: false,
        error: `Subject code ${codeUpper} is already registered under branch ${branch.name} for scheme ${data.schemeYear}.`,
      };
    }

    await prisma.subject.create({
      data: {
        code: codeUpper,
        name: nameTrimmed,
        branchId: data.branchId,
        semesterId: semester.id,
        schemeYear: data.schemeYear,
        credits: data.credits,
      },
    });

    revalidatePath("/admin/dashboard");
    revalidatePath("/student/dashboard");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create subject" };
  }
}

export async function assignTeacherSubject(teacherId: number, subjectId: number) {
  await verifyAdmin();
  await prisma.teacherSubject.create({
    data: {
      teacherId,
      subjectId,
    },
  });
  revalidatePath("/admin/dashboard");
}

export async function removeTeacherSubject(id: number) {
  await verifyAdmin();
  await prisma.teacherSubject.delete({
    where: { id },
  });
  revalidatePath("/admin/dashboard");
}

// ─── Document Review & Background Ingestion ───────────────────────────────────

export async function reviewDocument(
  versionId: number,
  action: "APPROVE" | "REJECT" | "ARCHIVE",
  comment?: string
) {
  await verifyAdmin();

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw new Error("Document version not found");
  }

  if (action === "REJECT") {
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: {
        status: DocumentStatus.REJECTED,
        approvalComment: comment || null,
      },
    });
  } else if (action === "ARCHIVE") {
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { status: DocumentStatus.ARCHIVED, isLatest: false },
    });
  } else if (action === "APPROVE") {
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: {
        status: DocumentStatus.QUEUED,
        queuedAt: new Date(),
        approvedAt: new Date(),
      },
    });

    // Run pipeline asynchronously so we don't block the client
    processDocument(versionId).catch(console.error);
  }

  revalidatePath("/admin/dashboard");
}

export async function reindexDocument(versionId: number) {
  await verifyAdmin();
  // Queue/trigger job asynchronously
  const { triggerReprocessJob } = await import("@/lib/indexing/reindex");
  await triggerReprocessJob(versionId);
  revalidatePath("/admin/dashboard");
}
async function processDocument(versionId: number) {
  try {
    // 1. Parsing
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { status: DocumentStatus.PARSING, parsedAt: new Date(), parserVersion: "docling-v2.0" },
    });

    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      include: {
        document: {
          include: {
            subject: {
              include: {
                semester: true,
              },
            },
          },
        },
      },
    });

    if (!version) {
      throw new Error("Document version not found");
    }

    const filePath = `frontend/public${version.filePath}`;

    // 2. Chunking
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { status: DocumentStatus.CHUNKING },
    });

    // 3. Embedding
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { status: DocumentStatus.EMBEDDING },
    });

    // 4. Indexing
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { status: DocumentStatus.INDEXING },
    });

    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
    const response = await fetch(`${backendUrl}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentId: version.documentId,
        documentVersionId: versionId,
        checksum: version.checksum,
        filePath: filePath,
        originalFilename: version.originalFilename,
        subjectName: version.document.subject.name,
        semesterNumber: version.document.subject.semester.semesterNumber,
      }),
    });

    if (!response.ok) {
      throw new Error(`FastAPI responded with ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "FastAPI ingestion reported failure");
    }

    if (result.queued) {
      console.log("Ingestion queued asynchronously. Background job is processing in Python.");
      return;
    }

    // 5. READY & Update isLatest version logic
    await prisma.$transaction([
      prisma.documentVersion.updateMany({
        where: { documentId: version.documentId, id: { not: versionId } },
        data: { isLatest: false },
      }),
      prisma.documentVersion.update({
        where: { id: versionId },
        data: {
          status: DocumentStatus.READY,
          isLatest: true,
          chunkCount: result.chunkCount,
          embeddedAt: new Date(),
          indexedAt: new Date(),
        },
      }),
    ]);

    // Update the subject documentCount
    const count = await prisma.document.count({
      where: {
        subjectId: version.document.subjectId,
        versions: {
          some: { status: DocumentStatus.READY },
        },
      },
    });

    await prisma.subject.update({
      where: { id: version.document.subjectId },
      data: { documentCount: count },
    });

  } catch (err: any) {
    console.error("Pipeline failure for version", versionId, err);
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { status: DocumentStatus.FAILED, processingError: err.message || "Unknown pipeline error" },
    });
  }
}

export async function retryIngestion(versionId: number) {
  await verifyAdmin();

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw new Error("Document version not found");
  }

  if (version.status !== DocumentStatus.FAILED) {
    throw new Error("Document version is not in FAILED state");
  }

  // Update status back to QUEUED
  await prisma.documentVersion.update({
    where: { id: versionId },
    data: {
      status: DocumentStatus.QUEUED,
      queuedAt: new Date(),
    },
  });

  // Run pipeline asynchronously
  processDocument(versionId).catch(console.error);

  revalidatePath("/admin/dashboard");
}
