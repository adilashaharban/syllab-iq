// Deterministic Prerequisite Mapping
export const PREREQUISITE_MAP: Record<string, string[]> = {
  "OPERATING SYSTEMS": ["COMPUTER ORGANIZATION", "DATA STRUCTURES"],
  "COMPILER DESIGN": ["FORMAL LANGUAGES", "DATA STRUCTURES"],
  "MACHINE LEARNING": ["PROBABILITY", "LINEAR ALGEBRA"],
};

export const CATEGORY_PRIORITIES: Record<string, number> = {
  "TEXTBOOK": 100,
  "REFERENCE_BOOK": 90,
  "LECTURE_NOTES": 80,
  "PPT": 70,
  "SYLLABUS": 60,
  "MARKING_SCHEME": 50,
  "PREVIOUS_YEAR_PAPER": 40,
  "LAB_MANUAL": 30,
};

export function getExpandedSubjects(subjectName: string) {
  return PREREQUISITE_MAP[subjectName.toUpperCase()] || [];
}
