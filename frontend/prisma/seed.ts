import { prisma } from '../src/lib/db';
import bcrypt from 'bcryptjs';
import { UserRole, UserStatus, DocumentStatus, DocumentCategory, ChunkContentType, ConceptEdgeType } from '../generated/prisma/enums';

async function main() {
  console.log('Seeding database...');

  // 1. Clean existing data (child tables first)
  await prisma.chatMessage.deleteMany({});
  await prisma.chatSession.deleteMany({});
  await prisma.retrievalLog.deleteMany({});
  await prisma.generatedQuestion.deleteMany({});
  await prisma.questionSet.deleteMany({});
  await prisma.figure.deleteMany({});
  await prisma.chunk.deleteMany({});
  await prisma.documentVersion.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.teacherSubject.deleteMany({});
  await prisma.courseEnrollment.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.semester.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.branch.deleteMany({});

  // 2. Create Branches
  const branches = [];
  const branchNames = [
    'Computer Science',
    'Information Technology',
    'Electronics & Communication',
    'Electrical & Electronics',
    'Mechanical Engineering',
    'Civil Engineering',
  ];

  for (const name of branchNames) {
    const branch = await prisma.branch.create({
      data: { name },
    });
    branches.push(branch);
  }

  const cseBranch = branches.find((b) => b.name === 'Computer Science')!;
  const ceBranch = branches.find((b) => b.name === 'Civil Engineering')!;
  const eeeBranch = branches.find((b) => b.name === 'Electrical & Electronics')!;

  // 3. Create Semesters (1 to 8) for each branch
  const semesterMap: Record<string, number> = {}; // key: branchId_semNum, value: semesterId
  for (const branch of branches) {
    for (let semNum = 1; semNum <= 8; semNum++) {
      const semester = await prisma.semester.create({
        data: {
          branchId: branch.id,
          semesterNumber: semNum,
        },
      });
      semesterMap[`${branch.id}_${semNum}`] = semester.id;
    }
  }

  // 4. Create Subjects
  const subjectsData = [
    {
      code: 'CSL302',
      name: 'Compiler Design',
      semesterNumber: 6,
      branchId: cseBranch.id,
      schemeYear: 2024,
      credits: 4,
    },
    {
      code: 'CSL304',
      name: 'Operating Systems',
      semesterNumber: 6,
      branchId: cseBranch.id,
      schemeYear: 2024,
      credits: 4,
    },
    {
      code: 'CSL306',
      name: 'Machine Learning',
      semesterNumber: 6,
      branchId: cseBranch.id,
      schemeYear: 2024,
      credits: 4,
    },
    {
      code: 'CSL308',
      name: 'Computer Networks',
      semesterNumber: 6,
      branchId: cseBranch.id,
      schemeYear: 2024,
      credits: 4,
    },
    {
      code: 'CEL302',
      name: 'Civil Engineering Structures',
      semesterNumber: 6,
      branchId: ceBranch.id,
      schemeYear: 2024,
      credits: 4,
    },
    {
      code: 'EEL304',
      name: 'Electrical Machines',
      semesterNumber: 6,
      branchId: eeeBranch.id,
      schemeYear: 2024,
      credits: 4,
    },
  ];

  const subjects = [];
  for (const sub of subjectsData) {
    const semId = semesterMap[`${sub.branchId}_${sub.semesterNumber}`];
    const createdSubject = await prisma.subject.create({
      data: {
        code: sub.code,
        name: sub.name,
        branchId: sub.branchId,
        semesterId: semId,
        schemeYear: sub.schemeYear,
        credits: sub.credits,
      },
    });
    subjects.push(createdSubject);
  }

  const compilerDesign = subjects.find((s) => s.code === 'CSL302')!;
  const operatingSystems = subjects.find((s) => s.code === 'CSL304')!;
  const machineLearning = subjects.find((s) => s.code === 'CSL306')!;

  // 5. Create Users (passwords: 'password123')
  const passwordHash = await bcrypt.hash('password123', 12);

  // Admin
  const admin = await prisma.user.create({
    data: {
      email: 'admin@syllabiq.edu',
      passwordHash,
      fullName: 'System Administrator',
      phone: '0000000000',
      role: UserRole.ADMIN,
      status: UserStatus.APPROVED,
      college: 'SyllabiQ University',
    },
  });

  // Student
  const student = await prisma.user.create({
    data: {
      email: 'student@syllabiq.edu',
      passwordHash,
      fullName: 'Adila Student',
      phone: '1111111111',
      role: UserRole.STUDENT,
      status: UserStatus.APPROVED,
      college: 'SyllabiQ Academy',
      admissionYear: 2023,
      graduationYear: 2027,
      branchId: cseBranch.id,
      selectedSemester: 6,
      currentScheme: 2024,
    },
  });

  // Enroll student in all CSE Semester 6 subjects
  const cseSemester6Subjects = subjects.filter(
    (s) => s.branchId === cseBranch.id && s.semesterId === semesterMap[`${cseBranch.id}_6`]
  );

  for (const s of cseSemester6Subjects) {
    await prisma.courseEnrollment.create({
      data: {
        studentId: student.id,
        subjectId: s.id,
        status: "ACTIVE",
      },
    });
  }

  // Teacher
  const teacher = await prisma.user.create({
    data: {
      email: 'teacher@syllabiq.edu',
      passwordHash,
      fullName: 'Dr. John Smith',
      phone: '2222222222',
      role: UserRole.TEACHER,
      status: UserStatus.APPROVED,
      college: 'SyllabiQ Academy',
      department: 'Computer Science',
      employeeId: 'T1001',
    },
  });

  // Assign subjects to teacher
  await prisma.teacherSubject.create({
    data: {
      teacherId: teacher.id,
      subjectId: compilerDesign.id,
    },
  });

  await prisma.teacherSubject.create({
    data: {
      teacherId: teacher.id,
      subjectId: operatingSystems.id,
    },
  });

  await prisma.teacherSubject.create({
    data: {
      teacherId: teacher.id,
      subjectId: machineLearning.id,
    },
  });

  // 6. Create Documents & Chunks for RAG testing
  // Compiler Design Textbook
  const docCompiler = await prisma.document.create({
    data: {
      title: 'Compilers: Principles, Techniques, and Tools',
      description: 'The standard dragon book for Compiler Design.',
      subjectId: compilerDesign.id,
      branchId: cseBranch.id,
      semesterId: semesterMap[`${cseBranch.id}_6`],
      schemeYear: 2024,
      category: DocumentCategory.TEXTBOOK,
    },
  });

  const versionCompiler = await prisma.documentVersion.create({
    data: {
      documentId: docCompiler.id,
      version: 1,
      status: DocumentStatus.READY,
      filePath: '/uploads/compiler_dragon_book.pdf',
      originalFilename: 'compiler_dragon_book.pdf',
      checksum: 'hash_dragon_book_compiler_123',
      fileSize: 4520194,
      mimeType: 'application/pdf',
      isLatest: true,
      uploaderId: teacher.id,
      approvedBy: admin.id,
      approvedAt: new Date(),
      parserVersion: 'v1.0',
      chunkCount: 3,
    },
  });

  // Create chunks for Compiler Design
  const chunksCompiler = [
    {
      chunkIndex: 0,
      text: 'A compiler is a program that reads a program written in one language—the source language—and translates it into an equivalent program in another language—the target language.',
      pageNumberStart: 1,
      pageNumberEnd: 2,
      sectionTitle: '1.1 Introduction',
    },
    {
      chunkIndex: 1,
      text: 'Lexical analysis is the first phase of a compiler. Its main task is to read the input characters of the source program, group them into lexemes, and produce as output a sequence of tokens.',
      pageNumberStart: 10,
      pageNumberEnd: 12,
      sectionTitle: '3.1 Lexical Analysis',
    },
    {
      chunkIndex: 2,
      text: 'Syntax analysis, or parsing, is the phase of the compiler that groups the tokens produced by the lexical analyzer into grammatical phrases, represented by a parse tree.',
      pageNumberStart: 50,
      pageNumberEnd: 52,
      sectionTitle: '4.1 Syntax Analysis',
    },
  ];

  for (const c of chunksCompiler) {
    await prisma.chunk.create({
      data: {
        documentVersionId: versionCompiler.id,
        chunkIndex: c.chunkIndex,
        text: c.text,
        pageNumberStart: c.pageNumberStart,
        pageNumberEnd: c.pageNumberEnd,
        sectionTitle: c.sectionTitle,
        contentType: ChunkContentType.TEXT,
        tokenCount: c.text.split(' ').length,
      },
    });
  }

  // Operating Systems Textbook (Galvin)
  const docOS = await prisma.document.create({
    data: {
      title: 'Operating System Concepts',
      description: 'The standard Silberschatz & Galvin textbook for OS.',
      subjectId: operatingSystems.id,
      branchId: cseBranch.id,
      semesterId: semesterMap[`${cseBranch.id}_6`],
      schemeYear: 2024,
      category: DocumentCategory.TEXTBOOK,
    },
  });

  const versionOS = await prisma.documentVersion.create({
    data: {
      documentId: docOS.id,
      version: 1,
      status: DocumentStatus.READY,
      filePath: '/uploads/os_galvin_concepts.pdf',
      originalFilename: 'os_galvin_concepts.pdf',
      checksum: 'hash_os_concepts_galvin_123',
      fileSize: 6738102,
      mimeType: 'application/pdf',
      isLatest: true,
      uploaderId: teacher.id,
      approvedBy: admin.id,
      approvedAt: new Date(),
      parserVersion: 'v1.0',
      chunkCount: 2,
    },
  });

  const chunksOS = [
    {
      chunkIndex: 0,
      text: 'An operating system is a program that manages a computer\'s hardware. It also provides a basis for application programs and acts as an intermediary between the computer user and the computer hardware.',
      pageNumberStart: 3,
      pageNumberEnd: 5,
      sectionTitle: '1.1 What Operating Systems Do',
    },
    {
      chunkIndex: 1,
      text: 'Process synchronization refers to the coordination of execution of multiple processes in a multi-process system to ensure that they do not access the same shared resources simultaneously, leading to race conditions.',
      pageNumberStart: 180,
      pageNumberEnd: 184,
      sectionTitle: '5.1 Process Synchronization',
    },
  ];

  for (const c of chunksOS) {
    await prisma.chunk.create({
      data: {
        documentVersionId: versionOS.id,
        chunkIndex: c.chunkIndex,
        text: c.text,
        pageNumberStart: c.pageNumberStart,
        pageNumberEnd: c.pageNumberEnd,
        sectionTitle: c.sectionTitle,
        contentType: ChunkContentType.TEXT,
        tokenCount: c.text.split(' ').length,
      },
    });
  }

  // Add a sample figure for OS
  await prisma.figure.create({
    data: {
      documentVersionId: versionOS.id,
      pageNumber: 182,
      caption: 'Figure 5.1: Critical section diagram detailing mutual exclusion.',
      imagePath: '/uploads/figures/critical_section.png',
      metadata: { relatedChunkIds: [5] },
    },
  });

  // Create mock Concepts for Operating Systems
  const conceptDeadlock = await prisma.concept.create({
    data: {
      slug: "deadlock",
      name: "Deadlocks",
      subjectId: operatingSystems.id,
      description: "A deadlock is a situation where a set of processes are blocked because each process is holding a resource and waiting for another resource held by some other process.",
    },
  });

  const conceptBankers = await prisma.concept.create({
    data: {
      slug: "bankers-algorithm",
      name: "Banker's Algorithm",
      subjectId: operatingSystems.id,
      description: "The Banker's algorithm is a resource allocation and deadlock avoidance algorithm that tests for safety by simulating the allocation of predetermined maximum possible amounts of all resources.",
    },
  });

  const conceptRAG = await prisma.concept.create({
    data: {
      slug: "resource-allocation-graph",
      name: "Resource Allocation Graph",
      subjectId: operatingSystems.id,
      description: "A directed graph that depicts the state of a system of resources and processes.",
    },
  });

  // Create mock ConceptEdges
  await prisma.conceptEdge.create({
    data: {
      fromConceptId: conceptRAG.id,
      toConceptId: conceptDeadlock.id,
      relationship: ConceptEdgeType.RELATED,
      graphVersion: "v1.0",
    },
  });

  await prisma.conceptEdge.create({
    data: {
      fromConceptId: conceptBankers.id,
      toConceptId: conceptDeadlock.id,
      relationship: ConceptEdgeType.PREREQUISITE,
      graphVersion: "v1.0",
    },
  });

  console.log('Database seeded successfully!');
  console.log('Users created:');
  console.log(`- Admin: admin@syllabiq.edu (password123)`);
  console.log(`- Student: student@syllabiq.edu (password123)`);
  console.log(`- Teacher: teacher@syllabiq.edu (password123)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
