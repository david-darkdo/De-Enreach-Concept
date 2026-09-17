import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageEditorModal } from "@/components/ImageEditorModal";
import { triggerSitemapUpdate } from "@/lib/seo-publisher";
import { generateStandaloneLifestyleImage } from "@/lib/lifestyle-image.functions";
import { runProductDetailsEngine, DIFFERENTIATOR_TYPES } from "@/lib/product-details.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Sparkles,
  Layers,
  Search,
  Globe,
  Tag,
  Cpu,
  HelpCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Compass,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/products/$id")({
  head: () => ({ meta: [{ title: "Edit Product — Admin" }] }),
  component: AdminProductEditPage,
});

function publicImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
  return data.publicUrl;
}

function AdminProductEditPage() {
  const { id } = Route.useParams();
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Taxonomy Lists
  const [types, setTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [contexts, setContexts] = useState<any[]>([]);

  // Modals & UI Toggles
  const [editingImage, setEditingImage] = useState<"original" | "installed" | null>(null);
  const [generatingLifestyle, setGeneratingLifestyle] = useState(false);
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [showFaqSection, setShowFaqSection] = useState(true);
  const [showSeoSection, setShowSeoSection] = useState(true);
  const [showSearchSection, setShowSearchSection] = useState(true);
  const [showAdvancedAi, setShowAdvancedAi] = useState(true);
  const [showApplicationsSection, setShowApplicationsSection] = useState(true);

  // TanStack Start Server Functions
  const runDetailsFn = useServerFn(runProductDetailsEngine);
  const generateLifestyleFn = useServerFn(generateStandaloneLifestyleImage);

  const load = async () => {
    setLoading(true);
    try {
      const [prodRes, typesRes, catsRes, subsRes, famsRes, ctxRes] = await Promise.all([
        supabase.from("products").select("*").eq("id", id).maybeSingle(),
        supabase.from("product_types").select("*").order("name"),
        supabase.from("categories").select("*").order("name"),
        supabase.from("subcategories").select("*").order("name"),
        supabase.from("family_groups").select("*").order("name"),
        supabase.from("installation_contexts").select("*").order("name"),
      ]);

      if (prodRes.error) throw prodRes.error;
      if (!prodRes.data) throw new Error("Product not found");

      const masterDoc = typeof prodRes.data.master_document === "object" && prodRes.data.master_document ? prodRes.data.master_document : {};
      setP({
        ...prodRes.data,
        original_price: prodRes.data.original_price ?? masterDoc.original_price ?? "",
        pricing_unit: prodRes.data.pricing_unit || masterDoc.pricing_unit || "sqm",
        differentiator_type: prodRes.data.differentiator_type || masterDoc.differentiator_type || "",
        differentiator_note: prodRes.data.differentiator_note || masterDoc.differentiator_note || "",
        applications: prodRes.data.applications || masterDoc.applications || [],
        application_summary: prodRes.data.application_summary || masterDoc.application_summary || "",
        faq: Array.isArray(prodRes.data.faq) ? prodRes.data.faq : (Array.isArray(masterDoc.faq) ? masterDoc.faq : []),
      });
      setTypes(typesRes.data || []);
      setCategories(catsRes.data || []);
      setSubcategories(subsRes.data || []);
      setFamilies(famsRes.data || []);
      setContexts(ctxRes.data || []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load product");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const setField = (key: string, value: any) => {
    setP((prev: any) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  // ENGINE 1 Execution (Single-Pass Product Details)
  const handleGenerateDetails = async () => {
    if (!id) return;
    setGeneratingDetails(true);
    try {
      const res = await runDetailsFn({ data: { productId: id } });
      if (res.ok && res.details) {
        const d = res.details;
        const validFaqs = Array.isArray(d.faq)
          ? d.faq
              .filter((item: any) => item && (item.question || item.q) && (item.answer || item.a))
              .slice(0, 2)
              .map((item: any) => ({
                question: String(item.question || item.q).trim(),
                answer: String(item.answer || item.a).trim(),
              }))
          : [];
        const rawApps = Array.isArray(d.applications)
          ? d.applications.map((a: any) => String(a).trim()).filter(Boolean)
          : [];
        const appSum = typeof d.application_summary === "string" ? d.application_summary.trim() : "";
        const searchKw = [
          ...(Array.isArray(d.search_keywords) ? d.search_keywords : []),
          ...(Array.isArray(d.search_synonyms) ? d.search_synonyms : []),
          ...(Array.isArray(d.alternative_names) ? d.alternative_names : []),
          ...(Array.isArray(d.related_search_terms) ? d.related_search_terms : []),
        ].map((s: any) => String(s).trim()).filter(Boolean);

        setP((prev: any) => ({
          ...prev,
          generated_description: d.generated_description || d.description || d.short_description || prev.generated_description,
          short_description: d.generated_description || d.description || d.short_description || prev.short_description,
          seo_title: d.seo_title || prev.seo_title,
          seo_description: d.seo_description || d.meta_description || prev.seo_description,
          seo_keywords: Array.isArray(d.seo_keywords) ? d.seo_keywords : prev.seo_keywords,
          canonical_slug: d.canonical_slug || prev.canonical_slug,
          applications: rawApps.length > 0 ? rawApps : prev.applications,
          application_summary: appSum || prev.application_summary,
          faq: validFaqs.length > 0 ? validFaqs : prev.faq,
          app_keywords: searchKw.length > 0 ? Array.from(new Set([...(prev.app_keywords || []), ...searchKw])) : prev.app_keywords,
          master_document: {
            ...(prev.master_document || {}),
            applications: rawApps.length > 0 ? rawApps : (prev.master_document?.applications || []),
            application_summary: appSum || (prev.master_document?.application_summary || ""),
            faq: validFaqs.length > 0 ? validFaqs : (prev.master_document?.faq || []),
          },
        }));
        setIsDirty(false);
        toast.success("Engine 1: Single-pass product details & SEO metadata generated!");
        await load();
      } else {
        toast.error("Failed to generate product details.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setGeneratingDetails(false);
    }
  };

  // ENGINE 2 Execution
  const handleGenerateLifestyle = async () => {
    if (!p?.image_url) {
      toast.error("Original Studio Image is required before generating lifestyle scene.");
      return;
    }
    setGeneratingLifestyle(true);
    try {
      const res = await generateLifestyleFn({ data: { productId: id } });
      if (res.ok && res.imageUrl) {
        setP((prev: any) => ({ ...prev, generated_installed_image: res.imageUrl }));
        setIsDirty(false);
        toast.success("Engine 2: Isolated lifestyle scene rendered successfully!");
        await load();
      } else {
        toast.error("Failed to generate lifestyle image.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Lifestyle generation failed");
    } finally {
      setGeneratingLifestyle(false);
    }
  };

  // Full Pipeline
  const handleRunFullPipeline = async () => {
    setRunningPipeline(true);
    try {
      await handleGenerateDetails();
      if (p?.image_url) {
        await handleGenerateLifestyle();
      }
      toast.success("Full AI Pipeline completed!");
    } finally {
      setRunningPipeline(false);
    }
  };

  // FAQ Handlers
  const addFaq = () => {
    const list = Array.isArray(p?.faq) ? [...p.faq] : [];
    if (list.length >= 2) return toast.info("Maximum of 2 FAQs allowed per product.");
    list.push({ question: "", answer: "" });
    setField("faq", list);
  };

  const updateFaq = (idx: number, field: "question" | "answer", val: string) => {
    const list = Array.isArray(p?.faq) ? [...p.faq] : [];
    if (!list[idx]) return;
    list[idx] = { ...list[idx], [field]: val };
    setField("faq", list);
  };

  const removeFaq = (idx: number) => {
    const list = Array.isArray(p?.faq) ? [...p.faq] : [];
    list.splice(idx, 1);
    setField("faq", list);
  };

  // Save product changes
  const handleSave = async (targetStatus?: string) => {
    if (!p) return;
    setSaving(true);
    try {
      const masterDoc = {
        ...(typeof p.master_document === "object" ? p.master_document : {}),
        name: p.name,
        brand: p.brand,
        description: p.generated_description || p.short_description || "",
        seo_title: p.seo_title,
        seo_description: p.seo_description,
        faq: Array.isArray(p.faq) ? p.faq : [],
        applications: Array.isArray(p.applications) ? p.applications : (typeof p.applications === "string" ? p.applications.split(",").map((s: string) => s.trim()).filter(Boolean) : []),
        application_summary: p.application_summary || "",
        pricing_unit: p.pricing_unit || "sqm",
        differentiator_type: p.differentiator_type || null,
        differentiator_note: p.differentiator_note || null,
        original_price: p.original_price ? Number(p.original_price) : null,
      };

      const payload: any = {
        name: p.name,
        code: p.code,
        brand: p.brand,
        production_name: p.production_name,
        type_id: p.type_id || null,
        category_id: p.category_id || null,
        subcategory_id: p.subcategory_id || null,
        family_id: p.family_id || null,
        installation_context_id: p.installation_context_id || null,
        finish: p.finish || p.finish_name,
        finish_name: p.finish_name || p.finish,
        material: p.material,
        color: p.color,
        size: p.size,
        price: Number(p.price) || 0,
        original_price: p.original_price ? Number(p.original_price) : null,
        pricing_unit: p.pricing_unit || "sqm",
        differentiator_type: p.differentiator_type || null,
        differentiator_note: p.differentiator_note || null,
        status: targetStatus || p.status || "published",
        is_published: (targetStatus || p.status) === "published",
        canonical_slug: p.canonical_slug || null,
        short_description: p.short_description || p.generated_description || null,
        generated_description: p.generated_description || p.short_description || null,
        seo_title: p.seo_title || null,
        seo_description: p.seo_description || null,
        seo_keywords: Array.isArray(p.seo_keywords) ? p.seo_keywords : (typeof p.seo_keywords === "string" ? p.seo_keywords.split(",").map((s: string) => s.trim()).filter(Boolean) : []),
        app_keywords: Array.isArray(p.app_keywords) ? p.app_keywords : (typeof p.app_keywords === "string" ? p.app_keywords.split(",").map((s: string) => s.trim()).filter(Boolean) : []),
        app_search_keywords: Array.isArray(p.app_search_keywords) ? p.app_search_keywords : (typeof p.app_search_keywords === "string" ? p.app_search_keywords.split(",").map((s: string) => s.trim()).filter(Boolean) : []),
        faq: Array.isArray(p.faq) ? p.faq : [],
        image_url: p.image_url || null,
        generated_installed_image: p.generated_installed_image || null,
        master_document: masterDoc,
        updated_at: new Date().toISOString(),
      };

      // Strip virtual/computed fields that do not exist directly as product columns
      delete payload.applications;
      delete payload.application_summary;

      const { error } = await supabase.from("products").update(payload).eq("id", id);
      if (error) throw error;

      try {
        await supabase.rpc("rebuild_search_index" as any, { _product_id: id } as any);
      } catch {}
      await triggerSitemapUpdate(id);

      setIsDirty(false);
      toast.success("Product updated successfully!");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const arrToStr = (arr: any) => Array.isArray(arr) ? arr.join(", ") : (arr || "");
  const strToArr = (str: string) => str.split(",").map((s) => s.trim()).filter(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Product not found.</p>
        <Link to="/admin/products" className="text-xs text-primary underline mt-2 inline-block">
          Return to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="container-app py-6 max-w-5xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <Link to="/admin/products" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to library
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{p.name || "Untitled Product"}</h1>
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
              p.status === "published" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"
            }`}>
              {p.status || "Draft"}
            </span>
            {isDirty && (
              <span className="text-[10px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded">
                Unsaved changes
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSave("draft")}
            disabled={saving}
            className="rounded border border-border bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSave("published")}
            disabled={saving}
            className="rounded bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & Publish"}
          </button>
        </div>
      </div>

      {/* SECTION 1: Classification & Core Specifications */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 1 — Product Information</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Type</label>
            <select
              value={p.type_id || ""}
              onChange={(e) => setField("type_id", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            >
              <option value="">Select Type…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</label>
            <select
              value={p.category_id || ""}
              onChange={(e) => setField("category_id", e.target.value)}
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
              value={p.subcategory_id || ""}
              onChange={(e) => setField("subcategory_id", e.target.value)}
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
              value={p.family_id || ""}
              onChange={(e) => setField("family_id", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            >
              <option value="">Select Family…</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Identity Inputs */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Name *</label>
            <input
              type="text"
              value={p.name || ""}
              onChange={(e) => setField("name", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Code / SKU</label>
            <input
              type="text"
              value={p.code || ""}
              onChange={(e) => setField("code", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brand / Manufacturer</label>
            <input
              type="text"
              value={p.brand || ""}
              onChange={(e) => setField("brand", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Material</label>
            <input
              type="text"
              value={p.material || ""}
              onChange={(e) => setField("material", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Finish</label>
            <input
              type="text"
              value={p.finish_name || p.finish || ""}
              onChange={(e) => {
                setField("finish", e.target.value);
                setField("finish_name", e.target.value);
              }}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color / Pattern</label>
            <input
              type="text"
              value={p.color || ""}
              onChange={(e) => setField("color", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dimensions / Size</label>
            <input
              type="text"
              value={p.size || ""}
              onChange={(e) => setField("size", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Installation Context</label>
            <select
              value={p.installation_context_id || ""}
              onChange={(e) => setField("installation_context_id", e.target.value)}
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

      {/* SECTION 2: Media Assets & Visual Studio */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Tag className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 2 — Media Assets</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Main Original Image */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original Studio Product Image *</label>
            {p.image_url ? (
              <div className="relative aspect-square max-w-sm rounded-lg border border-border overflow-hidden bg-background">
                <img src={publicImageUrl(p.image_url)} alt="Original product" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingImage("original")}
                    className="p-1.5 bg-background/80 hover:bg-background rounded shadow text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setField("image_url", null)}
                    className="p-1.5 bg-destructive text-destructive-foreground rounded shadow text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <ImageUploader multiple={false} onUploaded={(paths) => setField("image_url", paths[0])} label="Upload Original Product Image" />
            )}
          </div>

          {/* Installed Lifestyle Image */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lifestyle / Architectural Installed Image</label>
            {p.generated_installed_image ? (
              <div className="relative aspect-square max-w-sm rounded-lg border border-border overflow-hidden bg-background">
                <img src={publicImageUrl(p.generated_installed_image)} alt="Installed scene" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingImage("installed")}
                    className="p-1.5 bg-background/80 hover:bg-background rounded shadow text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setField("generated_installed_image", null)}
                    className="p-1.5 bg-destructive text-destructive-foreground rounded shadow text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <ImageUploader multiple={false} onUploaded={(paths) => setField("generated_installed_image", paths[0])} label="Upload Installed Image" />
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3: Commercial & Differentiator Data */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Tag className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 3 — Commercial & Differentiator Data</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Selling Price (₦) *</label>
            <input
              type="number"
              value={p.price || ""}
              onChange={(e) => setField("price", e.target.value)}
              placeholder="e.g. 25000"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original Price (₦, Optional Anchor)</label>
            <input
              type="number"
              value={p.original_price || ""}
              onChange={(e) => setField("original_price", e.target.value)}
              placeholder="e.g. 35000"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pricing Unit *</label>
            <select
              value={p.pricing_unit || "sqm"}
              onChange={(e) => setField("pricing_unit", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-semibold"
            >
              <option value="sqm">sqm (Per Square Metre)</option>
              <option value="piece">piece (Per Individual Item)</option>
              <option value="set">set (Per Set / Pair)</option>
              <option value="carton">carton (Per Carton / Box)</option>
              <option value="box">box (Per Box)</option>
              <option value="metre">metre (Per Linear Metre)</option>
              <option value="roll">roll (Per Roll)</option>
              <option value="unit">unit (Per Single Unit)</option>
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
                value={p.differentiator_type || ""}
                onChange={(e) => setField("differentiator_type", e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-semibold"
              >
                <option value="">-- Select Differentiator Type --</option>
                {DIFFERENTIATOR_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {p.differentiator_type && !DIFFERENTIATOR_TYPES.includes(p.differentiator_type as any) && (
                  <option value={p.differentiator_type}>{p.differentiator_type} (Custom)</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Differentiator Note</label>
              <input
                type="text"
                value={p.differentiator_note || ""}
                onChange={(e) => setField("differentiator_note", e.target.value)}
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
            value={p.generated_description || p.short_description || ""}
            onChange={(e) => {
              setField("generated_description", e.target.value);
              setField("short_description", e.target.value);
            }}
            placeholder="Rich architectural copywriting for the showroom..."
            className="mt-1 w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed"
          />
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
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Dynamic AI Context</span>
          </div>
          {showApplicationsSection ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showApplicationsSection && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Application Summary</label>
              <input
                type="text"
                value={p.application_summary || ""}
                onChange={(e) => setField("application_summary", e.target.value)}
                placeholder="e.g. Engineered for high-end residential and commercial installations..."
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Suitable Spaces (Comma-Separated)</label>
              <input
                type="text"
                value={arrToStr(p.applications)}
                onChange={(e) => setField("applications", strToArr(e.target.value))}
                placeholder="e.g. Master Bathroom Walls, Luxury Kitchen Islands, Commercial Flooring"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>
          </div>
        )}
      </section>

      {/* SECTION 6: Product-Specific FAQs */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFaqSection(!showFaqSection)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 6 — Product-Specific FAQs</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">0-2 Items Max</span>
          </div>
          {showFaqSection ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showFaqSection && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div className="space-y-3">
              {(Array.isArray(p.faq) ? p.faq : []).map((faqItem: any, idx: number) => (
                <div key={idx} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Question {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeFaq(idx)}
                      className="text-destructive hover:text-destructive/80 p-1 rounded"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={faqItem.question || faqItem.q || ""}
                    onChange={(e) => updateFaq(idx, "question", e.target.value)}
                    placeholder="e.g. Is this tile suitable for outdoor pool areas?"
                    className="w-full rounded-md border border-input bg-background p-2 text-xs font-medium"
                  />
                  <textarea
                    rows={2}
                    value={faqItem.answer || faqItem.a || ""}
                    onChange={(e) => updateFaq(idx, "answer", e.target.value)}
                    placeholder="Concise, authoritative answer..."
                    className="w-full rounded-md border border-input bg-background p-2 text-xs leading-relaxed"
                  />
                </div>
              ))}
              {(p.faq?.length || 0) < 2 && (
                <button
                  type="button"
                  onClick={addFaq}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" /> Add FAQ
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 7: Google SEO & Metadata */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSeoSection(!showSeoSection)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 7 — Google SEO & Metadata</h2>
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
                value={p.seo_title || ""}
                onChange={(e) => setField("seo_title", e.target.value)}
                placeholder="e.g. Royal Marble Polished Tile | Luxury Flooring Abuja"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Meta Description (Search Snippet)</label>
              <textarea
                rows={3}
                value={p.seo_description || ""}
                onChange={(e) => setField("seo_description", e.target.value)}
                placeholder="Concise search engine snippet (under 160 characters)..."
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs leading-relaxed"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Keywords (Comma Separated)</label>
                <input
                  type="text"
                  value={arrToStr(p.seo_keywords)}
                  onChange={(e) => setField("seo_keywords", strToArr(e.target.value))}
                  placeholder="e.g. marble tiles, floor tiles, luxury tiles"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Canonical Slug</label>
                <input
                  type="text"
                  value={p.canonical_slug || ""}
                  onChange={(e) => setField("canonical_slug", e.target.value)}
                  placeholder="e.g. royal-marble-polished-tile"
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 8: Search Intelligence Index */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSearchSection(!showSearchSection)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 8 — Search Intelligence Index</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Showroom & Full Text</span>
          </div>
          {showSearchSection ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showSearchSection && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unified Search Keywords & Synonyms</label>
              <textarea
                rows={3}
                value={arrToStr(p.app_keywords || p.app_search_keywords)}
                onChange={(e) => {
                  const arr = strToArr(e.target.value);
                  setField("app_keywords", arr);
                  setField("app_search_keywords", arr);
                }}
                placeholder="Comma-separated synonyms, alternative names, and search terms..."
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
              />
            </div>
          </div>
        )}
      </section>

      {/* SECTION 9: Advanced AI Operations */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedAi(!showAdvancedAi)}
          className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/40 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 9 — Advanced AI Operations</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">Engine 1 & Engine 2</span>
          </div>
          {showAdvancedAi ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {showAdvancedAi && (
          <div className="p-5 border-t border-border space-y-4 bg-muted/10">
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleGenerateDetails}
                disabled={generatingDetails}
                className="flex items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-4 py-3 text-xs font-bold text-primary hover:bg-primary/20 transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {generatingDetails ? "Generating Details…" : "Generate Product Details (Engine 1)"}
              </button>

              <button
                type="button"
                onClick={handleGenerateLifestyle}
                disabled={generatingLifestyle || !p.image_url}
                className="flex items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-4 py-3 text-xs font-bold text-primary hover:bg-primary/20 transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {generatingLifestyle ? "Generating Installed Image…" : "Generate Installed Image (Engine 2)"}
              </button>

              <button
                type="button"
                onClick={handleRunFullPipeline}
                disabled={runningPipeline}
                className="flex items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {runningPipeline ? "Running Full Pipeline…" : "Run Full Pipeline"}
              </button>
            </div>

            {/* AI Status & Log */}
            <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-2 font-mono text-muted-foreground">
              <div className="flex items-center justify-between text-foreground font-semibold">
                <span>AI Pipeline Status</span>
                <span className="text-[10px] text-primary">{p.processing_state || "completed"}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {p.last_processed_at ? `Last executed at ${new Date(p.last_processed_at).toLocaleString()}` : "Ready to execute Engine 1 (Product Details) or Engine 2 (Installed Scene)."}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Image Editor Modal */}
      {editingImage && (
        <ImageEditorModal
          isOpen={true}
          onClose={() => setEditingImage(null)}
          imageUrl={publicImageUrl(editingImage === "original" ? p.image_url : p.generated_installed_image)}
          title={editingImage === "original" ? "Edit Studio Image" : "Edit Lifestyle Image"}
          onSave={async (newBlob) => {
            const ext = "png";
            const filename = `${editingImage}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { data, error } = await supabase.storage.from("product-media").upload(filename, newBlob, {
              contentType: "image/png",
              upsert: true,
            });
            if (error) {
              toast.error(error.message);
              return;
            }
            if (editingImage === "original") {
              setField("image_url", data.path);
            } else {
              setField("generated_installed_image", data.path);
            }
            setEditingImage(null);
            toast.success("Image updated successfully!");
          }}
        />
      )}
    </div>
  );
}
