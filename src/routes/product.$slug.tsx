import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ProductCard } from "@/components/ProductCard";
import { fetchProductBySlug, fetchRelatedProducts } from "@/lib/catalog";
import { ArrowLeft, Heart, ShoppingBag, X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { AddToCollectionButton } from "@/components/AddToCollectionButton";
import { publicImageUrl } from "@/components/ImageUploader";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFavorites } from "@/hooks/useFavorites";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { getProductionOrigin } from "@/lib/origin";
import { getCanonicalProductSlug, getCanonicalProductUrl, getCanonicalProductPath } from "@/lib/product-url";

const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: async () => {
      const p = await fetchProductBySlug(slug);
      if (!p) throw notFound();
      return p;
    },
  });

const relatedQuery = (familyId: string | null, excludeId: string) =>
  queryOptions({
    queryKey: ["related", familyId, excludeId],
    queryFn: () => fetchRelatedProducts(familyId, excludeId),
    enabled: !!familyId,
  });

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ context, params }) => {
    const origin = getProductionOrigin();
    const product = await context.queryClient.ensureQueryData(productQuery(params.slug));

    // Redirect unnormalized or legacy slug formats to canonical URL (HTTP 301)
    const canonicalSlug = getCanonicalProductSlug(product);
    if (params.slug !== canonicalSlug) {
      throw redirect({
        href: getCanonicalProductUrl(product, origin),
        statusCode: 301,
      });
    }

    context.queryClient.ensureQueryData(relatedQuery(product.family_id, product.id));

    // Fetch taxonomy parents
    const [typeRes, categoryRes, subcategoryRes, familyRes] = await Promise.all([
      product.type_id ? supabase.from("product_types").select("name, slug").eq("id", product.type_id).maybeSingle() : Promise.resolve({ data: null }),
      product.category_id ? supabase.from("categories").select("name, slug").eq("id", product.category_id).maybeSingle() : Promise.resolve({ data: null }),
      product.subcategory_id ? supabase.from("subcategories").select("name, slug").eq("id", product.subcategory_id).maybeSingle() : Promise.resolve({ data: null }),
      product.family_id ? supabase.from("family_groups").select("name, slug").eq("id", product.family_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    return {
      product,
      origin,
      taxonomy: {
        type: typeRes.data,
        category: categoryRes.data,
        subcategory: subcategoryRes.data,
        family: familyRes.data,
      }
    };
  },
  head: ({ loaderData }: any): any => {
    const product = loaderData?.product;
    const origin = loaderData?.origin || getProductionOrigin();
    const title = product?.seo_title || `${product?.name || "Product"} — Enreach Concepts`;
    const desc = product?.seo_description || product?.short_description || "Premium building material details.";
    const imageUrl = product?.generated_studio_image || product?.image_url || "";
    const canonical = getCanonicalProductUrl(product, origin);

    return {
      meta: [
        { title: title },
        { name: "description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: imageUrl ? publicImageUrl(imageUrl) : "" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: imageUrl ? publicImageUrl(imageUrl) : "" },
      ],
      links: [
        { rel: "canonical", href: canonical }
      ]
    };
  },
  component: ProductPage,

  notFoundComponent: () => (
    <AppShell>
      <div className="container-app py-16 text-center">
        <h1 className="font-display text-2xl">Product not found</h1>
        <Link to="/" className="mt-4 inline-block text-primary underline">
          Back to feed
        </Link>
      </div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="container-app py-16 text-center text-sm text-destructive">
        <h2 className="font-semibold text-lg">Failed to load product page</h2>
        <p className="mt-2 text-muted-foreground">{error.message}</p>
        <Link to="/" className="mt-4 inline-block text-primary underline">Back to feed</Link>
      </div>
    </AppShell>
  ),
});

function ProductDetailSkeleton() {
  return (
    <AppShell>
      <div className="container-app py-8 space-y-6 animate-pulse">
        {/* Breadcrumb skeleton */}
        <div className="h-3 w-48 bg-muted rounded"></div>

        {/* Gallery skeleton */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="aspect-square w-full bg-muted rounded-2xl"></div>
          <div className="aspect-[4/3] w-full bg-muted rounded-2xl"></div>
        </div>

        {/* Details skeleton */}
        <div className="space-y-3">
          <div className="h-3.5 w-32 bg-muted rounded"></div>
          <div className="h-8 w-80 bg-muted rounded"></div>
          <div className="h-6 w-24 bg-muted rounded"></div>
          <div className="h-20 w-full bg-muted rounded"></div>
        </div>
      </div>
    </AppShell>
  );
}

function ProductPage() {
  const { product, origin, taxonomy } = Route.useLoaderData();
  const { data: related = [] } = useSuspenseQuery(
    relatedQuery(product.family_id, product.id),
  );

  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isFav = isFavorite(product.id);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  // Gallery slider states
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxScale, setLightboxScale] = useState(1);

  const studio = publicImageUrl(product.generated_studio_image) || publicImageUrl(product.image_url);
  const installed = publicImageUrl(product.generated_installed_image) || publicImageUrl(product.image_url);

  const galleryImages = useMemo(() => {
    return [studio, installed].filter(Boolean) as string[];
  }, [studio, installed]);

  useEffect(() => {
    if (!product?.id) return;

    if (user?.id) {
      // Track page views
      const trackEvent = async () => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("auth_id", user.id)
          .maybeSingle();
        if (!profile?.id) return;

        await supabase.from("customer_activity").insert({
          user_id: profile.id,
          activity_type: "product_viewed",
          metadata: { productId: product.id, name: product.name, category: (product as any).category || "Uncategorized" }
        });
      };
      void trackEvent();
    }

    // Load recommendations
    const loadRecs = async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("status" as any, "published")
        .neq("id", product.id)
        .limit(4);
      setRecommendations(data || []);
    };
    void loadRecs();
  }, [product?.id, user?.id]);

  const handleToggleFavorite = () => {
    void toggleFavorite(product.id, product);
  };

  // Breadcrumbs config
  const breadcrumbs = useMemo(() => {
    const list = [{ label: "Home", path: "/" }];
    if (taxonomy.type) {
      list.push({ label: taxonomy.type.name, path: `/${taxonomy.type.slug}` });
      if (taxonomy.category) {
        list.push({ label: taxonomy.category.name, path: `/${taxonomy.type.slug}/${taxonomy.category.slug}` });
        if (taxonomy.subcategory) {
          list.push({ label: taxonomy.subcategory.name, path: `/${taxonomy.type.slug}/${taxonomy.category.slug}/${taxonomy.subcategory.slug}` });
          if (taxonomy.family) {
            list.push({ label: taxonomy.family.name, path: `/${taxonomy.type.slug}/${taxonomy.category.slug}/${taxonomy.subcategory.slug}/${taxonomy.family.slug}` });
          }
        }
      }
    }
    list.push({ label: product.name, path: getCanonicalProductPath(product) });
    return list;
  }, [taxonomy, product]);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((b, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": b.label,
      "item": b.path.startsWith("/") ? `${origin}${b.path}` : b.path
    }))
  };

  const canonicalProductUrl = getCanonicalProductUrl(product, origin);

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "image": galleryImages.map((img) => ({
      "@type": "ImageObject",
      "url": img,
      "name": product.alt_text || product.name,
      "caption": product.seo_description || product.short_description || product.name
    })),
    "description": product.seo_description || product.generated_description || product.short_description || "",
    "sku": product.code || product.id,
    "mpn": product.code || product.id,
    "brand": {
      "@type": "Brand",
      "name": product.brand || "Enreach Concepts"
    },
    "material": product.material || undefined,
    "color": product.color || undefined,
    "category": taxonomy.subcategory?.name ? `${taxonomy.category?.name || "Material"} > ${taxonomy.subcategory.name}` : (taxonomy.category?.name || "Material"),
    "offers": {
      "@type": "Offer",
      "url": canonicalProductUrl,
      "priceCurrency": "NGN",
      "price": product.price || 0,
      "priceValidUntil": "2027-12-31",
      "availability": "https://schema.org/InStock",
      "itemCondition": "https://schema.org/NewCondition",
      "seller": {
        "@type": "Organization",
        "name": "Enreach Concepts",
        "url": origin
      }
    }
  };

  const faqSchema = product.faq && Array.isArray(product.faq) ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": (product.faq as any[]).map((f) => ({
      "@type": "Question",
      "name": f.question || f.q || "",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.answer || f.a || ""
      }
    }))
  } : null;

  const handleLightboxNav = (dir: "prev" | "next") => {
    const idx = galleryImages.indexOf(lightboxImg || "");
    if (idx === -1) return;
    if (dir === "prev") {
      const nextIdx = (idx - 1 + galleryImages.length) % galleryImages.length;
      setLightboxImg(galleryImages[nextIdx]);
    } else {
      const nextIdx = (idx + 1) % galleryImages.length;
      setLightboxImg(galleryImages[nextIdx]);
    }
    setLightboxScale(1); // Reset zoom scale
  };

  return (
    <AppShell>
      {/* Schema LD Injections */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      {faqSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      )}
      {product.structured_data && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(product.structured_data) }} />
      )}

      <div className="container-app pt-2 pb-10">
        {/* Breadcrumb Row */}
        <nav className="flex items-center gap-1.5 overflow-x-auto pb-3 text-[10px] uppercase tracking-wider text-muted-foreground scrollbar-none">
          {breadcrumbs.map((b, index) => (
            <span key={index} className="flex items-center gap-1.5 shrink-0">
              {index > 0 && <span className="text-muted-foreground/30">/</span>}
              {index === breadcrumbs.length - 1 ? (
                <span className="font-semibold text-foreground truncate max-w-[120px]">{b.label}</span>
              ) : (
                <Link to={b.path} className="hover:text-primary transition">{b.label}</Link>
              )}
            </span>
          ))}
        </nav>

        {/* Gallery Grid */}
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {/* Main Studio View */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm aspect-square flex items-center justify-center">
            {galleryImages[activeImgIndex] ? (
              <img
                src={galleryImages[activeImgIndex]}
                alt={product.name}
                onClick={() => setLightboxImg(galleryImages[activeImgIndex])}
                className="w-full h-full object-cover cursor-zoom-in hover:scale-[1.01] transition-transform duration-300"
              />
            ) : (
              <div className="text-xs text-muted-foreground italic">No image assets</div>
            )}
          </div>

          {/* Installed Lifestyle Reference - Full Frame Cover */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between aspect-square">
            <div className="flex-1 overflow-hidden">
              {installed ? (
                <img
                  src={installed}
                  alt={`${product.name} installed scene`}
                  loading="lazy"
                  onClick={() => setLightboxImg(installed)}
                  className="w-full h-full object-cover cursor-zoom-in hover:scale-[1.01] transition-transform duration-300"
                />
              ) : (
                <div className="text-xs text-muted-foreground italic flex h-full items-center justify-center bg-muted/20">No installed preview uploaded</div>
              )}
            </div>
            <div className="border-t border-border px-3.5 py-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold bg-background shrink-0">
              Installed reference / lifestyle layout
            </div>
          </div>
        </div>

        {/* Thumbnail Selector Bar */}
        {galleryImages.length > 1 && (
          <div className="flex gap-2.5 mt-3 overflow-x-auto pb-1 scrollbar-none">
            {galleryImages.map((imgUrl, i) => (
              <button
                key={i}
                onClick={() => setActiveImgIndex(i)}
                className={`h-14 w-14 rounded-lg border overflow-hidden shrink-0 transition bg-card ${
                  activeImgIndex === i ? "border-primary shadow-sm" : "border-border hover:border-primary/45"
                }`}
              >
                <img src={imgUrl} alt="thumbnail" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Product Details Section */}
        <div className="mt-6 space-y-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.18em] text-primary font-bold">
              {product.brand || "Enreach Concepts"} · Code {product.code}
            </p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight uppercase">
              {product.name}
            </h1>
            <div className="mt-1.5 flex items-baseline gap-2.5 flex-wrap">
              {product.original_price != null && Number(product.original_price) > Number(product.price) && (
                <span className="line-through text-lg font-normal text-destructive">
                  ₦{Number(product.original_price).toLocaleString()}
                </span>
              )}
              <p className="font-display text-2xl font-bold text-primary">
                ₦{Number(product.price).toLocaleString()}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/{product.pricing_unit || "sqm"}</span>
              </p>
            </div>
          </div>

          {product.short_description && (
            <div className="rounded-xl border border-border/80 bg-card p-4 text-xs leading-relaxed text-muted-foreground max-w-prose shadow-sm">
              {product.short_description}
            </div>
          )}

          {/* FAQ Accordion Section */}
          {product.faq && Array.isArray(product.faq) && (product.faq as any[]).length > 0 && (
            <div className="rounded-xl border border-border/80 bg-card p-4 text-xs space-y-3 max-w-prose shadow-sm">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground border-b border-border/40 pb-2">Frequently Asked Questions</h3>
              <div className="space-y-4">
                {(product.faq as any[]).map((f, i) => (
                  <div key={i} className="space-y-1">
                    <h4 className="font-semibold text-xs text-foreground flex gap-1.5 items-start">
                      <span className="text-primary font-bold">Q:</span>
                      <span>{f.question || f.q}</span>
                    </h4>
                    <p className="pl-4 text-xs text-muted-foreground leading-relaxed">{f.answer || f.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical Specifications & Subcategory Identity */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs max-w-xl">
            {taxonomy.subcategory?.name && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 shadow-sm">
                <dt className="text-[9px] font-bold uppercase tracking-wider text-primary">Subcategory</dt>
                <dd className="mt-1 font-semibold text-foreground text-xs">{taxonomy.subcategory.name}</dd>
              </div>
            )}
            {product.differentiator_note && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 shadow-sm">
                <dt className="text-[9px] font-bold uppercase tracking-wider text-primary">
                  {product.differentiator_type || "Variation"}
                </dt>
                <dd className="mt-1 font-semibold text-foreground text-xs">{product.differentiator_note}</dd>
              </div>
            )}
            {[
              ["Color", product.color],
              ["Material", product.material],
              ["Finish", product.finish],
            ].map(([k, v]) =>
              v ? (
                <div key={k as string} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                  <dt className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="mt-1 font-semibold text-foreground text-xs">{v}</dd>
                </div>
              ) : null,
            )}
          </dl>

          {/* Actions Bar */}
          <div className="flex gap-2.5 max-w-md pt-2">
            <AddToCollectionButton
              productId={product.id}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-primary px-5 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm"
            />
            <button
              onClick={handleToggleFavorite}
              className={`rounded px-5 py-3 border text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-2 ${
                isFav
                  ? "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Heart className={`h-4 w-4 text-red-500 hover:text-red-600 ${isFav ? "fill-red-500" : ""}`} />
              {isFav ? "Saved" : "Favorite"}
            </button>
          </div>
        </div>

        {/* RELATED PRODUCTS */}
        {related.length > 0 && (
          <section className="mt-12 border-t border-border/50 pt-8">
            <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              From the same design family
            </h2>
            <p className="font-display text-lg font-extrabold text-foreground uppercase tracking-tight">Related materials</p>
            <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* RECOMMENDED PRODUCTS */}
        {recommendations.length > 0 && (
          <section className="mt-12 border-t border-border pt-8">
            <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Tailored for your design style
            </h2>
            <p className="font-display text-lg font-extrabold text-foreground uppercase tracking-tight">Recommended for you</p>
            <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {recommendations.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* FULLSCREEN LIGHTBOX GALLERY MODAL */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 transition-all">
          {/* Close Area */}
          <div className="absolute inset-0" onClick={() => setLightboxImg(null)} />

          {/* Image & Controls wrapper */}
          <div className="relative z-10 flex flex-col items-center max-w-4xl max-h-[85vh] px-4">
            <div className="overflow-hidden flex items-center justify-center bg-zinc-900 rounded-lg">
              <img
                src={lightboxImg}
                alt="Fullscreen view"
                style={{ transform: `scale(${lightboxScale})` }}
                className="max-w-full max-h-[75vh] object-contain transition-transform duration-250 ease-out"
              />
            </div>

            {/* Scale Indicator */}
            {lightboxScale !== 1 && (
              <span className="absolute bottom-20 bg-black/55 text-white text-[9px] px-2 py-0.5 rounded font-mono">
                Zoom: {Math.round(lightboxScale * 100)}%
              </span>
            )}

            {/* Slider / Controls Panel */}
            <div className="mt-4 flex items-center justify-center gap-6 text-white bg-black/45 p-2 rounded-full border border-white/10">
              <button
                onClick={() => handleLightboxNav("prev")}
                className="p-2 rounded-full hover:bg-white/15 transition"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setLightboxScale(s => Math.min(s + 0.25, 3))}
                  className="p-1.5 rounded hover:bg-white/15 transition flex items-center gap-1 text-[10px] font-semibold"
                >
                  <ZoomIn className="h-4 w-4" /> Zoom In
                </button>
                <button
                  onClick={() => setLightboxScale(s => Math.max(s - 0.25, 0.75))}
                  className="p-1.5 rounded hover:bg-white/15 transition flex items-center gap-1 text-[10px] font-semibold"
                >
                  <ZoomOut className="h-4 w-4" /> Zoom Out
                </button>
                <button
                  onClick={() => setLightboxScale(1)}
                  className="p-1.5 rounded hover:bg-white/15 transition text-[10px] font-semibold"
                >
                  Reset
                </button>
              </div>

              <button
                onClick={() => handleLightboxNav("next")}
                className="p-2 rounded-full hover:bg-white/15 transition"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Close button top right */}
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 z-20 rounded-full p-2 bg-white/15 text-white hover:bg-white/25 transition"
            aria-label="Close fullscreen gallery"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </AppShell>
  );
}
