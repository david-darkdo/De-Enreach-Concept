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
  const [types, setTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [contexts, setContexts] = useState<any[]>([]);

  // Engine Execution States
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [generatingLifestyle, setGeneratingLifestyle] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);

  // TanStack Start Server Function Hooks
  const runDetailsFn = useServerFn(runProductDetailsEngine);
  const generateLifestyleFn = useServerFn(generateStandaloneLifestyleImage);

  // Modal editor states
  const [editingImage, setEditingImage] = useState<{ url: string; bucket: string; pathPrefix: string; field: string } | null>(null);

  // Accordion toggle states
  const [showAdvancedAi, setShowAdvancedAi] = useState(true);
  const [showSeoSection, setShowSeoSection] = useState(true);
  const [showSearchSection, setShowSearchSection] = useState(true);
  const [showApplicationsSection, setShowApplicationsSection] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: prod, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !prod) {
      toast.error("Failed to load product details.");
      setLoading(false);
      return;
    }

    // Hydrate fields from master_document if top-level fields are missing
    const masterDoc = typeof prod.master_document === "object" && prod.master_document ? prod.master_document : {};
    const hydratedProduct = {
      ...prod,
      pricing_unit: prod.pricing_unit || masterDoc.pricing_unit || "sqm",
      differentiator_type: prod.differentiator_type || masterDoc.differentiator_type || "",
      differentiator_note: prod.differentiator_note || masterDoc.differentiator_note || "",
      original_price: prod.original_price != null ? prod.original_price : (masterDoc.original_price ?? ""),
      applications: Array.isArray(masterDoc.applications) ? masterDoc.applications : (Array.isArray(prod.applications) ? prod.applications : []),
      application_summary: masterDoc.application_summary || prod.application_summary || "",
      faq: Array.isArray(prod.faq) && prod.faq.length > 0 ? prod.faq : (Array.isArray(masterDoc.faq) ? masterDoc.faq : []),
    };

    setP(hydratedProduct);
    setLoading(false);
  };

  useEffect(() => {
    const fetchTaxonomy = async () => {
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
    void fetchTaxonomy();
    void load();
  }, [id]);

  const setField = (field: string, value: any) => {
    setP((prev: any) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  // ENGINE 1 Execution
  const handleGenerateDetails = async () => {
    setGeneratingDetails(true);
    try {
      const res = await runDetailsFn({ data: { productId: id } });
      if (res.ok && res.details) {
        const d = res.details;
        const validFaqs = Array.isArray(d.faq) ? d.faq : [];
        const rawApps = Array.isArray(d.applications) ? d.applications : [];
        const appSum = typeof d.application_summary === "string" ? d.application_summary : "";
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
      toast.error("Please upload an Original Product Image first.");
      return;
    }
    setGeneratingLifestyle(true);
    try {
      const res = await generateLifestyleFn({ data: { productId: id } });
      if (res.ok && res.imageUrl) {
        toast.success("Engine 2: Installed lifestyle image generated!");
        await load();
      } else {
        toast.error("Failed to generate installed image.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Image generation failed");
    } finally {
      setGeneratingLifestyle(false);
    }
  };

  // Full Pipeline Runner
  const handleRunFullPipeline = async () => {
    setRunningPipeline(true);
    await handleGenerateDetails();
    if (p?.image_url) {
      await handleGenerateLifestyle();
    }
    setRunningPipeline(false);
    toast.success("Full AI pipeline completed for product details & lifestyle image!");
  };

  // FAQ Handlers
  const handleAddFaq = () => {
    const currentFaqs = Array.isArray(p.faq) ? p.faq : [];
    if (currentFaqs.length >= 2) {
      toast.error("Maximum 2 product-specific FAQs permitted.");
      return;
    }
    setField("faq", [...currentFaqs, { question: "", answer: "" }]);
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", value: string) => {
    const currentFaqs = Array.isArray(p.faq) ? [...p.faq] : [];
    if (!currentFaqs[index]) return;
    currentFaqs[index] = { ...currentFaqs[index], [field]: value };
    setField("faq", currentFaqs);
  };

  const handleRemoveFaq = (index: number) => {
    const currentFaqs = Array.isArray(p.faq) ? [...p.faq] : [];
    currentFaqs.splice(index, 1);
    setField("faq", currentFaqs);
  };

  // SAVE HANDLER
  const save = async () => {
    setSaving(true);
    const prodDesc = p.generated_description || p.short_description || null;
    const seoDesc = p.seo_description || null;
    const masterDoc = typeof p.master_document === "object" && p.master_document ? p.master_document : {};

    const updatedMasterDoc = {
      ...masterDoc,
      name: p.name,
      brand: p.brand,
      description: prodDesc,
      seo_title: p.seo_title,
      seo_description: seoDesc,
      faq: p.faq,
      applications: Array.isArray(p.applications) ? p.applications : (typeof p.applications === "string" ? p.applications.split(",").map((s: string) => s.trim()).filter(Boolean) : []),
      application_summary: p.application_summary || "",
      pricing_unit: p.pricing_unit || "sqm",
      differentiator_type: p.differentiator_type || null,
      differentiator_note: (p.differentiator_note || "").trim() || null,
      original_price: p.original_price ? Number(p.original_price) : null,
    };

    const payload = {
      ...p,
      short_description: prodDesc,
      generated_description: prodDesc,
      seo_description: seoDesc,
      is_published: p.status === "published",
      price: Number(p.price) || 0,
      original_price: p.original_price ? Number(p.original_price) : null,
      pricing_unit: p.pricing_unit || "sqm",
      differentiator_type: p.differentiator_type || null,
      differentiator_note: (p.differentiator_note || "").trim() || null,
      master_document: updatedMasterDoc,
      processing_state: "completed",
    };
    delete payload.id;
    delete payload.created_at;
    delete payload.updated_at;
    delete payload.similar_product_ids;
    delete payload.applications;
    delete payload.application_summary;

    const { error } = await supabase.from("products").update(payload as any).eq("id", id);
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }

    // Rebuild search index & trigger SEO discovery sitemap update
    try {
      await supabase.rpc("rebuild_search_index" as any, { _product_id: id } as any);
    } catch {}
    await triggerSitemapUpdate(id);

    setIsDirty(false);
    setSaving(false);
    toast.success("Product changes saved and indexed successfully!");
    await load();
  };

  if (loading || !p) {
    return (
      <div className="container-app py-16 text-center text-sm text-muted-foreground">
        Loading product details…
      </div>
    );
  }

  return (
    <div className="container-app py-6 max-w-5xl space-y-6">
      {/* Header Navigation & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <Link to="/admin/products" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to library
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground uppercase">{p.name}</h1>
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              p.status === "published" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"
            }`}>
              {p.status}
            </span>
          </div>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">Code: {p.code} · ID: {p.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/product/${p.slug || p.id}`}
            target="_blank"
            className="rounded border border-border bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
          >
            Preview Page
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : isDirty ? "Save Changes *" : "Save Changes"}
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

        {/* Identity & Technical Specs */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Name *</label>
            <input
              type="text"
              value={p.name || ""}
              onChange={(e) => setField("name", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
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
                setField("finish_name", e.target.value);
                setField("finish", e.target.value);
              }}
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Color / Pattern</label>
            <input
              type="text"
              value={p.color || ""}
              onChange={(e) => setField("color", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Production Series Name</label>
            <input
              type="text"
              value={p.production_name || ""}
              onChange={(e) => setField("production_name", e.target.value)}
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

      {/* SECTION 2: Media Assets & AI Engine Studio */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 2 — Product Media & AI Engine</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateDetails}
              disabled={generatingDetails}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition disabled:opacity-50"
            >
              <Cpu className="h-3.5 w-3.5" />
              {generatingDetails ? "Generating Details…" : "Run Engine 1 (Details AI)"}
            </button>
            <button
              onClick={handleGenerateLifestyle}
              disabled={generatingLifestyle || !p.image_url}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/20 transition disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generatingLifestyle ? "Rendering Scene…" : "Run Engine 2 (Lifestyle Scene)"}
            </button>
            <button
              onClick={handleRunFullPipeline}
              disabled={runningPipeline}
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
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original Product Image</label>
              <span className="text-[10px] text-primary font-semibold">Authoritative Source Asset</span>
            </div>
            <ImageUploader
              value={p.image_url}
              onChange={(url) => setField("image_url", url)}
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
              value={p.generated_installed_image}
              onChange={(url) => setField("generated_installed_image", url)}
              bucket="product-media"
              pathPrefix="products/installed"
              label="Engine 2 generated lifestyle reference or custom showroom installation photo"
            />
          </div>
        </div>
      </section>

      {/* SECTION 3: Pricing & Commercial Units */}
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
              value={p.original_price || ""}
              onChange={(e) => setField("original_price", e.target.value)}
              placeholder="e.g. 35000"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current Selling Price (₦) *</label>
            <input
              type="number"
              value={p.price || 0}
              onChange={(e) => setField("price", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pricing Unit</label>
            <select
              value={p.pricing_unit || "sqm"}
              onChange={(e) => setField("pricing_unit", e.target.value)}
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

      {/* SECTION 4: Product Narrative & Descriptions */}
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
                value={Array.isArray(p.applications) ? p.applications.join(", ") : (p.applications || "")}
                onChange={(e) => {
                  const items = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                  setField("applications", items);
                }}
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
                value={p.application_summary || ""}
                onChange={(e) => setField("application_summary", e.target.value)}
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
                <span className="text-[10px] font-mono text-muted-foreground">{(p.seo_title || "").length} chars</span>
              </div>
              <input
                type="text"
                value={p.seo_title || ""}
                onChange={(e) => setField("seo_title", e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Meta Description (Target: &lt;160 chars)</label>
                <span className="text-[10px] font-mono text-muted-foreground">{(p.seo_description || "").length} chars</span>
              </div>
              <textarea
                rows={2}
                value={p.seo_description || ""}
                onChange={(e) => setField("seo_description", e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEO Keywords (Comma separated)</label>
                <input
                  type="text"
                  value={Array.isArray(p.seo_keywords) ? p.seo_keywords.join(", ") : (p.seo_keywords || "")}
                  onChange={(e) => {
                    const items = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    setField("seo_keywords", items);
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Canonical URL Slug</label>
                <input
                  type="text"
                  value={p.canonical_slug || p.slug || ""}
                  onChange={(e) => setField("canonical_slug", e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 7: Showroom Search Aliases & Tokens */}
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
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Universal Search Keywords & Query Tokens (Comma separated)
            </label>
            <textarea
              rows={3}
              value={Array.isArray(p.app_keywords) ? p.app_keywords.join(", ") : (p.app_keywords || "")}
              onChange={(e) => {
                const items = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                setField("app_keywords", items);
                setField("app_search_keywords", items);
              }}
              placeholder="e.g. marble tile, polished porcelain, floor slab, calacatta white"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
            />
          </div>
        )}
      </section>

      {/* SECTION 8: Product-Specific FAQ (0-2 Items) */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Section 8 — Product-Specific FAQs (Max 2)</h2>
          </div>
          {(!Array.isArray(p.faq) || p.faq.length < 2) && (
            <button
              type="button"
              onClick={handleAddFaq}
              className="inline-flex items-center gap-1 rounded bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition"
            >
              <Plus className="h-3 w-3" /> Add FAQ
            </button>
          )}
        </div>

        {Array.isArray(p.faq) && p.faq.length > 0 ? (
          <div className="space-y-3">
            {p.faq.map((item: any, idx: number) => (
              <div key={idx} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Question {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFaq(idx)}
                    className="text-muted-foreground hover:text-destructive transition p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={item.question || item.q || ""}
                  onChange={(e) => handleUpdateFaq(idx, "question", e.target.value)}
                  placeholder="e.g. Is this tile suitable for wet master bathroom areas?"
                  className="w-full rounded-md border border-input bg-background p-2 text-xs"
                />
                <textarea
                  rows={2}
                  value={item.answer || item.a || ""}
                  onChange={(e) => handleUpdateFaq(idx, "answer", e.target.value)}
                  placeholder="e.g. Yes, its impervious full-body porcelain rating prevents water penetration."
                  className="w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No FAQs added. Engine 1 automatically generates up to 2 high-value, product-specific questions during details analysis.
          </p>
        )}
      </section>

      {/* Footer Save Action Bar */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Link to="/admin/products" className="text-xs text-muted-foreground hover:text-foreground">
          Cancel & Return
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-primary px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving Changes…" : isDirty ? "Save Changes *" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
