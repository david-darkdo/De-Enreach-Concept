import { createFileRoute } from '@tanstack/react-router';
import { getProductionOrigin } from "@/lib/origin";
import { getCanonicalProductUrl } from "@/lib/product-url";
import { supabase } from "@/integrations/supabase/client";

function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap-products.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = getProductionOrigin(request);
        const now = new Date().toISOString();
        const urls: { loc: string; lastmod: string }[] = [];

        try {
          const { data: products } = await supabase
            .from("products" as any)
            .select("id, slug, name, updated_at, created_at")
            .eq("status", "published")
            .eq("hidden", false)
            .is("deleted_at", null)
            .order("created_at", { ascending: false });

          if (products) {
            for (const p of (products as any[])) {
              urls.push({
                loc: getCanonicalProductUrl(p, origin),
                lastmod: p.updated_at || p.created_at || now,
              });
            }
          }
        } catch (err) {
          console.error("Failed to generate sitemap-products:", err);
        }

        const urlEntries = urls
          .map(
            (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`
          )
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
