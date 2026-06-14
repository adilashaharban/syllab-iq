"use server";

import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { DocumentCategory, DocumentStatus } from "../../generated/prisma/enums";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export interface UploadState {
  error?: string;
  success?: boolean;
}

export async function uploadDocument(
  _prevState: UploadState | null,
  formData: FormData
): Promise<UploadState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "TEACHER") {
    return { error: "Unauthorized access." };
  }

  // Fetch teacher to verify approval status
  const teacher = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!teacher || teacher.status !== "APPROVED") {
    return { error: "Your account is pending administrator approval. Cannot upload documents." };
  }

  const subjectId = Number(formData.get("subjectId"));
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const category = formData.get("category") as DocumentCategory;
  const file = formData.get("file") as File;

  if (!subjectId || !title || !category || !file || file.size === 0) {
    return { error: "Please provide all required fields and select a valid file." };
  }

  try {
    // 1. Calculate file checksum and read buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    // 2. Deduplication check
    const existingVersion = await prisma.documentVersion.findUnique({
      where: { checksum },
    });
    if (existingVersion) {
      if (existingVersion.status === DocumentStatus.FAILED) {
        return { error: "This file has already been uploaded but its processing failed. Please retry processing it from the Admin Control Center instead of uploading it again." };
      }
      if (existingVersion.status === DocumentStatus.READY) {
        return { error: "This exact file has already been uploaded previously (duplicate checksum)." };
      }
      return { error: "This exact file has already been uploaded previously and is currently being processed." };
    }

    // Lookup subject details
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      return { error: "Subject not found." };
    }

    // 3. Document version logic
    let document = await prisma.document.findFirst({
      where: { title, subjectId },
    });

    let versionNumber = 1;
    if (document) {
      // Find latest version number
      const latestVer = await prisma.documentVersion.findFirst({
        where: { documentId: document.id },
        orderBy: { version: "desc" },
      });
      if (latestVer) {
        versionNumber = latestVer.version + 1;
      }
    } else {
      // Create new document collection
      document = await prisma.document.create({
        data: {
          title,
          description,
          subjectId,
          branchId: subject.branchId,
          semesterId: subject.semesterId,
          schemeYear: subject.schemeYear,
          category,
        },
      });
    }

    // 4. Save file to disk
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    
    const fileExt = path.extname(file.name) || ".pdf";
    const filename = `${checksum}${fileExt}`;
    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    const relativePath = `/uploads/${filename}`;

    // 5. Create PENDING DocumentVersion record
    await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: versionNumber,
        status: DocumentStatus.PENDING_APPROVAL,
        filePath: relativePath,
        originalFilename: file.name,
        checksum,
        fileSize: file.size,
        mimeType: file.type || "application/pdf",
        isLatest: false, // only becomes latest when approved and ready
        uploaderId: session.userId,
        uploadedFrom: "WEB",
      },
    });

    revalidatePath("/teacher/dashboard");
    return { success: true };
  } catch (err) {
    console.error("Document upload action error:", err);
    return { error: "Failed to upload document. Please try again." };
  }
}
