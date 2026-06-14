export function validateTextInput(message?: string) {
  const trimmed = message?.trim();
  if (!trimmed) {
    throw new Error("Empty query message.");
  }
  return trimmed;
}
