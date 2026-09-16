import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageEditorModal } from "@/components/ImageEditorModal";
import { triggerSitemapUpdate } from "@/lib/seo-publisher";
import { generateStandaloneLifestyleImage } from "@/lib/lifestyle-image.functions";
import { runProductDetailsEngine } from "@/lib/product-details.functions";
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
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [generatingLifestyle, setGeneratingLifestyle] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [showAdvancedAi, setShowAdvancedAi] = useState(true);
  const [showSeoSection, setShowSeoSection] = useState(true);
  const [showSearchSection, setShowSearchSection] = useState(true);
  const [showFaqSection, setShowFaqSection] = useState(true);
  const [showApplicationsSection, setShowApplicationsSection] = useState(true);
  const [editingImage, setEditingImage] = useState<{ url: string; target: "image_url" | "generated_installed_image" } | null>(null);

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
    setGeneratingDetails(true);
    try {
      const res = await runDetailsFn({ data: { productId: id } });
      if (res.ok) {
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
    toast.success("Full AI pipeline completed!");
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

    setSaving(false);
    setIsDirty(false);
    toast.success("Product changes saved, search index & sitemaps updated!");
    await load();
  };

  const arrToStr = (v: any) => (Array.isArray(v) ? v.join(", ") : v ?? "");
  const strToArr = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

  if (loading) {
    return (
      <div className="container-app py-12 text-center text-xs text-muted-foreground font-mono">
        Loading product details…
      </div>
    );
  }

  if (!p) return null;

  const filteredCats = categories.filter((c) => !p.type_id || c.type_id === p.type_id);
  const filteredSubs = subcategories.filter((s) => !p.category_id || s.category_id === p.category_id);
  const filteredFams = families.filter((f) => !p.subcategory_id || f.subcategory_id === p.subcategory_id);

  return (
    <div className="container-app py-6 max-w-5xl space-y-6">
      {/* Header Navigation & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <Link to="/admin/products" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to library
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground uppercase">{p.name || "Edit Product"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">ID: {id} · Code: {p.code}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category *</label>
            <select
              value={p.category_id || ""}
              onChange={(e) => setField("category_id", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
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
              value={p.subcategory_id || ""}
              onChange={(e) => setField("subcategory_id", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
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
              value={p.family_id || ""}
              onChange={(e) => setField("family_id", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
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
              value={p.finish || p.finish_name || ""}
              onChange={(e) => setField("finish", e.target.value)}
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
              placeholder="e.g. 60x120 cm"
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
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Publishing Status</label>
            <select
              value={p.status || "published"}
              onChange={(e) => setField("status", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs font-semibold"
            >
              <option value="published">Published (Visible in Showroom)</option>
              <option value="draft">Draft (Hidden)</option>
              <option value="archived">Archived</option>
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
            {p.image_url ? (
              <div className="relative aspect-square max-w-sm rounded-lg border border-border overflow-hidden bg-background">
                <img src={publicImageUrl(p.image_url) || p.image_url} alt="Original product" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingImage({ url: publicImageUrl(p.image_url) || p.image_url, target: "image_url" })}
                    className="p-1.5 bg-background/80 hover:bg-background rounded shadow text-xs font-semibold"
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

          {/* Installed Lifestyle Reference */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Installed Scene Reference (Engine 2)</label>
            {p.generated_installed_image ? (
              <div className="relative aspect-square max-w-sm rounded-lg border border-border overflow-hidden bg-background">
                <img src={publicImageUrl(p.generated_installed_image) || p.generated_installed_image} alt="Installed scene" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingImage({ url: publicImageUrl(p.generated_installed_image) || p.generated_installed_image, target: "generated_installed_image" })}
                    className="p-1.5 bg-background/80 hover:bg-background rounded shadow text-xs font-semibold"
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current Selling Price (₦) *</label>
            <input
              type="number"
              value={p.price || ""}
              onChange={(e) => setField("price", e.target.value)}
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
              <input
                type="text"
                value={p.differentiator_type || ""}
                onChange={(e) => setField("differentiator_type", e.target.value)}
                placeholder="e.g. Large Format, Wall Mounted, Handcrafted"
                className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
              />
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
            onChange={(e) => setField("generated_description", e.target.value)}
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
            {Array.isArray(p.faq) && p.faq.length > 0 ? (
              <div className="space-y-3">
                {p.faq.map((f: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-primary font-mono">FAQ #{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFaq(i)}
                        className="text-destructive hover:text-destructive/80 text-xs p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={f.question || f.q || ""}
                      onChange={(e) => handleUpdateFaq(i, "question", e.target.value)}
                      placeholder="Question..."
                      className="w-full rounded border border-input bg-background p-2 text-xs font-semibold"
                    />
                    <textarea
                      rows={2}
                      value={f.answer || f.a || ""}
                      onChange={(e) => handleUpdateFaq(i, "answer", e.target.value)}
                      placeholder="Answer..."
                      className="w-full rounded border border-input bg-background p-2 text-xs leading-relaxed"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No FAQs recorded. Add up to 2 product-specific FAQs or generate with Engine 1.</p>
            )}

            {(!Array.isArray(p.faq) || p.faq.length < 2) && (
              <button
                type="button"
                onClick={handleAddFaq}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add Product FAQ
              </button>
            )}
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
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Canonical Slug</label>
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
                onChange={(e) => setField("app_keywords", strToArr(e.target.value))}
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
                <span>AI State: {p.processing_state || "completed"}</span>
                <span className="text-[10px] text-primary">{p.last_processed_at ? new Date(p.last_processed_at).toLocaleString() : "Never"}</span>
              </div>
              {p.error_log ? (
                <p className="text-[11px] text-destructive">{typeof p.error_log === "object" ? JSON.stringify(p.error_log) : p.error_log}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Product details engine synced. Ready for publishing.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Image Editor Modal */}
      {editingImage && (
        <ImageEditorModal
          isOpen={!!editingImage}
          imageUrl={editingImage.url}
          productId={p?.id}
          onClose={() => setEditingImage(null)}
          onSave={async (newUrl) => {
            const targetField = editingImage.target;
            setField(targetField, newUrl);
            if (p?.id) {
              await supabase
                .from("products")
                .update({ [targetField]: newUrl } as any)
                .eq("id", p.id);
              toast.success("Edited photo permanently saved to product database!");
            }
          }}
        />
      )}
    </div>
  );
}
