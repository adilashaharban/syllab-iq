export interface PracticeQuestionData {
  question: string;
  answer: string;
  options: string[];
}

export function generateGroundedPracticeQuestions(retrievedContext: string): PracticeQuestionData[] {
  // Simulates generation of multiple choice practice questions grounded in context
  return [
    {
      question: "Which of the following is NOT a necessary condition for deadlock?",
      answer: "Preemption",
      options: ["Mutual Exclusion", "Hold and Wait", "No Preemption", "Preemption"]
    },
    {
      question: "What does a resource allocation graph containing a cycle represent in a single-unit resource system?",
      answer: "A Deadlock",
      options: ["Mutual Exclusion", "A Deadlock", "Starvation", "Hold and Wait"]
    }
  ];
}
