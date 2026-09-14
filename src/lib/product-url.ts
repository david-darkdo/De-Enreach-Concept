import { slugify, generateDeterministicProductSlug } from "./slug";
import { getCanonicalOrigin } from "./origin";

export interface MinimumProductInfo {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  code?: string | null;
}

/**
 * Returns the single authoritative normalized slug for a product.
 * 
 * 1. Prioritizes product.slug if present (guarantees 100% preservation of existing published URLs).
 * 2. If slug is absent, deterministically generates slug from code + name.
 * 3. Falls back to product.name, then product.id.
 */
export function getCanonicalProductSlug(product: MinimumProductInfo | null | undefined): string {
  if (!product) return "";
  
  // 1. Existing published slug preservation: Return exactly as stored in DB
  if (product.slug && product.slug.trim()) {
    return product.slug.trim();
  }
  
  // 2. Deterministic derivation if slug is absent
  if (product.code || product.name) {
    return generateDeterministicProductSlug({
      code: product.code,
      name: product.name || "",
    });
  }
  
  return product.id || "";
}

/**
 * Returns the relative canonical path for a product: /product/{slug}
 */
export function getCanonicalProductPath(product: MinimumProductInfo | null | undefined): string {
  const slug = getCanonicalProductSlug(product);
  return slug ? `/product/${slug}` : "/";
}

/**
 * Returns the absolute canonical URL for a product: https://{domain}/product/{slug}
 * Defaults to the authoritative canonical domain (https://www.deenreachconcept.com.ng).
 */
export function getCanonicalProductUrl(
  product: MinimumProductInfo | null | undefined,
  origin: string = getCanonicalOrigin()
): string {
  const base = origin.replace(/\/+$/, "");
  const path = getCanonicalProductPath(product);
  return `${base}${path}`;
}
