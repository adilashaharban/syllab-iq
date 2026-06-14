export function chunkDocumentText(text: string): string[] {
  // Simulates chunking text dynamically
  return text.split("\n\n").filter(t => t.trim().length > 0);
}
