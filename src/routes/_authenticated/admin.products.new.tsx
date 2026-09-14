import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Sparkles, Upload, FileText, Globe, Search, ChevronDown, ChevronUp, Image, Layers, Cpu, ShieldCheck } from "lucide-react";
import { runProductPipeline } from "@/lib/ai-pipeline.functions";
import { runProductDetailsEngine } from "@/lib/product-details.functions";
import { generateStandaloneLifestyleImage } from "@/lib/lifestyle-image.functions";
import { ImageUploader, ImageTile, publicImageUrl } from "@/components/ImageUploader";
import { ImageEditorModal } from "@/components/ImageEditorModal";
import { triggerSitemapUpdate } from "@/lib/seo-publisher";
import { generateDeterministicProductSlug } from "@/lib/slug";


export const Route = createFileRoute("/_authenticated/admin/products/new")({
  head: () => ({ meta: [{ title: "Create New Product — Admin Panel" }] }),
  component: RebuiltNewProductPage,
});

type Tax = { id: string; name: string };
type Cat = Tax & { type_id: string };
type Sub = Tax & { category_id: string };
type Fam = Tax & { subcategory_id: string };

function RebuiltNewProductPage() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<(Tax & { code_prefix: string })[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [fams, setFams] = useState<Fam[]>([]);

  // Selected hierarchy IDs
  const [type_id, setType] = useState("");
  const [category_id, setCat] = useState("");
  const [subcategory_id, setSub] = useState("");
  const [family_id, setFam] = useState("");

  const [previewCode, setPreviewCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [isAiMode, setIsAiMode] = useState(true);
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [generatingLifestyle, setGeneratingLifestyle] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);

  // Photo Editor Modal State
  const [editingImage, setEditingImage] = useState<{ url: string; target: "original" | "installed" } | null>(null);

  // Collapsible section toggles (Default Collapsed)
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);
  const [showSeoSection, setShowSeoSection] = useState(false);
  const [showSearchSection, setShowSearchSection] = useState(false);

  // Uploaded media paths
  const [originalPath, setOriginalPath] = useState<string | null>(null);
  const [installedPath, setInstalledPath] = useState<string | null>(null);

  // Extracted AI Intelligence Object
  const [aiIntelligence, setAiIntelligence] = useState<any>(null);

  const [form, setForm] = useState({
    name: "",
    code: "",
    production_name: "",
    finish_name: "",
    brand: "",
    color: "",
    material: "",
    size: "",
    price: "0",
    status: "published",
    featured_homepage: false,
    featured_feed: false,
    hidden: false,
    description: "",
    seo_title: "",
    seo_description: "",
    seo_keywords: "",
    canonical_slug: "",
    meta_keywords: "",
    search_keywords: "",
    alternative_terms: "",
    synonyms: "",
    related_terms: "",
    misspellings: "",
  });

  useEffect(() => {
    (async () => {
      const [t, c, s, f] = await Promise.all([
        supabase.from("product_types").select("id,name,code_prefix").order("name"),
        supabase.from("categories").select("id,name,type_id").order("name"),
        supabase.from("subcategories").select("id,name,category_id").order("name"),
        supabase.from("family_groups").select("id,name,subcategory_id").order("name"),
      ]);
      setTypes((t.data ?? []) as any);
      setCats((c.data ?? []) as any);
      setSubs((s.data ?? []) as any);
      setFams((f.data ?? []) as any);
    })();
  }, []);

  useEffect(() => {
    if (!type_id) return setPreviewCode("");
    (async () => {
      const { data } = await supabase.rpc("generate_product_code", { _type_id: type_id } as any);
      if (typeof data === "string") {
        setPreviewCode(data);
        setForm((f) => ({ ...f, code: f.code || data }));
      }
    })();
  }, [type_id]);

  const filteredCats = useMemo(() => cats.filter((c) => c.type_id === type_id), [cats, type_id]);
  const filteredSubs = useMemo(() => subs.filter((s) => s.category_id === category_id), [subs, category_id]);
  const filteredFams = useMemo(() => fams.filter((f) => f.subcategory_id === subcategory_id), [fams, subcategory_id]);

  // CRITICAL SYNC RULE HANDLER: Description <-> SEO Description
  const handleDescriptionChange = (val: string) => {
    setForm((prev) => ({
      ...prev,
      description: val,
      seo_description: val, // Auto Sync Rule: Product Description = SEO Description
    }));
  };

  const handleSeoDescriptionChange = (val: string) => {
    setForm((prev) => ({
      ...prev,
      description: val, // Auto Sync Rule: Product Description = SEO Description
      seo_description: val,
    }));
  };

  const runDetailsFn = useServerFn(runProductDetailsEngine);

  // ENGINE 1 Execution
  const handleGenerateDetailsOnNew = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter a Product Name first before generating details.");
      return;
    }
    setGeneratingDetails(true);
    try {
      const tempCode = form.code || previewCode || "TEMP-001";
      const tempSlug = generateDeterministicProductSlug({ code: tempCode, name: `draft-${form.name.trim()}` });
      
      const { data: tempProduct, error: tempErr } = await supabase.from("products").insert({
        name: form.name.trim(),
        code: tempCode,
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
        status: "draft",
        processing_state: "pending",
        slug: tempSlug,
        image_url: originalPath || null
      } as any).select("id").single();

      if (tempErr || !tempProduct?.id) {
        throw new Error(tempErr?.message || "Failed to initialize temporary draft");
      }

      const res = await runDetailsFn({ data: { productId: tempProduct.id } });
      if (res.ok && res.details) {
        const d = res.details;
        setAiIntelligence(d);

        // CRITICAL SYNC RULE: Product Description = SEO Description
        const syncedDesc = d.seo_description || d.meta_description || d.short_description || d.generated_description || "";
        const seoKw = Array.isArray(d.seo_keywords) ? d.seo_keywords.join(", ") : (d.seo_keywords || "");
        const searchKw = Array.isArray(d.search_keywords) ? d.search_keywords.join(", ") : (d.search_keywords || "");

        setForm((prev) => ({
          ...prev,
          description: syncedDesc || prev.description,
          seo_title: d.seo_title || prev.seo_title,
          seo_description: syncedDesc || prev.seo_description,
          seo_keywords: seoKw || prev.seo_keywords,
          canonical_slug: d.canonical_slug || prev.canonical_slug,
          search_keywords: searchKw || prev.search_keywords,
          alternative_terms: Array.isArray(d.alternative_terms) ? d.alternative_terms.join(", ") : (d.alternative_terms || ""),
          synonyms: Array.isArray(d.synonyms) ? d.synonyms.join(", ") : (d.synonyms || ""),
          related_terms: Array.isArray(d.related_terms) ? d.related_terms.join(", ") : (d.related_terms || ""),
          misspellings: Array.isArray(d.misspellings) ? d.misspellings.join(", ") : (d.misspellings || ""),
        }));

        toast.success("Engine 1: Product details generated! Form fields & SEO Description synced!");
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
      const tempCode = form.code || previewCode || "TEMP-002";
      const tempSlug = generateDeterministicProductSlug({ code: tempCode, name: `draft-img-${form.name || "installed"}` });

      const { data: tempProduct, error: tempErr } = await supabase.from("products").insert({
        name: form.name.trim() || "Sample Product",
        code: tempCode,
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
        image_url: originalPath
      } as any).select("id").single();

      if (tempErr || !tempProduct?.id) {
        throw new Error(tempErr?.message || "Failed to create draft for lifestyle generation");
      }

      const res = await generateStandaloneLifestyleImage({ data: { productId: tempProduct.id } });
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

  // CREATE PRODUCT HANDLER (No Lost Data)
  const create = async (targetStatus?: string) => {
    if (!type_id || !category_id || !subcategory_id || !family_id) {
      toast.error("Please complete the classification hierarchy (Type, Category, Subcategory, Family Group).");
      return;
    }
    if (!form.name.trim()) return toast.error("Product name is required.");
    if (!originalPath) return toast.error("Original Product Image is required.");

    setSaving(true);
    const assignedCode = form.code.trim() || previewCode || null;
    const slug = generateDeterministicProductSlug({
      code: assignedCode,
      name: form.name.trim(),
      manualSlug: form.canonical_slug.trim() || null,
    });


    const seoKeywordsArray = form.seo_keywords
      ? form.seo_keywords.split(",").map(k => k.trim()).filter(Boolean)
      : [];

    const searchKeywordsArray = Array.from(new Set([
      ...(form.search_keywords ? form.search_keywords.split(",").map(k => k.trim()) : []),
      ...(form.alternative_terms ? form.alternative_terms.split(",").map(k => k.trim()) : []),
      ...(form.synonyms ? form.synonyms.split(",").map(k => k.trim()) : []),
      ...(form.related_terms ? form.related_terms.split(",").map(k => k.trim()) : []),
      ...(form.misspellings ? form.misspellings.split(",").map(k => k.trim()) : []),
    ])).filter(Boolean);

    const finalStatus = targetStatus || form.status;
    const finalSyncedDesc = form.description.trim() || form.seo_description.trim() || null;

    const payload = {
      type_id,
      category_id,
      subcategory_id,
      family_id,
      name: form.name.trim(),
      code: form.code.trim() || null,
      production_name: form.production_name.trim() || null,
      finish_name: form.finish_name.trim() || null,
      brand: form.brand.trim() || null,
      color: form.color.trim() || null,
      material: form.material.trim() || null,
      size: form.size.trim() || null,
      price: Number(form.price) || 0,
      image_url: originalPath,
      image_mode: isAiMode ? "ai" : "manual",
      status: finalStatus,
      processing_state: "completed",
      featured_homepage: form.featured_homepage,
      featured_feed: form.featured_feed,
      hidden: form.hidden,
      short_description: finalSyncedDesc,
      generated_description: finalSyncedDesc,
      seo_title: form.seo_title.trim() || null,
      seo_description: finalSyncedDesc,
      seo_keywords: seoKeywordsArray,
      canonical_slug: form.canonical_slug.trim() || null,
      faq: aiIntelligence?.faq || null,
      structured_data: aiIntelligence?.structured_data || null,
      app_keywords: searchKeywordsArray,
      app_search_keywords: searchKeywordsArray,
      seo_title_manual: !isAiMode,
      seo_description_manual: !isAiMode,
      seo_keywords_manual: !isAiMode,
      slug,
      is_published: finalStatus === "published",
      generated_installed_image: installedPath || null,
    };

    const { data, error } = await supabase.from("products").insert(payload as any).select("id").single();
    
    if (error) { 
      setSaving(false); 
      return toast.error(error.message); 
    }

    if (data?.id) {
      await supabase.from("product_assets").insert([
        {
          product_id: data.id,
          asset_type: "original",
          asset_url: originalPath,
          is_primary: true,
          generated_by_ai: false,
        },
        ...(installedPath ? [{
          product_id: data.id,
          asset_type: "installed",
          asset_url: installedPath,
          is_primary: false,
          generated_by_ai: true,
        }] : [])
      ] as any);

      // Rebuild search index & trigger SEO discovery sitemap update
      await supabase.rpc("rebuild_search_index" as any, { _product_id: data.id } as any);
      await triggerSitemapUpdate(data.id);
    }

    setSaving(false);
    toast.success("Product published, search index built & sitemaps updated!");
    navigate({ to: "/admin/products" });
  };

  return (
    <div className="container-app py-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground uppercase">Upload New Product</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Build V3 — Universal AI Operating System Architecture</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => create("draft")}
            disabled={saving}
            className="rounded border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition"
          >
            Save Draft
          </button>
          <button
            onClick={() => create("published")}
            disabled={saving}
            className="rounded bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm"
          >
            {saving ? "Publishing…" : "Publish Product"}
          </button>
        </div>
      </div>

      {/* SECTION 1: Product Information */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 1 — Product Information</h2>
        </div>

        {/* Classification Hierarchy */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Type *</label>
            <select
              value={type_id}
              onChange={(e) => { setType(e.target.value); setCat(""); setSub(""); setFam(""); }}
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
              onChange={(e) => { setCat(e.target.value); setSub(""); setFam(""); }}
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
              onChange={(e) => { setSub(e.target.value); setFam(""); }}
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
              onChange={(e) => setFam(e.target.value)}
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

        {/* Essential Product Fields */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Name *</label>
            <input
              type="text"
              placeholder="e.g. Statuario White Polished Porcelain Tile"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Code</label>
            <input
              type="text"
              placeholder={previewCode ? `Auto: ${previewCode}` : "Code"}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brand</label>
            <input
              type="text"
              placeholder="e.g. Virony"
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Price (NGN) *</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Size / Dimension</label>
            <input
              type="text"
              placeholder="e.g. 60x120 cm"
              value={form.size}
              onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Finish</label>
            <input
              type="text"
              placeholder="e.g. Polished / Matt"
              value={form.finish_name}
              onChange={(e) => setForm((f) => ({ ...f, finish_name: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Material</label>
            <input
              type="text"
              placeholder="e.g. Porcelain / Marble"
              value={form.material}
              onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color</label>
            <input
              type="text"
              placeholder="e.g. White / Grey Veins"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
        </div>
      </section>

      {/* SECTION 2: Images */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Image className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 2 — Images</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Original Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Original Manufacturer Image *</label>
              <span className="text-[10px] text-muted-foreground">Source of Truth</span>
            </div>
            {originalPath ? (
              <ImageTile
                url={publicImageUrl(originalPath) || originalPath}
                onDelete={() => setOriginalPath(null)}
                onEdit={() => setEditingImage({ url: publicImageUrl(originalPath) || originalPath, target: "original" })}
                badge="Original"
              />
            ) : (
              <ImageUploader multiple={false} onUploaded={(paths) => setOriginalPath(paths[0])} label="Upload Original Product Image" />
            )}
          </div>

          {/* Installed Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Finished Installation Image</label>
              <span className="text-[10px] text-muted-foreground">Lifestyle Reference</span>
            </div>
            {installedPath ? (
              <ImageTile
                url={publicImageUrl(installedPath) || installedPath}
                onDelete={() => setInstalledPath(null)}
                onEdit={() => setEditingImage({ url: publicImageUrl(installedPath) || installedPath, target: "installed" })}
                badge="Installed Scene"
              />
            ) : (
              <ImageUploader multiple={false} onUploaded={(paths) => setInstalledPath(paths[0])} label="Upload Installed Image" />
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerateLifestyleOnNew}
                disabled={generatingLifestyle || !originalPath}
                className="w-full flex items-center justify-center gap-2 rounded border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {generatingLifestyle ? "Engine 2 Generating Installed Image…" : "Generate Installed Image (Engine 2)"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Publishing */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 3 — Publishing Settings</h2>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsAiMode(!isAiMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${isAiMode ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${isAiMode ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-xs font-semibold text-foreground">
              {isAiMode ? "AI Mode Active (Auto Intelligence Routing)" : "Manual Mode (Direct Metadata Entry)"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => create("draft")}
              disabled={saving}
              className="rounded border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => create("published")}
              disabled={saving}
              className="rounded bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm"
            >
              {saving ? "Publishing…" : "Publish Product"}
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 4: Advanced AI (Collapsed by default) */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedAi(!showAdvancedAi)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 4 — Advanced AI Operations</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Engine 1 & Engine 2</span>
          </div>
          {showAdvancedAi ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showAdvancedAi && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleGenerateDetailsOnNew}
                disabled={generatingDetails || !form.name.trim()}
                className="flex items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-4 py-3 text-xs font-bold text-primary hover:bg-primary/20 transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {generatingDetails ? "Generating Details…" : "Generate Product Details (Engine 1)"}
              </button>

              <button
                type="button"
                onClick={handleGenerateLifestyleOnNew}
                disabled={generatingLifestyle || !originalPath}
                className="flex items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-4 py-3 text-xs font-bold text-primary hover:bg-primary/20 transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {generatingLifestyle ? "Generating Installed Image…" : "Generate Installed Image (Engine 2)"}
              </button>

              <button
                type="button"
                onClick={handleRunFullPipelineOnNew}
                disabled={runningPipeline || !form.name.trim()}
                className="flex items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {runningPipeline ? "Running Full Pipeline…" : "Run Full Pipeline"}
              </button>
            </div>

            {/* AI Status & Log */}
            <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-2 font-mono text-muted-foreground">
              <div className="flex items-center justify-between text-foreground font-semibold">
                <span>AI Pipeline Execution Log</span>
                <span className="text-[10px] text-primary">{aiIntelligence ? "Payload Received" : "Idle"}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {aiIntelligence ? `Generated title: "${aiIntelligence.seo_title || "OK"}" | Synced description length: ${(form.description || "").length} chars` : "No AI execution log generated yet. Click above to run Engine 1 or Engine 2."}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 5: SEO (Collapsed by default) */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSeoSection(!showSeoSection)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 5 — Google SEO & Metadata</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Product Desc == SEO Desc</span>
          </div>
          {showSeoSection ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showSeoSection && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Title</label>
              <input
                type="text"
                value={form.seo_title}
                onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Description & Product Description (Synced)</label>
                <span className="text-[9px] text-primary font-semibold">Critical Sync Rule Active</span>
              </div>
              <textarea
                rows={3}
                value={form.seo_description}
                onChange={(e) => handleSeoDescriptionChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs leading-relaxed"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Keywords (Comma Separated)</label>
                <input
                  type="text"
                  value={form.seo_keywords}
                  onChange={(e) => setForm((f) => ({ ...f, seo_keywords: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Canonical Slug</label>
                <input
                  type="text"
                  value={form.canonical_slug}
                  onChange={(e) => setForm((f) => ({ ...f, canonical_slug: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 6: Search Intelligence (Collapsed by default) */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSearchSection(!showSearchSection)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 6 — Search Intelligence Index</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Showroom & Full Text</span>
          </div>
          {showSearchSection ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showSearchSection && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Search Keywords</label>
              <textarea
                rows={2}
                value={form.search_keywords}
                onChange={(e) => setForm((f) => ({ ...f, search_keywords: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alternative Names</label>
                <input
                  type="text"
                  value={form.alternative_terms}
                  onChange={(e) => setForm((f) => ({ ...f, alternative_terms: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Synonyms & Customer Phrases</label>
                <input
                  type="text"
                  value={form.synonyms}
                  onChange={(e) => setForm((f) => ({ ...f, synonyms: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Related Terms</label>
                <input
                  type="text"
                  value={form.related_terms}
                  onChange={(e) => setForm((f) => ({ ...f, related_terms: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Common Misspellings</label>
                <input
                  type="text"
                  value={form.misspellings}
                  onChange={(e) => setForm((f) => ({ ...f, misspellings: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Image Editor Modal (Crop, Rotate, Flip) */}
      {editingImage && (
        <ImageEditorModal
          isOpen={!!editingImage}
          imageUrl={editingImage.url}
          onClose={() => setEditingImage(null)}
          onSave={(newUrl) => {
            if (editingImage.target === "original") {
              setOriginalPath(newUrl);
            } else {
              setInstalledPath(newUrl);
            }
          }}
        />
      )}
    </div>
  );
}
