const CANONICAL_ORIGIN = "https://www.deenreachconcept.com.ng";

export function getProductionOrigin(request?: Request): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "deenreachconcept.com.ng" || host === "www.deenreachconcept.com.ng") {
      return CANONICAL_ORIGIN;
    }
  }

  if (process.env.SITE_URL) {
    const configured = process.env.SITE_URL.replace(/\/+$/, "");
    try {
      const url = new URL(configured);
      if (url.hostname === "deenreachconcept.com.ng" || url.hostname === "www.deenreachconcept.com.ng") {
        return CANONICAL_ORIGIN;
      }
    } catch {
      // Ignore malformed configuration and use the canonical production origin.
    }
  }

  // Never derive SEO URLs from Vercel preview hosts or request hosts.
  return CANONICAL_ORIGIN;
}

export const getCanonicalOrigin = getProductionOrigin;
