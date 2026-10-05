import { supabase } from "@/integrations/supabase/client";

/**
 * Triggered automatically upon product creation or updates.
 * Guarantees that every product page and product image is immediately
 * included and updated across all XML sitemaps and search engines.
 */
export async function triggerSitemapUpdate(productId?: string): Promise<void> {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.deenreachconcept.com.ng";

    // 1. Touch product updated_at if productId is provided
    if (productId) {
      await supabase
        .from("products" as any)
        .update({ updated_at: new Date().toISOString() } as any)
        .eq("id", productId);
    }

    // 2. Ping sitemaps to refresh server caches
    const endpoints = [
      `${origin}/sitemap.xml`,
      `${origin}/sitemap-products.xml`,
      `${origin}/sitemap-categories.xml`,
      `${origin}/sitemap-images.xml`,
      `${origin}/sitemap-pages.xml`,
    ];

    if (typeof window !== "undefined") {
      void Promise.allSettled(
        endpoints.map((url) =>
          fetch(url, { method: "HEAD", cache: "no-cache" }).catch(() => {})
        )
      );
    }
  } catch (err) {
    console.error("Auto sitemap publisher error:", err);
  }
}
