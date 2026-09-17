import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  ArrowLeft,
  Save,
  Tag,
  Search,
  Globe,
  Upload,
  Layers,
  ChevronDown,
  ChevronUp,
  Sliders,
  DollarSign,
  Compass,
} from "lucide-react";
import {
  runProductDetailsEngine,
  generateStandaloneLifestyleImage,
  DIFFERENTIATOR_TYPES,
} from "@/lib/product-details.functions";

export const Route = createFileRoute("/_authenticated/admin/products/new")({
  head: () => ({ meta: [{ title: "Create Luxury Product — Admin" }] }),
  component: AdminNewProductPage,
});

function AdminNewProductPage() {
  const navigate = useNavigate();

  // Taxonomy Lists
  const [types, setTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [contexts, setContexts] = useState<any[]>([]);

  // Selected Foreign Keys
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
        const { data, error } = await supabase.rpc("generate_product_code", { _type_id: type_id });
        if (!error && data) setPreviewCode(data);
      } catch {}
    };
    void fetchCode();
  }, [type_id]);

  const setFormField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ENGINE 1 Execution (Single-Pass Product Details)
  const handleGenerateDetailsOnNew = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter a Product Name first.");
      return;
    }

    setGeneratingDetails(true);
    try {
      const slugBase = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const tempSlug = `draft-${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

      const masterDoc = {
        name: form.name.trim(),
        brand: form.brand.trim() || "Enreach Showroom",
        manufacturer: form.brand.trim() || "Enreach Concepts",
        production_name: form.production_name.trim() || null,
        dimensions: form.size.trim() || null,
        pricing_unit: form.pricing_unit || "sqm",
        differentiator_type: form.differentiator_type || null,
        differentiator_note: (form.differentiator_note || "").trim() || null,
        original_price: form.original_price ? Number(form.original_price) : null,
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
        const apps = Array.isArray(d.applications)
          ? d.applications.join(", ")
          : (typeof d.applications === "string" ? d.applications : "");
        const appSum = typeof d.application_summary === "string"
          ? d.application_summary
          : (d.application_summary ? String(d.application_summary) : "");

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

        setShowApplicationsSection(true);
        setShowSeoSection(true);
        setShowSearchSection(true);
        setShowAdvancedAi(true);

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
        toast.success("Engine 2: Architectural lifestyle installation image generated!");
      } else {
        toast.error("Engine 2 failed to generate lifestyle image.");
      }
      await supabase.from("products").delete().eq("id", tempProduct.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate lifestyle image");
    } finally {
      setGeneratingLifestyle(false);
    }
  };

  // Run Both Engines Sequentially
  const handleRunFullPipeline = async () => {
    if (!form.name.trim()) return toast.error("Please enter a Product Name first.");
    setRunningPipeline(true);
    try {
      await handleGenerateDetailsOnNew();
      if (originalPath) {
        await handleGenerateLifestyleOnNew();
      }
      toast.success("Full intelligence pipeline completed!");
    } finally {
      setRunningPipeline(false);
    }
  };

  // Handle Original Studio Upload
  const handleUploadOriginal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop();
      const filename = `studio/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { data, error } = await supabase.storage.from("product-media").upload(filename, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      setOriginalPath(data.path);
      toast.success("Original Studio Image uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
  };

  // Handle Installed Upload
  const handleUploadInstalled = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop();
      const filename = `installed/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { data, error } = await supabase.storage.from("product-media").upload(filename, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      setInstalledPath(data.path);
      toast.success("Lifestyle Installation Image uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
  };

  // Final Product Save / Publish
  const handleSave = async (targetStatus?: string) => {
    if (!form.name.trim()) return toast.error("Product name is required");
    setSaving(true);
    try {
      let slug = form.canonical_slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: existingSlug } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
      if (existingSlug) {
        slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      }

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

      const { data: created, error } = await supabase.from("products").insert(payload as any).select("id").single();
      if (error) throw error;

      // Rebuild search index
      try {
        await supabase.rpc("rebuild_search_index" as any, { _product_id: created.id } as any);
      } catch {}

      toast.success("Product successfully created!");
      void navigate({ to: "/admin/products" });
    } catch (err: any) {
      toast.error(err.message || "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void navigate({ to: "/admin/products" })}
            className="p-2 rounded-lg border border-border hover:bg-muted transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Add New Luxury Product</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Build 4D Unified Intelligence System — Single-pass details & isolated lifestyle rendering
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave("draft")}
            disabled={saving}
            className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => void handleSave("published")}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Publishing..." : "Publish Product"}
          </button>
        </div>
      </div>

      {/* AI Intelligence Action Bar */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-primary">AI Operating System</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Execute single-pass product details or lifestyle architectural imagery without losing form state.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateDetailsOnNew}
            disabled={generatingDetails || !form.name}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {generatingDetails ? "Generating Details..." : "Run Engine 1 (Details AI)"}
          </button>
          <button
            type="button"
            onClick={handleGenerateLifestyleOnNew}
            disabled={generatingLifestyle || !originalPath}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-background px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/10 transition disabled:opacity-50"
          >
            <Layers className="h-3.5 w-3.5" />
            {generatingLifestyle ? "Rendering Scene..." : "Run Engine 2 (Lifestyle AI)"}
          </button>
          <button
            type="button"
            onClick={handleRunFullPipeline}
            disabled={runningPipeline || !form.name}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {runningPipeline ? "Executing..." : "Run Both Engines"}
          </button>
        </div>
      </div>

      {/* SECTION 1: Product Classification & Manual Identity */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Sliders className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 1 — Classification & Identity</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Type *</label>
            <select
              value={type_id}
              onChange={(e) => setTypeId(e.target.value)}
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
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            >
              <option value="">Select Category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subcategory</label>
            <select
              value={subcategory_id}
              onChange={(e) => setSubcategoryId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            >
              <option value="">Select Subcategory…</option>
              {subcategories.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Family Group</label>
            <select
              value={family_id}
              onChange={(e) => setFamilyId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            >
              <option value="">Select Family…</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Product Identity Inputs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setFormField("name", e.target.value)}
              placeholder="e.g. Royal Calacatta Gold Polished Porcelain"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-medium"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Factory / Production Name</label>
            <input
              type="text"
              value={form.production_name}
              onChange={(e) => setFormField("production_name", e.target.value)}
              placeholder="e.g. CAL-GOLD-12060-HP"
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color / Pattern</label>
            <input
              type="text"
              value={form.color}
              onChange={(e) => setFormField("color", e.target.value)}
              placeholder="e.g. Beige Veined, Pure White"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dimensions / Size</label>
            <input
              type="text"
              value={form.size}
              onChange={(e) => setFormField("size", e.target.value)}
              placeholder="e.g. 60x120 cm, 80x80 cm"
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

      {/* SECTION 2: Media Assets */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Tag className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 2 — Media Assets</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Main Original Image */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original Studio Product Image *</label>
            {originalPath ? (
              <div className="relative aspect-square max-w-sm rounded-lg border border-border overflow-hidden bg-background">
                <img src={originalPath.startsWith("http") ? originalPath : supabase.storage.from("product-media").getPublicUrl(originalPath).data.publicUrl} alt="Original product" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setOriginalPath("")}
                  className="absolute top-2 right-2 p-1.5 bg-destructive text-destructive-foreground rounded shadow text-xs"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center aspect-square max-w-sm rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer bg-muted/20">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-xs font-semibold text-foreground">Upload Studio Image</span>
                <span className="text-[10px] text-muted-foreground">PNG, JPG, WebP up to 10MB</span>
                <input type="file" accept="image/*" onChange={handleUploadOriginal} className="hidden" />
              </label>
            )}
          </div>

          {/* Lifestyle Installed Image */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lifestyle / Architectural Installed Image</label>
            {installedPath ? (
              <div className="relative aspect-square max-w-sm rounded-lg border border-border overflow-hidden bg-background">
                <img src={installedPath.startsWith("http") ? installedPath : supabase.storage.from("product-media").getPublicUrl(installedPath).data.publicUrl} alt="Lifestyle product" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setInstalledPath("")}
                  className="absolute top-2 right-2 p-1.5 bg-destructive text-destructive-foreground rounded shadow text-xs"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center aspect-square max-w-sm rounded-lg border-2 border-dashed border-border hover:border-amber-500 cursor-pointer bg-muted/20">
                <Layers className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-xs font-semibold text-foreground">Upload Lifestyle Scene</span>
                <span className="text-[10px] text-muted-foreground">Or generate using Engine 2 above</span>
                <input type="file" accept="image/*" onChange={handleUploadInstalled} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3: Commercial & Pricing */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <DollarSign className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 3 — Commercial & Pricing Structure</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Selling Price (₦) *</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setFormField("price", e.target.value)}
              placeholder="e.g. 18500"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-medium"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original Price / Was Price (₦)</label>
            <input
              type="number"
              value={form.original_price}
              onChange={(e) => setFormField("original_price", e.target.value)}
              placeholder="e.g. 24000 (Shows strikethrough discount)"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pricing Unit *</label>
            <select
              value={form.pricing_unit}
              onChange={(e) => setFormField("pricing_unit", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-medium"
            >
              <option value="sqm">Per SQM (/m²)</option>
              <option value="piece">Per Piece (/pc)</option>
              <option value="carton">Per Carton (/box)</option>
              <option value="pack">Per Pack (/pack)</option>
              <option value="set">Per Set (/set)</option>
              <option value="linear_meter">Per Linear Meter (/m)</option>
            </select>
          </div>
        </div>
      </section>

      {/* SECTION 4: Product Differentiator */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Tag className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 4 — Product Differentiator</h2>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Build 4D Differentiator Architecture</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Differentiator Type</label>
            <select
              value={form.differentiator_type}
              onChange={(e) => setFormField("differentiator_type", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-medium"
            >
              <option value="">Select Differentiator Type…</option>
              {DIFFERENTIATOR_TYPES.map((dt) => (
                <option key={dt} value={dt}>{dt}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Differentiator Note</label>
            <input
              type="text"
              value={form.differentiator_note}
              onChange={(e) => setFormField("differentiator_note", e.target.value)}
              placeholder="e.g. 9mm heavy-duty slab suitable for vehicular driveways"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
        </div>
      </section>

      {/* SECTION 5: Suitable Spaces & Applications */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowApplicationsSection(!showApplicationsSection)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 5 — Suitable Spaces & Applications</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Dynamic Context</span>
          </div>
          {showApplicationsSection ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showApplicationsSection && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Application Summary</label>
              <input
                type="text"
                value={form.application_summary}
                onChange={(e) => setFormField("application_summary", e.target.value)}
                placeholder="e.g. Engineered for high-end residential and commercial installations..."
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Suitable Spaces (Comma-Separated)</label>
              <input
                type="text"
                value={form.applications}
                onChange={(e) => setFormField("applications", e.target.value)}
                placeholder="e.g. Master Bathroom Walls, Luxury Kitchen Islands, Commercial Flooring"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
          </div>
        )}
      </section>

      {/* SECTION 6: Google SEO & Metadata */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSeoSection(!showSeoSection)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 6 — Google SEO & Metadata</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Google Search Snippet</span>
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
                onChange={(e) => setFormField("seo_title", e.target.value)}
                placeholder="e.g. Royal Marble Polished Tile | Luxury Flooring Abuja"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Meta Description (Search Snippet)</label>
              <textarea
                rows={3}
                value={form.seo_description}
                onChange={(e) => setFormField("seo_description", e.target.value)}
                placeholder="Concise search engine snippet (under 160 characters)..."
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs leading-relaxed"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Keywords (Comma Separated)</label>
                <input
                  type="text"
                  value={form.seo_keywords}
                  onChange={(e) => setFormField("seo_keywords", e.target.value)}
                  placeholder="e.g. calacatta tile, luxury marble, abuja porcelain"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Canonical Slug</label>
                <input
                  type="text"
                  value={form.canonical_slug}
                  onChange={(e) => setFormField("canonical_slug", e.target.value)}
                  placeholder="e.g. royal-calacatta-gold-polished-porcelain"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 7: Showroom Narrative & Discovery */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedAi(!showAdvancedAi)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 7 — Showroom Description & Narrative</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Engine 1 Customer Narrative</span>
          </div>
          {showAdvancedAi ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showAdvancedAi && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer-Facing Product Description</label>
              <textarea
                rows={6}
                value={form.description}
                onChange={(e) => setFormField("description", e.target.value)}
                placeholder="Rich architectural product description highlighting craftsmanship, finish, and spatial elegance..."
                className="mt-1 w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed"
              />
            </div>
          </div>
        )}
      </section>

      {/* SECTION 8: Unified Search Synonyms & Tokens */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSearchSection(!showSearchSection)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 8 — Search Intelligence & Discovery Terms</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Internal Search Index</span>
          </div>
          {showSearchSection ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showSearchSection && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Search Keywords (Comma Separated)</label>
                <input
                  type="text"
                  value={form.search_keywords}
                  onChange={(e) => setFormField("search_keywords", e.target.value)}
                  placeholder="e.g. gold veined tile, luxury floor slab"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alternative Terms (Comma Separated)</label>
                <input
                  type="text"
                  value={form.alternative_terms}
                  onChange={(e) => setFormField("alternative_terms", e.target.value)}
                  placeholder="e.g. calacatta slab, marble-effect porcelain"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Synonyms (Comma Separated)</label>
                <input
                  type="text"
                  value={form.synonyms}
                  onChange={(e) => setFormField("synonyms", e.target.value)}
                  placeholder="e.g. glazed tile, vitrified slab"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Common Misspellings (Comma Separated)</label>
                <input
                  type="text"
                  value={form.misspellings}
                  onChange={(e) => setFormField("misspellings", e.target.value)}
                  placeholder="e.g. calacata, porclain, marbel"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
