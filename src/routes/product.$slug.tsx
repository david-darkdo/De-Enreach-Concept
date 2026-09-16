import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFavorites } from "@/hooks/useFavorites";
import { AddToCollectionButton } from "@/components/AddToCollectionButton";
import { ProductCard } from "@/components/ProductCard";
import {
  Heart,
  MessageCircle,
  Layers,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  X,
  Compass,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getCanonicalProductUrl, getCanonicalProductPath } from "@/lib/product-url";
import { getCanonicalOrigin } from "@/lib/origin";

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ params }) => {
    const origin = getCanonicalOrigin();
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("slug", params.slug)
      .maybeSingle();

    if (error || !product) {
      throw notFound();
    }

    // Load full hierarchical taxonomy
    let typeData = null;
    let categoryData = null;
    let subcategoryData = null;
    let familyData = null;

    if (product.type_id) {
      const { data } = await supabase
        .from("product_types")
        .select("id, name, slug")
        .eq("id", product.type_id)
        .maybeSingle();
      typeData = data;
    }

    if (product.category_id) {
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug")
        .eq("id", product.category_id)
        .maybeSingle();
      categoryData = data;
    }

    if (product.subcategory_id) {
      const { data } = await supabase
        .from("subcategories")
        .select("id, name, slug")
        .eq("id", product.subcategory_id)
        .maybeSingle();
      subcategoryData = data;
    }

    if (product.family_id) {
      const { data } = await supabase
        .from("family_groups")
        .select("id, name")
        .eq("id", product.family_id)
        .maybeSingle();
      familyData = data;
    }

    // Related products from the same family
    let related: any[] = [];
    if (product.family_id) {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("family_id", product.family_id)
        .neq("id", product.id)
        .eq("status" as any, "published")
        .eq("hidden", false)
        .limit(4);
      related = data || [];
    }

    return {
      product,
      origin,
      taxonomy: {
        type: typeData,
        category: categoryData,
        subcategory: subcategoryData,
        family: familyData,
      },
      related,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.product) {
      return {
        meta: [{ title: "Product Not Found | Enreach Concepts" }],
      };
    }
    const { product, origin } = loaderData;
    const metaTitle = product.seo_title || `${product.name} | Enreach Concepts Showroom`;
    const metaDescription =
      product.seo_description ||
      product.short_description ||
      `Discover ${product.name} at Enreach Concepts. Premium luxury building materials and architectural finishes in Abuja, Nigeria.`;

    const canonicalUrl = getCanonicalProductUrl(product, origin);
    const imageUrl = product.image_url || `${origin}/og-default.jpg`;

    return {
      meta: [
        { title: metaTitle },
        { name: "description", content: metaDescription },
        { property: "og:title", content: metaTitle },
        { property: "og:description", content: metaDescription },
        { property: "og:type", content: "product" },
        { property: "og:url", content: canonicalUrl },
        { property: "og:image", content: imageUrl },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: metaTitle },
        { name: "twitter:description", content: metaDescription },
        { name: "twitter:image", content: imageUrl },
      ],
      links: [
        { rel: "canonical", href: canonicalUrl },
      ],
    };
  },
  component: ProductDetailPage,
});

function publicImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
  return data.publicUrl;
}

