import { createFileRoute } from "@tanstack/react-router";
import { getProductionOrigin } from "@/lib/origin";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = getProductionOrigin(request);
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${origin}/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>${origin}/sitemap-categories.xml</loc></sitemap>
  <sitemap><loc>${origin}/sitemap-products.xml</loc></sitemap>
  <sitemap><loc>${origin}/sitemap-images.xml</loc></sitemap>
</sitemapindex>`;

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
