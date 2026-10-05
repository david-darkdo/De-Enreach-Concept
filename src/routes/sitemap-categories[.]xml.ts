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
        const now = new Date().toISOString();
        const urls: { loc: string; lastmod: string; priority: string }[] = [];

        try {
          // Fetch flat taxonomy tables
          const [tRes, cRes, sRes, fRes] = await Promise.all([
            supabase.from("product_types" as any).select("id, slug, created_at"),
            supabase.from("categories" as any).select("id, type_id, slug, created_at"),
            supabase.from("subcategories" as any).select("id, category_id, slug, created_at"),
            supabase.from("family_groups" as any).select("id, subcategory_id, slug, created_at"),
          ]);

          const types = (tRes.data || []) as any[];
          const categories = (cRes.data || []) as any[];
          const subcategories = (sRes.data || []) as any[];
          const families = (fRes.data || []) as any[];

          const typeMap = new Map(types.map((t) => [t.id, t]));
          const catMap = new Map(categories.map((c) => [c.id, c]));
          const subMap = new Map(subcategories.map((s) => [s.id, s]));

          // 1. Product Types
          for (const t of types) {
            if (t.slug) {
              urls.push({
                loc: `${origin}/${t.slug}`,
                lastmod: t.created_at || now,
                priority: "0.9",
              });
            }
          }

          // 2. Categories
          for (const c of categories) {
            const type = typeMap.get(c.type_id);
            if (type?.slug && c.slug) {
              urls.push({
                loc: `${origin}/${type.slug}/${c.slug}`,
                lastmod: c.created_at || now,
                priority: "0.85",
              });
            }
          }

          // 3. Subcategories
          for (const s of subcategories) {
            const cat = catMap.get(s.category_id);
            const type = cat ? typeMap.get(cat.type_id) : null;
            if (type?.slug && cat?.slug && s.slug) {
              urls.push({
                loc: `${origin}/${type.slug}/${cat.slug}/${s.slug}`,
                lastmod: s.created_at || now,
                priority: "0.8",
              });
            }
          }

          // 4. Family Groups
          for (const f of families) {
            if (!f.slug) continue;
            const sub = f.subcategory_id ? subMap.get(f.subcategory_id) : null;
            const cat = sub ? catMap.get(sub.category_id) : (f.category_id ? catMap.get(f.category_id) : null);
            const type = cat ? typeMap.get(cat.type_id) : null;

            if (type?.slug && cat?.slug && sub?.slug) {
              urls.push({
                loc: `${origin}/${type.slug}/${cat.slug}/${sub.slug}/${f.slug}`,
                lastmod: f.created_at || now,
                priority: "0.75",
              });
            } else if (type?.slug && cat?.slug) {
              urls.push({
                loc: `${origin}/${type.slug}/${cat.slug}/${f.slug}`,
                lastmod: f.created_at || now,
                priority: "0.75",
              });
            }
          }
        } catch (err) {
          console.error("Failed to generate sitemap-categories:", err);
        }

        const urlEntries = urls
          .map(
            (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${u.priority}</priority>
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
