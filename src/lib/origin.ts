export const AUTHORITATIVE_CANONICAL_DOMAIN = "https://www.deenreachconcept.com.ng";

/**
 * Returns the single authoritative canonical origin for Google indexing,
 * Open Graph metadata, XML sitemaps, and JSON-LD schemas.
 * 
 * Always resolves to the official production domain https://www.deenreachconcept.com.ng
 * unless explicitly overridden by the SITE_URL environment variable.
 */
export function getCanonicalOrigin(): string {
  if (typeof process !== "undefined" && process.env?.SITE_URL) {
    return process.env.SITE_URL.replace(/\/+$/, "");
  }
  return AUTHORITATIVE_CANONICAL_DOMAIN;
}

/**
 * Resolves the production origin. For canonical SEO, XML sitemaps, and schemas,
 * it returns the authoritative production domain.
 */
export function getProductionOrigin(request?: Request): string {
  if (typeof process !== "undefined" && process.env?.SITE_URL) {
    return process.env.SITE_URL.replace(/\/+$/, "");
  }
  return AUTHORITATIVE_CANONICAL_DOMAIN;
}
