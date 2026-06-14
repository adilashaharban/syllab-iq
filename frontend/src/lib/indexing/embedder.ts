export async function generateEmbedding(text: string): Promise<string> {
  // Simulates generating a text vector representation
  return "emb_" + Math.random().toString(36).substring(2, 9);
}
