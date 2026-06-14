export interface FlashcardData {
  front: string;
  back: string;
}

export function generateGroundedFlashcards(retrievedContext: string): FlashcardData[] {
  // Simulates generation of flashcards grounded in context
  return [
    {
      front: "What is Mutual Exclusion?",
      back: "A requirement that only one process can access a shared resource at a time."
    },
    {
      front: "What is a Deadlock?",
      back: "A state where a set of processes are blocked because each process is holding a resource and waiting for another."
    }
  ];
}
