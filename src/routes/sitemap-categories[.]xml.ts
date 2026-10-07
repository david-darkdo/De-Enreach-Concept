import { createFileRoute } from '@tanstack/react-router';
import { getProductionOrigin } from "@/lib/origin";
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

export const Route = createFileRoute("/sitemap-categories.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = getProductionOrigin(request);
        const urls: { loc: string; lastmod: string; priority: string }[] = [];

        try {
          // The showroom uses one catalogue route ("/") with query parameters
          // for type -> category -> subcategory filtering. Emit only URLs
          // that the actual showroom can resolve.
          const [tRes, cRes, sRes] = await Promise.all([
            supabase.from("product_types" as any).select("id, slug, created_at"),
            supabase.from("categories" as any).select("id, type_id, slug, created_at"),
            supabase.from("subcategories" as any).select("id, category_id, slug, created_at"),
          ]);

          const types = (tRes.data || []) as any[];
          const categories = (cRes.data || []) as any[];
          const subcategories = (sRes.data || []) as any[];

          const typeMap = new Map(types.map((t) => [t.id, t]));
          const catMap = new Map(categories.map((c) => [c.id, c]));

          const addFilteredUrl = (
            params: Record<string, string>,
            lastmod: string | null | undefined,
            priority: string,
          ) => {
            const search = new URLSearchParams(params);
            urls.push({
              loc: `${origin}/?${search.toString()}`,
              lastmod: lastmod || new Date().toISOString(),
              priority,
            });
          };

          // Product-type views: /?type=doors
          for (const type of types) {
            if (type.slug) {
              addFilteredUrl({ type: type.slug }, type.created_at, "0.9");
            }
          }

          // Category views: /?type=doors&category=interior-doors
          for (const category of categories) {
            const type = typeMap.get(category.type_id);
            if (type?.slug && category.slug) {
              addFilteredUrl(
                { type: type.slug, category: category.slug },
                category.created_at,
                "0.85",
              );
            }
          }

          // Subcategory views: /?type=doors&category=interior-doors&subcategory=Left+doors
          for (const subcategory of subcategories) {
            const category = catMap.get(subcategory.category_id);
            const type = category ? typeMap.get(category.type_id) : null;

            if (type?.slug && category?.slug && subcategory.slug) {
              addFilteredUrl(
                {
                  type: type.slug,
                  category: category.slug,
                  subcategory: subcategory.slug,
                },
                subcategory.created_at,
                "0.8",
              );
            }
          }
        } catch (err) {
          console.error("Failed to generate sitemap-categories:", err);
        }

        const urlEntries = urls
          .map(
            (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${escapeXml(u.lastmod)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
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
