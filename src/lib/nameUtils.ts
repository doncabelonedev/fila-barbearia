const INVALID_NAME_CHARS = /[^A-Za-zÀ-ÿ\s'-]/g;

export function sanitizeNameInput(value: string): string {
  return value.replace(INVALID_NAME_CHARS, "");
}
