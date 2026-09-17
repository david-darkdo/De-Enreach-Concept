import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageUploader } from "@/components/ImageUploader";
import { triggerSitemapUpdate } from "@/lib/seo-publisher";
import { runProductDetailsEngine, DIFFERENTIATOR_TYPES } from "@/lib/product-details.functions";
import { generateStandaloneLifestyleImage } from "@/lib/lifestyle-image.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Sparkles,
  Layers,
  Search,
  Globe,
  Tag,
  Cpu,
  ChevronDown,
  ChevronUp,
  Compass,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/products/new")({
  head: () => ({ meta: [{ title: "Upload New Product — Admin" }] }),
  component: AdminProductNewPage,
});

function AdminProductNewPage() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [contexts, setContexts] = useState<any[]>([]);

  // Selection Hierarchy
  const [type_id, setTypeId] = useState<string>("");
  const [category_id, setCategoryId] = useState<string>("");
  const [subcategory_id, setSubcategoryId] = useState<string>("");
  const [family_id, setFamilyId] = useState<string>("");
  const [installation_context_id, setInstallationContextId] = useState<string>("");

  // Media
  const [originalPath, setOriginalPath] = useState<string>("");
  const [installedPath, setInstalledPath] = useState<string>("");

  // Commercial & Identity
  const [form, setForm] = useState({
    name: "",
    code: "",
    brand: "",
    production_name: "",
    finish_name: "",
    color: "",
    material: "",
    size: "",
    price: "",
    original_price: "",
    pricing_unit: "sqm",
    differentiator_type: "",
    differentiator_note: "",
    status: "published",
    description: "",
    seo_title: "",
    seo_description: "",
    seo_keywords: "",
    canonical_slug: "",
    search_keywords: "",
    alternative_terms: "",
    synonyms: "",
    related_terms: "",
    misspellings: "",
    applications: "",
    application_summary: "",
  });

  const [previewCode, setPreviewCode] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [generatingLifestyle, setGeneratingLifestyle] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [showAdvancedAi, setShowAdvancedAi] = useState(true);
  const [showSeoSection, setShowSeoSection] = useState(true);
  const [showSearchSection, setShowSearchSection] = useState(true);
  const [showApplicationsSection, setShowApplicationsSection] = useState(true);
  const [aiIntelligence, setAiIntelligence] = useState<any>(null);

  // TanStack Start Server Functions
  const runDetailsFn = useServerFn(runProductDetailsEngine);
  const generateLifestyleFn = useServerFn(generateStandaloneLifestyleImage);

  // Load classification lists
  useEffect(() => {
    const loadTaxonomy = async () => {
      const [tRes, cRes, sRes, fRes, ctxRes] = await Promise.all([
        supabase.from("product_types").select("*").order("name"),
        supabase.from("categories").select("*").order("name"),
        supabase.from("subcategories").select("*").order("name"),
        supabase.from("family_groups").select("*").order("name"),
        supabase.from("installation_contexts").select("*").order("name"),
      ]);
      setTypes(tRes.data || []);
      setCategories(cRes.data || []);
      setSubcategories(sRes.data || []);
      setFamilies(fRes.data || []);
      setContexts(ctxRes.data || []);
    };
    void loadTaxonomy();
  }, []);

  // Compute preview code when type changes
  useEffect(() => {
    const fetchCode = async () => {
      if (!type_id) return;
      try {
        const { data } = await supabase.rpc("generate_product_code" as any, { _type_id: type_id } as any);
        if (data) setPreviewCode(data);
      } catch {}
    };
    void fetchCode();
  }, [type_id]);

  const filteredCats = useMemo(() => categories.filter((c) => !type_id || c.type_id === type_id), [categories, type_id]);
  const filteredSubs = useMemo(() => subcategories.filter((s) => !category_id || s.category_id === category_id), [subcategories, category_id]);
  const filteredFams = useMemo(() => families.filter((f) => !subcategory_id || f.subcategory_id === subcategory_id), [families, subcategory_id]);

  const setFormField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ENGINE 1 Execution on New Product
  const handleGenerateDetailsOnNew = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter a Product Name first.");
      return;
    }
    setGeneratingDetails(true);
    try {
      const slugBase = (form.name || "temp").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const tempSlug = `draft-${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

      const masterDoc = {
        name: form.name.trim(),
        brand: form.brand || "Enreach Showroom",
        pricing_unit: form.pricing_unit || "sqm",
        original_price: form.original_price ? Number(form.original_price) : null,
        differentiator_type: form.differentiator_type || null,
        differentiator_note: (form.differentiator_note || "").trim() || null,
      };

      const { data: tempProduct, error: tempErr } = await supabase.from("products").insert({
        name: form.name.trim(),
        code: form.code || previewCode || "TEMP-001",
        type_id: type_id || null,
        category_id: category_id || null,
        subcategory_id: subcategory_id || null,
        family_id: family_id || null,
        production_name: form.production_name || null,
        finish_name: form.finish_name || null,
        brand: form.brand || null,
        color: form.color || null,
        material: form.material || null,
        size: form.size || null,
        price: Number(form.price) || 0,
        original_price: form.original_price ? Number(form.original_price) : null,
        pricing_unit: form.pricing_unit || "sqm",
        differentiator_type: form.differentiator_type || null,
        differentiator_note: (form.differentiator_note || "").trim() || null,
        status: "draft",
        processing_state: "pending",
        slug: tempSlug,
        image_url: originalPath || null,
        master_document: masterDoc,
      } as any).select("id").single();

      if (tempErr || !tempProduct?.id) {
        throw new Error(tempErr?.message || "Failed to initialize temporary draft");
      }

      const res = await runDetailsFn({ data: { productId: tempProduct.id } });
      if (res.ok && res.details) {
        const d = res.details;
        setAiIntelligence(d);

        const prodDesc = d.generated_description || d.description || d.short_description || "";
        const seoDesc = d.seo_description || d.meta_description || "";
        const seoKw = Array.isArray(d.seo_keywords) ? d.seo_keywords.join(", ") : (d.seo_keywords || "");
        const searchKw = Array.isArray(d.search_keywords) ? d.search_keywords.join(", ") : (d.search_keywords || "");
        const apps = Array.isArray(d.applications) ? d.applications.join(", ") : (d.applications || "");
        const appSum = typeof d.application_summary === "string" ? d.application_summary : "";

        setForm((prev) => ({
          ...prev,
          description: prodDesc || prev.description,
          seo_title: d.seo_title || prev.seo_title,
          seo_description: seoDesc || prev.seo_description,
          seo_keywords: seoKw || prev.seo_keywords,
          canonical_slug: d.canonical_slug || prev.canonical_slug,
          search_keywords: searchKw || prev.search_keywords,
          alternative_terms: Array.isArray(d.alternative_names || d.alternative_terms) ? (d.alternative_names || d.alternative_terms).join(", ") : "",
          synonyms: Array.isArray(d.search_synonyms || d.synonyms) ? (d.search_synonyms || d.synonyms).join(", ") : "",
          related_terms: Array.isArray(d.related_search_terms || d.related_terms) ? (d.related_search_terms || d.related_terms).join(", ") : "",
          misspellings: Array.isArray(d.common_misspellings || d.misspellings) ? (d.common_misspellings || d.misspellings).join(", ") : "",
          applications: apps || prev.applications,
          application_summary: appSum || prev.application_summary,
        }));

        toast.success("Engine 1: Single-pass product details & SEO metadata generated!");
      }
      await supabase.from("products").delete().eq("id", tempProduct.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate product details");
    } finally {
      setGeneratingDetails(false);
    }
  };

  // ENGINE 2 Execution
  const handleGenerateLifestyleOnNew = async () => {
    if (!originalPath) {
      toast.error("Please upload an Original Product Image first.");
      return;
    }
    setGeneratingLifestyle(true);
    try {
      const slugBase = (form.name || "installed").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const tempSlug = `draft-img-${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

      const { data: tempProduct, error: tempErr } = await supabase.from("products").insert({
        name: form.name.trim() || "Sample Product",
        code: form.code || previewCode || "TEMP-002",
        type_id: type_id || null,
        category_id: category_id || null,
        subcategory_id: subcategory_id || null,
        family_id: family_id || null,
        production_name: form.production_name || null,
        finish_name: form.finish_name || null,
        brand: form.brand || null,
        size: form.size || null,
        price: Number(form.price) || 0,
        status: "draft",
        processing_state: "pending",
        slug: tempSlug,
        image_url: originalPath,
      } as any).select("id").single();

      if (tempErr || !tempProduct?.id) {
        throw new Error(tempErr?.message || "Failed to create draft for lifestyle generation");
      }

      const res = await generateLifestyleFn({ data: { productId: tempProduct.id } });
      if (res.ok && res.imageUrl) {
        setInstalledPath(res.imageUrl);
        toast.success("Engine 2: Installed lifestyle image generated successfully!");
      } else {
        toast.error("Failed to generate installed image");
      }
      await supabase.from("products").delete().eq("id", tempProduct.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate installed image");
    } finally {
      setGeneratingLifestyle(false);
    }
  };

  // Full Pipeline Runner
  const handleRunFullPipelineOnNew = async () => {
    if (!form.name.trim()) return toast.error("Product name required");
    setRunningPipeline(true);
    await handleGenerateDetailsOnNew();
    if (originalPath) {
      await handleGenerateLifestyleOnNew();
    }
    setRunningPipeline(false);
    toast.success("Full AI pipeline completed for product details & lifestyle image!");
  };

  // CREATE PRODUCT HANDLER
  const create = async (targetStatus?: string) => {
    if (!type_id || !category_id || !subcategory_id || !family_id) {
      toast.error("Please complete the classification hierarchy (Type, Category, Subcategory, Family Group).");
      return;
    }
    if (!form.name.trim()) return toast.error("Product name is required.");
    if (!originalPath) return toast.error("Original Product Image is required.");

    setSaving(true);
    const slugBase = (form.canonical_slug || form.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

    const seoKeywordsArray = form.seo_keywords
      ? form.seo_keywords.split(",").map((k) => k.trim()).filter(Boolean)
      : [];

    const searchKeywordsArray = Array.from(new Set([
      ...(form.search_keywords ? form.search_keywords.split(",").map((k) => k.trim()) : []),
      ...(form.alternative_terms ? form.alternative_terms.split(",").map((k) => k.trim()) : []),
      ...(form.synonyms ? form.synonyms.split(",").map((k) => k.trim()) : []),
      ...(form.related_terms ? form.related_terms.split(",").map((k) => k.trim()) : []),
      ...(form.misspellings ? form.misspellings.split(",").map((k) => k.trim()) : []),
      ...(form.applications ? form.applications.split(",").map((k) => k.trim()) : []),
    ])).filter(Boolean);

    const finalStatus = targetStatus || form.status;
    const finalNarrative = form.description.trim() || null;
    const finalSeoDesc = form.seo_description.trim() || null;

    const masterDoc = {
      name: form.name.trim(),
      brand: form.brand.trim() || "Enreach Showroom",
      description: finalNarrative,
      seo_title: form.seo_title.trim() || null,
      seo_description: finalSeoDesc,
      faq: aiIntelligence?.faq || [],
      applications: form.applications ? form.applications.split(",").map((s) => s.trim()).filter(Boolean) : [],
      application_summary: form.application_summary.trim() || "",
      pricing_unit: form.pricing_unit || "sqm",
      differentiator_type: form.differentiator_type.trim() || null,
      differentiator_note: form.differentiator_note.trim() || null,
      original_price: form.original_price ? Number(form.original_price) : null,
    };

    const payload = {
      type_id,
      category_id,
      subcategory_id,
      family_id,
      installation_context_id: installation_context_id || null,
      name: form.name.trim(),
      code: form.code.trim() || previewCode,
      production_name: form.production_name.trim() || null,
      finish_name: form.finish_name.trim() || null,
      brand: form.brand.trim() || null,
      color: form.color.trim() || null,
      material: form.material.trim() || null,
      size: form.size.trim() || null,
      price: Number(form.price) || 0,
      original_price: form.original_price ? Number(form.original_price) : null,
      pricing_unit: form.pricing_unit || "sqm",
      differentiator_type: form.differentiator_type.trim() || null,
      differentiator_note: form.differentiator_note.trim() || null,
      status: finalStatus,
      is_published: finalStatus === "published",
      slug,
      canonical_slug: form.canonical_slug.trim() || null,
      short_description: finalNarrative,
      generated_description: finalNarrative,
      seo_title: form.seo_title.trim() || null,
      seo_description: finalSeoDesc,
      seo_keywords: seoKeywordsArray,
      app_keywords: searchKeywordsArray,
      app_search_keywords: searchKeywordsArray,
      image_url: originalPath,
      generated_installed_image: installedPath || null,
      faq: aiIntelligence?.faq || [],
      structured_data: aiIntelligence?.structured_data || null,
      master_document: masterDoc,
      processing_state: "completed",
    };

    try {
      const { data: newProd, error } = await supabase
        .from("products")
        .insert(payload as any)
        .select("id")
        .single();

      if (error) throw error;

      // Rebuild search index & trigger SEO discovery sitemap update
      try {
        await supabase.rpc("rebuild_search_index" as any, { _product_id: newProd.id } as any);
      } catch {}
      await triggerSitemapUpdate(newProd.id);

      toast.success("Product published to showroom catalogue successfully!");
      navigate({ to: "/admin/products" });
    } catch (e: any) {
      toast.error(e.message || "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-app py-6 max-w-5xl space-y-6">
      {/* Header Navigation & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <Link to="/admin/products" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to library
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground uppercase">Upload New Product</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Showroom digital ingestion & Single-Pass AI pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => create("draft")}
            disabled={saving}
            className="rounded border border-border bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => create("published")}
            disabled={saving}
            className="rounded bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
          >
            {saving ? "Publishing…" : "Publish to Showroom"}
          </button>
        </div>
      </div>

      {/* SECTION 1: Product Classification Hierarchy */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 1 — Product Information</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Type *</label>
            <select
              value={type_id}
              onChange={(e) => {
                setTypeId(e.target.value);
                setCategoryId("");
                setSubcategoryId("");
                setFamilyId("");
              }}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            >
              <option value="">Select Type…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category *</label>
            <select
              value={category_id}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSubcategoryId("");
                setFamilyId("");
              }}
              disabled={!type_id}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs disabled:opacity-50"
            >
              <option value="">Select Category…</option>
              {filteredCats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subcategory *</label>
            <select
              value={subcategory_id}
              onChange={(e) => {
                setSubcategoryId(e.target.value);
                setFamilyId("");
              }}
              disabled={!category_id}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs disabled:opacity-50"
            >
              <option value="">Select Subcategory…</option>
              {filteredSubs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Family Group *</label>
            <select
              value={family_id}
              onChange={(e) => setFamilyId(e.target.value)}
              disabled={!subcategory_id}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs disabled:opacity-50"
            >
              <option value="">Select Family…</option>
              {filteredFams.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Identity & Technical Specs */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setFormField("name", e.target.value)}
              placeholder="e.g. Royal Marble Polished Tile"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Code / SKU</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setFormField("code", e.target.value)}
              placeholder={previewCode || "Auto-generated"}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brand / Manufacturer</label>
            <input
              type="text"
              value={form.brand}
              onChange={(e) => setFormField("brand", e.target.value)}
              placeholder="e.g. Virony, Wichtech, Enreach"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Material</label>
            <input
              type="text"
              value={form.material}
              onChange={(e) => setFormField("material", e.target.value)}
              placeholder="e.g. Porcelain, Ceramic, Granite"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Finish</label>
            <input
              type="text"
              value={form.finish_name}
              onChange={(e) => setFormField("finish_name", e.target.value)}
              placeholder="e.g. High Gloss Polish, Matt, Rustic"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dimensions / Size</label>
            <input
              type="text"
              value={form.size}
              onChange={(e) => setFormField("size", e.target.value)}
              placeholder="e.g. 60x60cm, 120x60cm, 3x7ft"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color / Pattern</label>
            <input
              type="text"
              value={form.color}
              onChange={(e) => setFormField("color", e.target.value)}
              placeholder="e.g. Carrara White, Obsidian Black"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Production Series Name</label>
            <input
              type="text"
              value={form.production_name}
              onChange={(e) => setFormField("production_name", e.target.value)}
              placeholder="e.g. Royal Imperial Collection"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Installation Context</label>
            <select
              value={installation_context_id}
              onChange={(e) => setInstallationContextId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            >
              <option value="">Select Context…</option>
              {contexts.map((ctx) => (
                <option key={ctx.id} value={ctx.id}>{ctx.name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* SECTION 2: Media Assets & AI Engine Studio */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 2 — Product Media & AI Engine</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateDetailsOnNew}
              disabled={generatingDetails || !form.name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition disabled:opacity-50"
            >
              <Cpu className="h-3.5 w-3.5" />
              {generatingDetails ? "Generating Details…" : "Run Engine 1 (Details AI)"}
            </button>
            <button
              onClick={handleGenerateLifestyleOnNew}
              disabled={generatingLifestyle || !originalPath}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/20 transition disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generatingLifestyle ? "Rendering Scene…" : "Run Engine 2 (Lifestyle Scene)"}
            </button>
            <button
              onClick={handleRunFullPipelineOnNew}
              disabled={runningPipeline || !form.name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 shadow-sm"
            >
              {runningPipeline ? "Running Unified Pipeline…" : "Run Full AI Pipeline"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Original Product Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original Product Image *</label>
              <span className="text-[10px] text-primary font-semibold">Authoritative Source Asset</span>
            </div>
            <ImageUploader
              value={originalPath}
              onChange={(url) => setOriginalPath(url)}
              bucket="product-media"
              pathPrefix="products/original"
              label="Drop or upload product image (Studio white background recommended)"
            />
          </div>

          {/* Installed Lifestyle Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Installed Lifestyle Image</label>
              <span className="text-[10px] text-amber-600 font-semibold">Engine 2 Architectural Scene</span>
            </div>
            <ImageUploader
              value={installedPath}
              onChange={(url) => setInstalledPath(url)}
              bucket="product-media"
              pathPrefix="products/installed"
              label="Engine 2 generated lifestyle reference or custom showroom installation photo"
            />
          </div>
        </div>
      </section>

      {/* SECTION 3: Pricing & Commercial Terms */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Tag className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 3 — Pricing & Units</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original Price (₦, Strikethrough Reference)</label>
            <input
              type="number"
              value={form.original_price}
              onChange={(e) => setFormField("original_price", e.target.value)}
              placeholder="e.g. 35000"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current Selling Price (₦) *</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setFormField("price", e.target.value)}
              placeholder="e.g. 28000"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pricing Unit</label>
            <select
              value={form.pricing_unit}
              onChange={(e) => setFormField("pricing_unit", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            >
              <option value="sqm">Per SQM (m²)</option>
              <option value="sqyd">Per SQYD (yd²)</option>
              <option value="sqft">Per SQFT (ft²)</option>
              <option value="piece">Per Piece / Unit</option>
              <option value="carton">Per Carton / Box</option>
              <option value="set">Per Set</option>
              <option value="pack">Per Pack</option>
              <option value="linear_meter">Per Linear Meter</option>
              <option value="roll">Per Roll</option>
              <option value="bag">Per Bag</option>
              <option value="drum">Per Drum</option>
              <option value="bundle">Per Bundle</option>
            </select>
          </div>
        </div>

        {/* Differentiator Fields */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-primary">
              Product Differentiator (Authoritative Signal)
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Differentiator Type</label>
              <select
                value={form.differentiator_type || ""}
                onChange={(e) => setFormField("differentiator_type", e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-semibold"
              >
                <option value="">-- Select Differentiator Type --</option>
                {DIFFERENTIATOR_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {form.differentiator_type && !DIFFERENTIATOR_TYPES.includes(form.differentiator_type as any) && (
                  <option value={form.differentiator_type}>{form.differentiator_type} (Custom)</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Differentiator Note</label>
              <input
                type="text"
                value={form.differentiator_note}
                onChange={(e) => setFormField("differentiator_note", e.target.value)}
                placeholder="e.g. 120cm slab format suitable for expansive luxury surfaces."
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: Product Narrative */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 4 — Product Narrative</h2>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Customer-Facing Showroom Narrative (Rich Description)
          </label>
          <textarea
            rows={5}
            value={form.description}
            onChange={(e) => setFormField("description", e.target.value)}
            placeholder="Engine 1 generated or manual product description highlighting material quality, design language, aesthetics, and architectural excellence."
            className="mt-1 w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed"
          />
        </div>
      </section>

      {/* SECTION 5: Suitable Spaces & Architectural Applications */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 5 — Suitable Spaces & Applications</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowApplicationsSection(!showApplicationsSection)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showApplicationsSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {showApplicationsSection && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Suitable Spaces / Application Labels (Comma separated)
              </label>
              <input
                type="text"
                value={form.applications}
                onChange={(e) => setFormField("applications", e.target.value)}
                placeholder="e.g. Master Bathroom Walls, Luxury Kitchen Islands, Commercial Lobbies"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Displays on the product page as high-visibility application badges.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Application Context Summary
              </label>
              <textarea
                rows={2}
                value={form.application_summary}
                onChange={(e) => setFormField("application_summary", e.target.value)}
                placeholder="e.g. Specially calibrated for wet zones and heavy residential traffic with zero liquid absorption."
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs leading-relaxed"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                1-2 concise sentences highlighting architectural suitability and application advantages.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 6: Search Engine Optimization (SEO Metadata) */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 6 — SEO & Discovery Metadata</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowSeoSection(!showSeoSection)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showSeoSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {showSeoSection && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Title (Target: &lt;60 chars)</label>
                <span className="text-[10px] font-mono text-muted-foreground">{form.seo_title.length} chars</span>
              </div>
              <input
                type="text"
                value={form.seo_title}
                onChange={(e) => setFormField("seo_title", e.target.value)}
                placeholder="e.g. Royal Marble Polished Porcelain Tile 60x60 | Enreach Concepts Abuja"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Meta Description (Target: &lt;160 chars)</label>
                <span className="text-[10px] font-mono text-muted-foreground">{form.seo_description.length} chars</span>
              </div>
              <textarea
                rows={2}
                value={form.seo_description}
                onChange={(e) => setFormField("seo_description", e.target.value)}
                placeholder="e.g. Shop luxury Royal Marble porcelain floor tiles in Abuja. High-gloss polished finish, durable and stain-resistant for premier residential spaces."
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Keywords (Comma separated)</label>
                <input
                  type="text"
                  value={form.seo_keywords}
                  onChange={(e) => setFormField("seo_keywords", e.target.value)}
                  placeholder="e.g. marble tiles abuja, luxury porcelain, floor tiles"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Canonical URL Slug</label>
                <input
                  type="text"
                  value={form.canonical_slug}
                  onChange={(e) => setFormField("canonical_slug", e.target.value)}
                  placeholder="e.g. royal-marble-polished-tile-60x60"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 7: Search Keywords & Token Aliases */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 7 — Showroom Search Aliases & Tokens</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowSearchSection(!showSearchSection)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showSearchSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {showSearchSection && (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Search Keywords</label>
              <input
                type="text"
                value={form.search_keywords}
                onChange={(e) => setFormField("search_keywords", e.target.value)}
                placeholder="e.g. glazed tile, white porcelain, floor tile"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alternative Names</label>
              <input
                type="text"
                value={form.alternative_terms}
                onChange={(e) => setFormField("alternative_terms", e.target.value)}
                placeholder="e.g. Carrara Slab, White Gold Tile"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Synonyms</label>
              <input
                type="text"
                value={form.synonyms}
                onChange={(e) => setFormField("synonyms", e.target.value)}
                placeholder="e.g. vitrified tile, ceramic floor"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Related Search Terms</label>
              <input
                type="text"
                value={form.related_terms}
                onChange={(e) => setFormField("related_terms", e.target.value)}
                placeholder="e.g. bathroom vanity wall, kitchen island slab"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Common Misspellings</label>
              <input
                type="text"
                value={form.misspellings}
                onChange={(e) => setFormField("misspellings", e.target.value)}
                placeholder="e.g. porcelein, granitt, tail"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
          </div>
        )}
      </section>

      {/* Footer Publishing Bar */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Link to="/admin/products" className="text-xs text-muted-foreground hover:text-foreground">
          Cancel & discard
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => create("draft")}
            disabled={saving}
            className="rounded border border-border bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => create("published")}
            disabled={saving}
            className="rounded bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
          >
            {saving ? "Publishing…" : "Publish to Showroom"}
          </button>
        </div>
      </div>
    </div>
  );
}
