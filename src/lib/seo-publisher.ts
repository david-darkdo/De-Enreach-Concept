import { supabase } from "@/integrations/supabase/client";
import { getCanonicalOrigin } from "@/lib/origin";

export async function triggerSitemapUpdate(productId?: string): Promise<void> {
  try {
    const origin = getCanonicalOrigin();

    if (productId) {
      await supabase
        .from("products" as any)
        .update({ updated_at: new Date().toISOString() } as any)
        .eq("id", productId);
    }

    // Sitemap files are dynamically generated from the database. Do not ping
    // search engines or use preview hosts; Google discovers the sitemap from
    // robots.txt/Search Console and refreshes it on its own schedule.
    if (typeof window !== "undefined") {
      void fetch(`${origin}/sitemap.xml`, { method: "GET", cache: "no-store" }).catch(() => {});
    }
  } catch (err) {
    console.error("Auto sitemap publisher error:", err);
  }
}
