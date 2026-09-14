/**
 * Authoritative Slug Normalization Function
 * 
 * Guarantees:
 * - Lowercase
 * - Trimmed whitespace
 * - Spaces converted to single hyphens
 * - Multiple hyphens collapsed
 * - Leading and trailing hyphens removed
 * - Unsafe URL characters removed
 */
export function slugify(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")           // Replace spaces with -
    .replace(/[^\w\-]+/g, "")       // Remove all non-word chars
    .replace(/\-\-+/g, "-")          // Replace multiple - with single -
    .replace(/^-+/, "")             // Trim - from start of text
    .replace(/-+$/, "");            // Trim - from end of text
}

export interface SlugGenerationInput {
  name: string;
  code?: string | null;
  manualSlug?: string | null;
  typePrefix?: string | null;
}

/**
 * Generates an authoritative, 100% deterministic product slug.
 * Zero reliance on Math.random().
 * 
 * If manualSlug is supplied, normalizes manualSlug.
 * Otherwise, combines code + name (or name if code is missing).
 */
export function generateDeterministicProductSlug(input: SlugGenerationInput): string {
  if (input.manualSlug && input.manualSlug.trim()) {
    const cleanManual = slugify(input.manualSlug);
    if (cleanManual) return cleanManual;
  }

  const cleanName = slugify(input.name);
  if (input.code && input.code.trim()) {
    const cleanCode = slugify(input.code);
    if (cleanCode && cleanName) {
      // If cleanName already starts with the cleanCode, avoid double prefixing
      if (cleanName.startsWith(cleanCode)) {
        return cleanName;
      }
      return `${cleanCode}-${cleanName}`;
    }
    if (cleanCode) return cleanCode;
  }

  return cleanName || "product";
}
