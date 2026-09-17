import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { runSandboxStage } from "@/lib/ai-pipeline.functions";
import {
  Sparkles,
  FileText,
  Save,
  RotateCcw,
  History,
  ToggleLeft,
  ToggleRight,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Eye,
  Zap,
  Brain,
  Search,
  Star,
  ShieldCheck,
  Image as ImageIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai-templates")({
  head: () => ({ meta: [{ title: "AI Control Center — Admin" }] }),
  component: AdminAiTemplatesPage,
});

type PromptTemplate = {
  id: string;
  key: string;
  name: string;
  purpose: string;
  prompt_text: string;
  is_active: boolean;
  version: number;
  updated_at?: string;
};

type VersionHistory = {
  id: string;
  template_id: string;
  name: string;
  prompt_text: string;
  is_active: boolean;
  version: number;
  created_at: string;
  created_by?: string;
};

type SandboxResult = {
  compiledPrompt: string;
  aiResponse: string;
  executionMs: number;
  stageKey: string;
  providerName: string;
  isImageStage: boolean;
  productName: string;
  imageUrl: string | null;
  validationResult?: any;
};

const STAGE_ICONS: Record<string, React.ElementType> = {
  product_details: FileText,
  lifestyle: ImageIcon,
  understanding: Brain,
  seo: Search,
  search: Zap,
  recommendation: Star,
  quality: ShieldCheck,
};

const STAGE_ORDER = ["product_details", "lifestyle"];

const CANONICAL_PROMPT_DEFAULTS: Record<string, string> = {
  product_details: `Analyze the product details and uploaded image for Enreach Concepts Digital Showroom (Abuja, Nigeria):

Product Name: {product_name}
Code / SKU: {code}
Brand: {brand}
Manufacturer: {manufacturer}
Production Name: {production_name}
Category: {category}
Product Type: {type}
Subcategory: {subcategory}
Family Group: {family}
Finish: {finish}
Material: {material}
Color: {color}
Size / Dimensions: {size} {dimensions}
Price: {price}
Original Price: {original_price}
Pricing Unit: {pricing_unit}
Differentiator Type: {differentiator_type}
Differentiator Note: {differentiator_note}

CONTEXT & RULES:
1. Showroom Role: You are the Professional Architectural Product Intelligence Engine for Enreach Concepts, a luxury building-materials showroom in Abuja, Nigeria. You specialize in tiles, porcelain, marble, granite, sanitaryware, doors, plumbing, lighting, furniture, and premium architectural finishes.
2. Authoritative Data: Manual product inputs above are 100% authoritative. Never contradict, overwrite, or misstate manual specifications.
3. Project Differentiator: When {differentiator_type} and {differentiator_note} are provided, intelligently weave this distinction into the narrative, applications, and search keywords without mechanically repeating raw strings. If absent, reason from available evidence.
4. Anti-Fabrication: Never invent unverified technical certifications, load ratings, fire ratings, or warranty claims unless provided.
5. Location Awareness: Where natural, incorporate Nigerian and Abuja market context (e.g. residential estates, commercial projects, tropical durability) into SEO and customer discovery without keyword stuffing.
6. Single-Pass JSON Output: Output exactly ONE raw JSON object with NO markdown, NO backticks, NO conversational intro.

JSON SCHEMA:
{
  "generated_description": "Rich, elegant, architectural showroom narrative for designers, architects, contractors, and luxury homeowners.",
  "seo_title": "Compelling search engine title under 60 characters with high buyer intent.",
  "seo_description": "Concise, search-friendly meta snippet under 160 characters. Do NOT clone the product description.",
  "seo_keywords": ["keyword 1", "keyword 2", "keyword 3"],
  "canonical_slug": "url-friendly-slug-suggestion",
  "applications": ["2 to 4 concise, product-specific application or suitable space labels"],
  "application_summary": "1 to 2 concise sentences explaining where and why this specific product excels.",
  "faq": [
    {"q": "0 to 2 genuine product-specific questions", "a": "Accurate, helpful answers"}
  ],
  "search_keywords": ["search term 1", "search term 2"],
  "search_synonyms": ["synonym 1", "synonym 2"],
  "alternative_names": ["alternative name 1", "alternative name 2"],
  "related_search_terms": ["related term 1", "related term 2"],
  "common_customer_phrases": ["customer phrase 1", "customer phrase 2"],
  "common_misspellings": ["common misspelling 1", "common misspelling 2"],
  "visual_characteristics": {
    "material": "detected or confirmed material",
    "finish": "detected or confirmed finish",
    "color": "detected primary and accent colors",
    "texture": "visual texture description",
    "style": "aesthetic style classification"
  },
  "structured_schema_org": {
    "@type": "Product",
    "name": "{product_name}",
    "description": "Concise summary for schema markup"
  }
}`,
  lifestyle: `Realistic architectural photograph of {product_name} installed in a tasteful luxury {context} setting. High-end interior design, realistic natural ambient lighting, 8k resolution, authentic material texture and finish.`,
};

