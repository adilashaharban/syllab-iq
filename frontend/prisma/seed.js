const { PrismaClient } = require('../generated/prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Clean existing data
  await prisma.chatMessage.deleteMany({});
  await prisma.chatSession.deleteMany({});
  await prisma.teacherSubject.deleteMany({});
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

  const cseBranch = branches.find((b) => b.name === 'Computer Science');
  const ceBranch = branches.find((b) => b.name === 'Civil Engineering');
  const eeeBranch = branches.find((b) => b.name === 'Electrical & Electronics');

  // 3. Create Semesters (1 to 8) for each branch
  const semesterMap = {}; // key: branchId_semNum, value: semesterId
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
  // For CSE Semester 6:
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
    // For CE Semester 6:
    {
      code: 'CEL302',
      name: 'Civil Engineering Structures',
      semesterNumber: 6,
      branchId: ceBranch.id,
      schemeYear: 2024,
      credits: 4,
    },
    // For EEE Semester 6:
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

  const compilerDesign = subjects.find((s) => s.code === 'CSL302');
  const machineLearning = subjects.find((s) => s.code === 'CSL306');

  // 5. Create Users (passwords: 'password123')
  const passwordHash = await bcrypt.hash('password123', 12);

  // Admin
  const admin = await prisma.user.create({
    data: {
      email: 'admin@syllabiq.edu',
      passwordHash,
      fullName: 'System Administrator',
      phone: '0000000000',
      role: 'ADMIN',
      status: 'APPROVED',
      college: 'SyllabiQ University',
    },
  });

  // Student (with onboarding done)
  const student = await prisma.user.create({
    data: {
      email: 'student@syllabiq.edu',
      passwordHash,
      fullName: 'Adila Student',
      phone: '1111111111',
      role: 'STUDENT',
      status: 'APPROVED',
      college: 'SyllabiQ Academy',
      admissionYear: 2023,
      graduationYear: 2027,
      branchId: cseBranch.id,
      selectedSemester: 6,
      currentScheme: 2024,
    },
  });

  // Teacher (approved, with assigned subjects)
  const teacher = await prisma.user.create({
    data: {
      email: 'teacher@syllabiq.edu',
      passwordHash,
      fullName: 'Dr. John Smith',
      phone: '2222222222',
      role: 'TEACHER',
      status: 'APPROVED',
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
      subjectId: machineLearning.id,
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