function ProductDetailPage() {
  const { product, origin, taxonomy, related } = Route.useLoaderData();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [activeImgIndex, setActiveImgIndex] = useState<number>(0);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxScale, setLightboxScale] = useState<number>(1);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const isFav = isFavorite(product.id);

  const studio = publicImageUrl(product.generated_studio_image) || publicImageUrl(product.image_url);
  const installed = publicImageUrl(product.generated_installed_image) || null;

  const galleryImages = useMemo(() => {
    return [studio, installed].filter(Boolean) as string[];
  }, [studio, installed]);

  useEffect(() => {
    if (!product?.id) return;

    if (user?.id) {
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
          metadata: {
            productId: product.id,
            name: product.name,
            category: (product as any).category || "Uncategorized",
          },
        });
      };
      void trackEvent();
    }

    const loadRecs = async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("status" as any, "published")
        .eq("hidden", false)
        .neq("id", product.id)
        .order("created_at", { ascending: false })
        .limit(4);
      setRecommendations(data || []);
    };
    void loadRecs();
  }, [product?.id, user?.id]);

  const handleToggleFavorite = () => {
    void toggleFavorite(product.id, product);
  };

  const breadcrumbs = useMemo(() => {
    const list = [{ label: "Home", path: "/" }];
    if (taxonomy.type) {
      list.push({ label: taxonomy.type.name, path: `/?type=${taxonomy.type.slug}` });
      if (taxonomy.category) {
        list.push({
          label: taxonomy.category.name,
          path: `/?type=${taxonomy.type.slug}&category=${taxonomy.category.slug}`,
        });
        if (taxonomy.subcategory) {
          list.push({
            label: taxonomy.subcategory.name,
            path: `/?type=${taxonomy.type.slug}&category=${taxonomy.category.slug}&subcategory=${taxonomy.subcategory.slug}`,
          });
          if (taxonomy.family) {
            list.push({
              label: taxonomy.family.name,
              path: `/?type=${taxonomy.type.slug}&category=${taxonomy.category.slug}&subcategory=${taxonomy.subcategory.slug}`,
            });
          }
        }
      }
    }
    list.push({ label: product.name, path: getCanonicalProductPath(product) });
    return list;
  }, [taxonomy, product]);

  const canonicalProductUrl = getCanonicalProductUrl(product, origin);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.label,
      item: b.path.startsWith("/") ? `${origin}${b.path}` : b.path,
    })),
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: galleryImages.map((img) => ({
      "@type": "ImageObject",
      url: img,
    })),
    description: product.seo_description || product.short_description || product.generated_description || "",
    sku: product.code || product.id,
    mpn: product.code || product.id,
    brand: {
      "@type": "Brand",
      name: product.brand || "Enreach Concepts",
    },
    category: taxonomy.category?.name || "Building Materials",
    offers: {
      "@type": "Offer",
      url: canonicalProductUrl,
      priceCurrency: "NGN",
      price: Number(product.price) || 0,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      priceValidUntil: "2027-12-31",
      seller: {
        "@type": "Organization",
        name: "Enreach Concepts Digital Showroom",
      },
    },
  };

  const masterDoc = typeof product.master_document === "object" && product.master_document ? product.master_document : {};
  const pricingUnit = product.pricing_unit || masterDoc.pricing_unit || "sqm";
  const originalPrice = product.original_price != null ? product.original_price : (masterDoc.original_price ?? null);
  const diffType = product.differentiator_type || masterDoc.differentiator_type || null;
  const diffNote = product.differentiator_note || masterDoc.differentiator_note || null;

  const faqsList: { question: string; answer: string }[] = useMemo(() => {
    const rawFaq = product.faq || masterDoc.faq;
    if (!Array.isArray(rawFaq)) return [];
    return rawFaq
      .filter((f: any) => f && (f.question || f.q) && (f.answer || f.a))
      .map((f: any) => ({
        question: String(f.question || f.q).trim(),
        answer: String(f.answer || f.a).trim(),
      }));
  }, [product.faq, masterDoc.faq]);

  const faqSchema = faqsList.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqsList.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  } : null;

  const dynamicApplications: string[] = useMemo(() => {
    if (Array.isArray((product as any).applications) && (product as any).applications.length > 0) {
      return (product as any).applications;
    }
    if (Array.isArray(masterDoc.applications) && masterDoc.applications.length > 0) {
      return masterDoc.applications;
    }
    const catName = taxonomy.category?.name || "Interiors";
    const typeName = taxonomy.type?.name || "Surface";
    return [
      `Residential ${catName}`,
      `Commercial ${catName}`,
      `Feature ${typeName}`,
      "Modern Architecture",
    ];
  }, [product, masterDoc, taxonomy]);

  const applicationSummary: string = useMemo(() => {
    if (typeof (product as any).application_summary === "string" && (product as any).application_summary.trim()) {
      return (product as any).application_summary.trim();
    }
    if (typeof masterDoc.application_summary === "string" && masterDoc.application_summary.trim()) {
      return masterDoc.application_summary.trim();
    }
    const typeName = taxonomy.type?.name || "Architectural Finish";
    const mat = product.material || "premium surface";
    return `Engineered for high-end residential and commercial installations requiring durable, aesthetically refined ${mat} ${typeName.toLowerCase()} solutions.`;
  }, [product, masterDoc, taxonomy]);

  const whatsappInquiryUrl = useMemo(() => {
    const phone = "2347081593438";
    const msg = `Hello Enreach Concepts, I am interested in ${product.name} (Code: ${product.code}, Price: ₦${Number(product.price).toLocaleString()}/${pricingUnit}). URL: ${canonicalProductUrl}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }, [product, canonicalProductUrl, pricingUnit]);

  const customerNarrative = product.generated_description || product.short_description || "";

  const visualSpecs = useMemo(() => {
    const understanding = (product.ai_understanding as any) || (masterDoc.visual_characteristics as any) || {};
    return {
      material: product.material || understanding.material || null,
      finish: product.finish || product.finish_name || understanding.finish || null,
      color: product.color || understanding.color || null,
      pattern: understanding.pattern || null,
      style: understanding.style || null,
      texture: understanding.texture || null,
    };
  }, [product, masterDoc]);

  const handleLightboxNav = (direction: "prev" | "next") => {
    if (!lightboxImg) return;
    const currentIndex = galleryImages.indexOf(lightboxImg);
    if (currentIndex === -1) return;
    const nextIndex = direction === "next"
      ? (currentIndex + 1) % galleryImages.length
      : (currentIndex - 1 + galleryImages.length) % galleryImages.length;
    setLightboxImg(galleryImages[nextIndex]);
    setLightboxScale(1);
  };

  return (
    <AppShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      {faqSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      )}

      <div className="container-app pt-2 pb-14">
        {/* 1. BREADCRUMBS */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 overflow-x-auto pb-3 text-[10px] uppercase tracking-wider text-muted-foreground scrollbar-none"
        >
          {breadcrumbs.map((b, index) => (
            <span key={index} className="flex items-center gap-1.5 shrink-0">
              {index > 0 && <span className="text-muted-foreground/40">/</span>}
              {index === breadcrumbs.length - 1 ? (
                <span className="font-semibold text-foreground truncate max-w-[160px]">{b.label}</span>
              ) : (
                <Link to={b.path} className="hover:text-primary transition underline-offset-2 hover:underline">
                  {b.label}
                </Link>
              )}
            </span>
          ))}
        </nav>

        {/* 2. PRODUCT GALLERY */}
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm aspect-square flex items-center justify-center">
            {galleryImages[activeImgIndex] ? (
              <img
                src={galleryImages[activeImgIndex]}
                alt={`${product.name} - Studio Image`}
                onClick={() => setLightboxImg(galleryImages[activeImgIndex])}
                className="w-full h-full object-cover cursor-zoom-in hover:scale-[1.01] transition-transform duration-300"
              />
            ) : (
              <div className="text-xs text-muted-foreground italic">No image assets available</div>
            )}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between aspect-square">
            <div className="flex-1 overflow-hidden">
              {installed ? (
                <img
                  src={installed}
                  alt={`${product.name} - Installed Scene Reference`}
                  loading="lazy"
                  onClick={() => setLightboxImg(installed)}
                  className="w-full h-full object-cover cursor-zoom-in hover:scale-[1.01] transition-transform duration-300"
                />
              ) : (
                <div className="text-xs text-muted-foreground italic flex h-full items-center justify-center bg-muted/20">
                  Installed architectural scene reference preview
                </div>
              )}
            </div>
            <div className="border-t border-border px-3.5 py-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold bg-background shrink-0">
              Installed Reference / Architectural Layout
            </div>
          </div>
        </div>

        {galleryImages.length > 1 && (
          <div className="flex gap-2.5 mt-3 overflow-x-auto pb-1 scrollbar-none">
            {galleryImages.map((imgUrl, i) => (
              <button
                key={i}
                onClick={() => setActiveImgIndex(i)}
                className={`h-14 w-14 rounded-lg border overflow-hidden shrink-0 transition bg-card ${
                  activeImgIndex === i ? "border-primary shadow-sm ring-1 ring-primary" : "border-border hover:border-primary/45"
                }`}
                aria-label={`Select product image ${i + 1}`}
              >
                <img src={imgUrl} alt="Thumbnail preview" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* 3, 4, 5. PRODUCT IDENTITY & PRICING */}
        <div className="mt-6 space-y-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.18em] text-primary font-bold">
              {product.brand || "Enreach Concepts"} · Code {product.code}
            </p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight uppercase">
              {product.name}
            </h1>
            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
              {originalPrice != null && Number(originalPrice) > Number(product.price) && (
                <span className="line-through text-lg font-normal text-destructive">
                  ₦{Number(originalPrice).toLocaleString()}
                </span>
              )}
              <p className="font-display text-2xl sm:text-3xl font-bold text-primary">
                ₦{Number(product.price).toLocaleString()}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  /{pricingUnit}
                </span>
              </p>
            </div>
          </div>

          {/* 6. ACTION CONTROLS */}
          <div className="flex flex-wrap gap-2.5 max-w-lg pt-1">
            <AddToCollectionButton
              productId={product.id}
              className="flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm"
            />
            <button
              onClick={handleToggleFavorite}
              className={`rounded-lg px-4 py-3 border text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${
                isFav
                  ? "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              aria-label={isFav ? "Saved in favorites" : "Save to favorites"}
            >
              <Heart className={`h-4 w-4 text-red-500 hover:text-red-600 ${isFav ? "fill-red-500" : ""}`} />
              {isFav ? "Saved" : "Favorite"}
            </button>
            <a
              href={whatsappInquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-4 py-3 border border-emerald-600/30 bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="h-4 w-4" />
              Inquire
            </a>
          </div>

          {/* 7. PRODUCT SUMMARY */}
          {customerNarrative && (
            <div className="mt-4 rounded-xl border border-border/80 bg-card p-4 text-xs leading-relaxed text-muted-foreground max-w-prose shadow-sm">
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-foreground mb-1.5">
                Product Narrative
              </h2>
              <p className="whitespace-pre-line">{customerNarrative}</p>
            </div>
          )}

          {/* 8. TECHNICAL / VERIFIED SPECIFICATIONS */}
          <div className="mt-4 max-w-xl">
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-foreground mb-2 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" /> Verified Technical Specifications
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              {taxonomy.type?.name && (
                <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                  <dt className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Product Type</dt>
                  <dd className="mt-1 font-semibold text-foreground text-xs">{taxonomy.type.name}</dd>
                </div>
              )}
              {taxonomy.category?.name && (
                <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                  <dt className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Category</dt>
                  <dd className="mt-1 font-semibold text-foreground text-xs">{taxonomy.category.name}</dd>
                </div>
              )}
              {taxonomy.subcategory?.name && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 shadow-sm">
                  <dt className="text-[9px] font-bold uppercase tracking-wider text-primary">Subcategory</dt>
                  <dd className="mt-1 font-semibold text-foreground text-xs">{taxonomy.subcategory.name}</dd>
                </div>
              )}
              {diffNote && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 shadow-sm">
                  <dt className="text-[9px] font-bold uppercase tracking-wider text-primary">
                    {diffType || "Variation"}
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground text-xs">{diffNote}</dd>
                </div>
              )}
              {[
                ["Material", product.material],
                ["Finish", product.finish],
                ["Color", product.color],
                ["Size", product.size],
                ["SKU / Code", product.code],
                ["Pricing Unit", pricingUnit],
              ].map(([k, v]) =>
                v ? (
                  <div key={k as string} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                    <dt className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt>
                    <dd className="mt-1 font-semibold text-foreground text-xs">{v}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>

          {/* 9. VISUAL CHARACTERISTICS */}
          {visualSpecs && Object.keys(visualSpecs).length > 0 && (
            <div className="mt-4 max-w-xl">
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-foreground mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Visual Characteristics
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {Object.entries(visualSpecs).map(([k, v]) => {
                  if (!v || typeof v !== "string" || v.trim() === "" || v === "none") return null;
                  const label = k.replace(/_/g, " ");
                  return (
                    <div key={k} className="rounded-lg border border-border bg-card/70 p-3 shadow-sm">
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground capitalize">
                        {label}
                      </dt>
                      <dd className="mt-1 text-xs font-medium text-foreground">{v}</dd>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 10. DYNAMIC APPLICATIONS & SUITABLE SPACES */}
          <div className="mt-4 max-w-xl">
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-foreground mb-2 flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-primary" /> Suitable Spaces & Applications
            </h2>
            <div className="rounded-xl border border-border/80 bg-card p-4 text-xs space-y-2 text-muted-foreground shadow-sm">
              <p>{applicationSummary}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {dynamicApplications.map((space) => (
                  <span
                    key={space}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted/60 text-[10px] font-medium text-foreground"
                  >
                    <CheckCircle2 className="h-3 w-3 text-primary" /> {space}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 11. PRODUCT-SPECIFIC FAQ */}
          {faqsList.length > 0 && (
            <div className="mt-4 rounded-xl border border-border/80 bg-card p-4 text-xs space-y-3 max-w-prose shadow-sm">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground border-b border-border/40 pb-2">
                Frequently Asked Questions
              </h3>
              <div className="space-y-4">
                {faqsList.map((f, i) => (
                  <div key={i} className="space-y-1">
                    <h4 className="font-semibold text-xs text-foreground flex gap-1.5 items-start">
                      <span className="text-primary font-bold">Q:</span>
                      <span>{f.question}</span>
                    </h4>
                    <p className="pl-4 text-xs text-muted-foreground leading-relaxed">{f.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 12. RELATED PRODUCTS FROM THE SAME FAMILY */}
        {related.length > 0 && (
          <section className="mt-12 border-t border-border/50 pt-8">
            <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              From the same design family
            </h2>
            <p className="font-display text-lg font-extrabold text-foreground uppercase tracking-tight">
              Related materials
            </p>
            <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* 13. RECOMMENDED PRODUCTS */}
        {recommendations.length > 0 && (
          <section className="mt-12 border-t border-border pt-8">
            <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Tailored for your design style
            </h2>
            <p className="font-display text-lg font-extrabold text-foreground uppercase tracking-tight">
              Recommended for you
            </p>
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
          <div className="absolute inset-0" onClick={() => setLightboxImg(null)} />
          <div className="relative z-10 flex flex-col items-center max-w-4xl max-h-[85vh] px-4">
            <div className="overflow-hidden flex items-center justify-center bg-zinc-900 rounded-lg">
              <img
                src={lightboxImg}
                alt="Fullscreen view"
                style={{ transform: `scale(${lightboxScale})` }}
                className="max-w-full max-h-[75vh] object-contain transition-transform duration-250 ease-out"
              />
            </div>

            {lightboxScale !== 1 && (
              <span className="absolute bottom-20 bg-black/55 text-white text-[9px] px-2 py-0.5 rounded font-mono">
                Zoom: {Math.round(lightboxScale * 100)}%
              </span>
            )}

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
                  onClick={() => setLightboxScale((s) => Math.min(s + 0.25, 3))}
                  className="p-1.5 rounded hover:bg-white/15 transition flex items-center gap-1 text-[10px] font-semibold"
                >
                  <ZoomIn className="h-4 w-4" /> Zoom In
                </button>
                <button
                  onClick={() => setLightboxScale((s) => Math.max(s - 0.25, 0.75))}
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