const STAGE_LABELS: Record<string, { label: string; description: string; color: string }> = {
  product_details: {
    label: "Universal Detailed Prompt Editor (Engine 1)",
    description: "Universal text engine template — generates all product descriptions, canonical short description, SEO title, meta description, FAQ, search keywords, and recommendations in a single structured JSON payload.",
    color: "text-violet-600 bg-violet-500/10 border-violet-500/20",
  },
  lifestyle: {
    label: "Lifestyle Generation Installation Prompt Editor (Engine 2)",
    description: "Universal image generation prompt template — renders the product in a realistic installed architectural scene using original manufacturer image + product metadata.",
    color: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  },
};

function AdminAiTemplatesPage() {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string>("admin");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("product_details");
  const [activeTab, setActiveTab] = useState<"editor" | "sandbox" | "history">("editor");
  const [historyLogs, setHistoryLogs] = useState<VersionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Sandbox state
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [sandboxResult, setSandboxResult] = useState<SandboxResult | null>(null);
  const [sandboxError, setSandboxError] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const sandboxFn = useServerFn(runSandboxStage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isSuperAdmin = userRole === "super_admin" || userRole === "admin";

  const fetchUserRole = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (data?.role) setUserRole(data.role);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [tplRes, prodRes] = await Promise.all([
        supabase.from("ai_prompt_templates").select("*").order("name"),
        supabase.from("products").select("id, name, brand, image_url, code, material, finish_name, price").limit(30),
      ]);

      const rawTemplates = tplRes.data || [];
      const templateMap: Record<string, PromptTemplate> = {};

      rawTemplates.forEach((t: any) => {
        if (t.key) {
          templateMap[t.key] = {
            id: t.id,
            key: t.key,
            name: t.name || STAGE_LABELS[t.key]?.label || t.key,
            purpose: t.purpose || STAGE_LABELS[t.key]?.description || "",
            prompt_text: t.prompt_text || CANONICAL_PROMPT_DEFAULTS[t.key] || "",
            is_active: t.is_active ?? true,
            version: t.version || 1,
            updated_at: t.updated_at,
          };
        }
      });

      const fullTemplates: PromptTemplate[] = STAGE_ORDER.map((k) => {
        if (templateMap[k]) return templateMap[k];
        return {
          id: `virtual-${k}`,
          key: k,
          name: STAGE_LABELS[k]?.label || k,
          purpose: STAGE_LABELS[k]?.description || "",
          prompt_text: CANONICAL_PROMPT_DEFAULTS[k] || "",
          is_active: true,
          version: 1,
        };
      });

      setTemplates(fullTemplates);
      setProducts(prodRes.data || []);
      if (prodRes.data && prodRes.data.length > 0 && !selectedProductId) {
        setSelectedProductId(prodRes.data[0].id);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load AI Prompt Templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUserRole();
    void loadData();
  }, [user?.id]);

  const loadHistory = async (templateId: string) => {
    if (templateId.startsWith("virtual-")) {
      setHistoryLogs([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_prompt_template_history")
        .select("*")
        .eq("template_id", templateId)
        .order("version", { ascending: false });

      if (error) throw error;
      setHistoryLogs(data || []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load version history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSelectTemplate = (key: string) => {
    setSelectedKey(key);
    setSandboxResult(null);
    setSandboxError("");
    const tpl = templates.find((t) => t.key === key);
    if (tpl && activeTab === "history") {
      void loadHistory(tpl.id);
    }
  };

  const handleTabChange = (tab: "editor" | "sandbox" | "history") => {
    setActiveTab(tab);
    if (tab === "history" && currentTemplate) {
      void loadHistory(currentTemplate.id);
    }
  };

  const currentTemplate = templates.find((t) => t.key === selectedKey) || templates[0];
  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  const handleFieldChange = (field: keyof PromptTemplate, value: any) => {
    if (!isSuperAdmin) return;
    setTemplates((prev) =>
      prev.map((t) => (t.key === selectedKey ? { ...t, [field]: value } : t))
    );
  };

  const handleSave = async () => {
    if (!isSuperAdmin || !currentTemplate) return;
    setSaving(true);
    try {
      const isVirtual = currentTemplate.id.startsWith("virtual-");
      let savedId = currentTemplate.id;

      if (isVirtual) {
        const { data, error } = await supabase
          .from("ai_prompt_templates")
          .insert({
            key: currentTemplate.key,
            name: currentTemplate.name,
            purpose: currentTemplate.purpose,
            prompt_text: currentTemplate.prompt_text,
            is_active: currentTemplate.is_active,
            version: 1,
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;
        savedId = data.id;
        toast.success(`Created and initialized "${currentTemplate.name}"`);
      } else {
        const nextVersion = (currentTemplate.version || 1) + 1;

        await supabase.from("ai_prompt_template_history").insert({
          template_id: currentTemplate.id,
          name: currentTemplate.name,
          prompt_text: currentTemplate.prompt_text,
          is_active: currentTemplate.is_active,
          version: currentTemplate.version,
          created_by: user?.id,
        });

        const { error } = await supabase
          .from("ai_prompt_templates")
          .update({
            name: currentTemplate.name,
            purpose: currentTemplate.purpose,
            prompt_text: currentTemplate.prompt_text,
            is_active: currentTemplate.is_active,
            version: nextVersion,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentTemplate.id);

        if (error) throw error;
        toast.success(`Saved "${currentTemplate.name}" (v${nextVersion})`);
      }

      await loadData();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefault = () => {
    if (!isSuperAdmin || !currentTemplate) return;
    const defaultText = CANONICAL_PROMPT_DEFAULTS[currentTemplate.key];
    if (defaultText) {
      handleFieldChange("prompt_text", defaultText);
      toast.info("Restored to canonical default. Click 'Save Template' to commit.");
    }
  };

  const handleRevertVersion = (item: VersionHistory) => {
    if (!isSuperAdmin) return;
    handleFieldChange("prompt_text", item.prompt_text);
    handleFieldChange("name", item.name);
    setActiveTab("editor");
    toast.info(`Loaded prompt from version ${item.version}. Save to create a new version.`);
  };

  const handleRunSandbox = async () => {
    if (!selectedProductId || !currentTemplate) return;
    setTesting(true);
    setSandboxResult(null);
    setSandboxError("");

    try {
      const res = await sandboxFn({
        data: {
          stageKey: currentTemplate.key,
          productId: selectedProductId,
          customPrompt: currentTemplate.prompt_text,
        },
      });

      if (!res.ok) {
        setSandboxError(res.error || "Stage execution failed.");
      } else {
        setSandboxResult(res as SandboxResult);
        toast.success(`Stage "${currentTemplate.name}" evaluated in ${res.executionMs}ms`);
      }
    } catch (e: any) {
      setSandboxError(e.message ?? "An error occurred while executing the sandbox test.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="container-app py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl font-bold tracking-tight">AI Control Center</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure, version, and test the active prompt templates for Single-Pass Product Details (Engine 1) and Lifestyle Scene Generation (Engine 2).
          </p>
        </div>

        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestoreDefault}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-card hover:bg-muted transition text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Canonical Default
            </button>
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Template"}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading templates...</div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* ─────────────── SIDEBAR STAGES LIST ─────────────── */}
          <div className="lg:col-span-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 mb-2">
              Active Engines ({templates.length})
            </p>
            {templates.map((tpl) => {
              const isSelected = tpl.key === selectedKey;
              const Icon = STAGE_ICONS[tpl.key] || FileText;
              const info = STAGE_LABELS[tpl.key];

              return (
                <button
                  key={tpl.key}
                  onClick={() => handleSelectTemplate(tpl.key)}
                  className={`w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3 ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg border flex-shrink-0 ${
                      info?.color ?? "text-muted-foreground bg-muted border-border"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs truncate text-foreground">
                        {tpl.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
                        v{tpl.version}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                      {tpl.purpose}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded ${
                          tpl.is_active
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            tpl.is_active ? "bg-emerald-500" : "bg-muted-foreground"
                          }`}
                        />
                        {tpl.is_active ? "Active" : "Disabled"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 flex-shrink-0 self-center transition ${
                      isSelected ? "text-primary translate-x-0.5" : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* ─────────────── MAIN CONTENT AREA ─────────────── */}
          <div className="lg:col-span-8 bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
            {/* Template Header & Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-foreground">{currentTemplate?.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{currentTemplate?.purpose}</p>
              </div>

              {/* Tab Navigation */}
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border self-start sm:self-auto">
                <button
                  onClick={() => handleTabChange("editor")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                    activeTab === "editor"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Prompt Editor
                </button>
                <button
                  onClick={() => handleTabChange("sandbox")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${
                    activeTab === "sandbox"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Play className="h-3 w-3 text-primary" /> Test Sandbox
                </button>
                <button
                  onClick={() => handleTabChange("history")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${
                    activeTab === "history"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <History className="h-3 w-3" /> History
                </button>
              </div>
            </div>

            {/* ─────────────── PROMPT EDITOR ─────────────── */}
            {currentTemplate && activeTab === "editor" && (
              <div className="space-y-4">
                {/* Meta details & status toggle */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Template Name</label>
                    <input
                      disabled={!isSuperAdmin}
                      type="text"
                      value={currentTemplate.name}
                      onChange={(e) => handleFieldChange("name", e.target.value)}
                      className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-primary disabled:opacity-70"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Pipeline Purpose</label>
                    <input
                      disabled={!isSuperAdmin}
                      type="text"
                      value={currentTemplate.purpose}
                      onChange={(e) => handleFieldChange("purpose", e.target.value)}
                      className="mt-1 w-full text-xs bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-primary disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Pipeline Status:</span>
                    <span
                      className={`text-xs font-semibold ${
                        currentTemplate.is_active ? "text-emerald-600" : "text-muted-foreground"
                      }`}
                    >
                      {currentTemplate.is_active ? "Enabled" : "Disabled (Pass-through)"}
                    </span>
                  </div>
                  <button
                    disabled={!isSuperAdmin}
                    onClick={() => handleFieldChange("is_active", !currentTemplate.is_active)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {currentTemplate.is_active ? (
                      <ToggleRight className="h-5 w-5" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                    {currentTemplate.is_active ? "Active" : "Disabled"}
                  </button>
                </div>

                {/* Prompt text editor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Prompt Directives</h3>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {currentTemplate.prompt_text.length} chars
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This is the live prompt sent to the AI model during pipeline execution. Every save creates a new version.
                  </p>
                  <textarea
                    ref={textareaRef}
                    disabled={!isSuperAdmin}
                    rows={20}
                    value={currentTemplate.prompt_text}
                    onChange={(e) => handleFieldChange("prompt_text", e.target.value)}
                    placeholder={isSuperAdmin ? "Enter your prompt here. Use placeholders like {product_name}, {brand}, {product_intelligence}..." : "Contact a super admin to edit this prompt."}
                    className="w-full text-xs font-mono bg-background border border-border rounded-lg p-4 outline-none focus:border-primary resize-y leading-relaxed disabled:opacity-70"
                  />
                </div>

                {/* Available variables hint */}
                <div className="bg-muted/30 border border-border rounded-lg p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Available Placeholders</p>
                  <div className="flex flex-wrap gap-1">
                    {[
                      "{product_name}", "{code}", "{brand}", "{manufacturer}", "{production_name}",
                      "{category}", "{type}", "{subcategory}", "{family}",
                      "{finish}", "{material}", "{color}", "{size}", "{dimensions}",
                      "{price}", "{original_price}", "{pricing_unit}",
                      "{differentiator_type}", "{differentiator_note}",
                      "{context}", "{original_image_url}", "{generated_image_url}",
                    ].map((v) => (
                      <code key={v} className="text-[10px] bg-muted border border-border rounded px-1.5 py-0.5 text-muted-foreground font-mono">
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────── SANDBOX ─────────────── */}
            {currentTemplate && activeTab === "sandbox" && (
              <div className="space-y-5">
                {/* Product Selector */}
                <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Play className="h-4 w-4 text-primary" /> Sandbox Configuration
                  </h3>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Select Product</label>
                      <select
                        value={selectedProductId}
                        onChange={(e) => {
                          setSelectedProductId(e.target.value);
                          setSandboxResult(null);
                          setSandboxError("");
                        }}
                        className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-primary"
                      >
                        <option value="">Choose a product...</option>
                        {products.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.name} {prod.brand ? `(${prod.brand})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Stage to Test</label>
                      <div className="px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground font-medium">
                        {STAGE_LABELS[currentTemplate.key]?.label ?? currentTemplate.key}
                      </div>
                    </div>
                  </div>

                  {/* Selected Product Preview */}
                  {selectedProduct && (
                    <div className="flex items-center gap-3 border border-border rounded-lg p-3 bg-background">
                      {selectedProduct.image_url ? (
                        <img
                          src={selectedProduct.image_url}
                          alt={selectedProduct.name}
                          className="h-12 w-12 object-cover rounded border border-border flex-shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 bg-muted rounded border border-border flex-items-center justify-center flex-shrink-0">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-foreground">{selectedProduct.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {selectedProduct.brand || "Enreach Showroom"} · Code: {selectedProduct.code || "N/A"} · ₦
                          {Number(selectedProduct.price || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleRunSandbox}
                    disabled={testing || !selectedProductId}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {testing ? "Evaluating Stage..." : `Execute Sandbox: ${currentTemplate.name}`}
                  </button>
                </div>

                {/* Error Banner */}
                {sandboxError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3.5 rounded-xl flex items-start gap-2.5">
                    <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Sandbox Execution Failed</p>
                      <p className="mt-0.5">{sandboxError}</p>
                    </div>
                  </div>
                )}

                {/* Result Display */}
                {sandboxResult && (
                  <div className="space-y-4">
                    {/* Execution Meta Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 border border-border rounded-lg p-3">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Success
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {sandboxResult.executionMs}ms
                        </span>
                        <span className="text-muted-foreground">
                          Provider: <strong className="text-foreground">{sandboxResult.providerName}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Compiled Prompt */}
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Compiled Prompt (Interpolated)
                      </h4>
                      <pre className="text-[11px] font-mono bg-muted/30 border border-border rounded-lg p-3 whitespace-pre-wrap leading-relaxed text-foreground max-h-48 overflow-y-auto">
                        {sandboxResult.compiledPrompt}
                      </pre>
                    </div>

                    {/* AI Output */}
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Raw AI Output
                      </h4>
                      {sandboxResult.isImageStage ? (
                        <div className="border border-border rounded-lg p-4 bg-muted/20 text-center">
                          {sandboxResult.imageUrl ? (
                            <img
                              src={sandboxResult.imageUrl}
                              alt="Generated lifestyle scene"
                              className="max-h-72 mx-auto rounded-lg shadow-md border border-border"
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">No image URL returned.</p>
                          )}
                        </div>
                      ) : (
                        <pre className="text-[11px] font-mono bg-background border border-border rounded-lg p-3.5 whitespace-pre-wrap leading-relaxed text-foreground max-h-64 overflow-y-auto">
                          {sandboxResult.aiResponse}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─────────────── VERSION HISTORY ─────────────── */}
            {currentTemplate && activeTab === "history" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Prompt Version Audit Log</h3>
                  <span className="text-xs text-muted-foreground font-mono">
                    Current Active: v{currentTemplate.version}
                  </span>
                </div>

                {historyLoading ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    Loading version history...
                  </div>
                ) : historyLogs.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                    No previous versions found for this template. Every save from now on will be recorded.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyLogs.map((item) => (
                      <div
                        key={item.id}
                        className="border border-border rounded-xl p-4 bg-muted/20 space-y-2 hover:border-primary/40 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-foreground">
                              Version {item.version}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleRevertVersion(item)}
                              className="text-xs text-primary hover:underline font-semibold"
                            >
                              Load this version
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono line-clamp-2 bg-background p-2 rounded border border-border">
                          {item.prompt_text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
