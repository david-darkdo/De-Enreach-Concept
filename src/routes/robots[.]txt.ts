import { createFileRoute } from "@tanstack/react-router";
import { getProductionOrigin } from "@/lib/origin";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = getProductionOrigin(request);
        const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /account
Disallow: /account/
Disallow: /favorites
Disallow: /favorites/

Sitemap: ${origin}/sitemap.xml
`;

        return new Response(robotsTxt, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
