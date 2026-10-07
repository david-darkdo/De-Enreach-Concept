import { createFileRoute } from "@tanstack/react-router";
import { getProductionOrigin } from "@/lib/origin";
import { getCanonicalProductUrl } from "@/lib/product-url";
import { supabase } from "@/integrations/supabase/client";
import { publicImageUrl } from "@/components/ImageUploader";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap-images.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = getProductionOrigin(request);
        const items: { loc: string; imageLoc: string; title: string; caption: string }[] = [];

        try {
          const { data: products } = await supabase
            .from("products" as any)
            .select("id, slug, name, alt_text, seo_description, image_url, generated_installed_image, generated_studio_image")
            .eq("status", "published")
            .eq("hidden", false)
            .is("deleted_at", null);

          for (const p of (products || []) as any[]) {
            if (!p.slug) continue;
            const productUrl = getCanonicalProductUrl(p, origin);
            const title = p.name || "De Enreach Concept product";
            const caption = p.alt_text || p.seo_description || title;
            const rawImages = [p.image_url, p.generated_studio_image, p.generated_installed_image].filter(Boolean);
            const processedUrls = Array.from(
              new Set(rawImages.map((img) => publicImageUrl(img)).filter(Boolean))
            ) as string[];

            for (const imageLoc of processedUrls) {
              items.push({ loc: productUrl, imageLoc, title, caption });
            }
          }
        } catch (err) {
          console.error("Failed to generate sitemap-images:", err);
        }

        const urlEntries = items.map((item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <image:image>
      <image:loc>${escapeXml(item.imageLoc)}</image:loc>
      <image:title>${escapeXml(item.title)}</image:title>
      <image:caption>${escapeXml(item.caption)}</image:caption>
    </image:image>
  </url>`).join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
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
