import { getProductionOrigin } from "./origin";

export interface MinimumProductInfo {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
}

/**
 * The stored product slug is the permanent URL identity.
 * Do not normalize or regenerate it during rendering: changing it creates a
 * different URL and can introduce redirects/duplicate canonical paths.
 */
export function getCanonicalProductSlug(product: MinimumProductInfo | null | undefined): string {
  if (!product) return "";
  const storedSlug = product.slug?.trim();
  if (storedSlug) return storedSlug;
  return "";
}

export function getCanonicalProductPath(product: MinimumProductInfo | null | undefined): string {
  const slug = getCanonicalProductSlug(product);
  return slug ? `/product/${encodeURIComponent(slug)}` : "/";
}

export function getCanonicalProductUrl(
  product: MinimumProductInfo | null | undefined,
  origin: string = getProductionOrigin()
): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${getCanonicalProductPath(product)}`;
}
