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
      await fetchUserRole();
      const [prodRes, promptsRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, brand, image_url, processing_state")
          .not("image_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("ai_prompt_templates").select("*").order("key"),
      ]);

      const allPrompts = promptsRes.data ?? [];
      const firstRow = allPrompts[0] || null;

      // Map to canonical STAGE_ORDER
      const rawMap: Record<string, any> = {};
      allPrompts.forEach((p: any) => {
        if (p.key) rawMap[p.key] = p;
      });

      const merged: PromptTemplate[] = STAGE_ORDER.map((key) => {
        const p = rawMap[key] || firstRow;
        const rawText = key === "product_details"
          ? (p?.prompt_text || p?.description_prompt)
          : (p?.prompt_text || p?.installed_prompt);

        const isLegacy = key === "product_details"
          ? (!rawText || !rawText.includes("JSON SCHEMA") || !rawText.includes("generated_description"))
          : false;

        const promptText = (key === "product_details" && isLegacy)
          ? CANONICAL_PROMPT_DEFAULTS.product_details
          : (rawText || CANONICAL_PROMPT_DEFAULTS[key] || "");

        return {
          id: p?.id ?? key,
          key,
          name: p?.name ?? STAGE_LABELS[key]?.label ?? key,
          purpose: p?.purpose ?? STAGE_LABELS[key]?.description ?? "",
          prompt_text: promptText,
          is_active: p?.is_active ?? true,
          version: p?.version ?? 1,
          updated_at: p?.updated_at,
        };
      });

      setTemplates(merged);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load AI Control Center");
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (templateId: string) => {
    if (!templateId || templateId === selectedKey) {
      setHistoryLogs([]);
    }
    const tmpl = templates.find((t) => t.key === selectedKey);
    if (!tmpl?.id || tmpl.id === tmpl.key) {
      setHistoryLogs([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_prompt_templates_history" as any)
        .select("*")
        .eq("template_id", tmpl.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setHistoryLogs((data as any[]) ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load version history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const currentTemplate = templates.find((t) => t.key === selectedKey);

  useEffect(() => {
    if (activeTab === "history" && currentTemplate?.id) {
      void loadHistory(currentTemplate.id);
    }
  }, [selectedKey, activeTab, currentTemplate?.id]);

  const handleFieldChange = (field: keyof PromptTemplate, value: any) => {
    setTemplates((prev) =>
      prev.map((t) => (t.key === selectedKey ? { ...t, [field]: value } : t))
    );
  };

  const handleResetToDefault = () => {
    if (!currentTemplate) return;
    const defaultPrompt = CANONICAL_PROMPT_DEFAULTS[currentTemplate.key] || "";
    handleFieldChange("prompt_text", defaultPrompt);
    toast.info("Prompt reset to canonical JSON default. Click 'Save Template' to commit changes.");
  };

  const handleSave = async () => {
    if (!isSuperAdmin) return toast.error("Access Denied: Only admins can save prompt templates.");
    const current = templates.find((t) => t.key === selectedKey);
    if (!current) return;

    setSaving(true);
    try {
      if (current.key === "product_details") {
        const { error } = await supabase
          .from("ai_prompt_templates")
          .update({
            description_prompt: current.prompt_text,
            updated_at: new Date().toISOString(),
          } as any)
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) throw error;
      } else if (current.key === "lifestyle") {
        const { error } = await supabase
          .from("ai_prompt_templates")
          .update({
            installed_prompt: current.prompt_text,
            updated_at: new Date().toISOString(),
          } as any)
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) throw error;
      }

      toast.success(`✓ ${current.name} saved successfully`);
      void loadData();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (version: VersionHistory) => {
    if (!isSuperAdmin) return toast.error("Only admins can restore templates.");
    if (!confirm(`Restore template to version v${version.version}? This will become the active prompt.`)) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("ai_prompt_templates")
        .update({
          name: version.name,
          prompt_text: version.prompt_text,
          is_active: version.is_active,
          updated_by: user?.id,
        } as any)
        .eq("id", version.template_id);

      if (error) throw error;
      toast.success(`✓ Restored to version v${version.version}`);
      void loadData();
      setActiveTab("editor");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to restore version");
    } finally {
      setSaving(false);
    }
  };

  const runSandbox = async () => {
    if (!selectedProductId || !currentTemplate) return;
    setTesting(true);
    setSandboxResult(null);
    setSandboxError("");
    try {
      const res = await sandboxFn({
        data: { productId: selectedProductId, stageKey: currentTemplate.key },
      });
      if (res.ok) {
        const result = res as any;
        // Try to parse validation result if quality stage
        let validationResult: any = null;
        if (currentTemplate.key === "quality" && result.aiResponse) {
          try {
            const m = result.aiResponse.match(/\{[\s\S]*\}/);
            if (m) validationResult = JSON.parse(m[0]);
          } catch {}
        }
        setSandboxResult({ ...result, validationResult });
      } else {
        setSandboxError((res as any).error ?? "Sandbox execution failed");
      }
    } catch (e: any) {
      setSandboxError(e.message ?? "Unexpected error running sandbox");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">Loading AI Pipeline Control Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              AI Pipeline Control Center
            </h1>
            <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
              BUILD 4D UNIFIED
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Universal AI Operating System — six stages, one intelligence pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isSuperAdmin && (
            <span className="text-xs border border-amber-500/20 bg-amber-500/10 text-amber-600 rounded px-2.5 py-1 font-medium">
              Read-Only View
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !isSuperAdmin || !currentTemplate}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        {/* Stage Selector Sidebar */}
        <aside className="space-y-1">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-2 mb-3">
            Pipeline Stages
          </h2>
          {STAGE_ORDER.map((key, idx) => {
            const tmpl = templates.find((t) => t.key === key);
            const StageIcon = STAGE_ICONS[key] ?? Brain;
            const isSelected = selectedKey === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setSelectedKey(key);
                  setSandboxResult(null);
                  setSandboxError("");
                }}
                className={`w-full text-left rounded-lg px-3 py-2.5 text-xs font-medium transition flex items-center gap-2.5 cursor-pointer group ${
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "border border-transparent hover:bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={`flex-shrink-0 flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${
                  isSelected ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30" : "bg-muted border-border text-muted-foreground"
                }`}>
                  {idx + 1}
                </span>
                <StageIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{STAGE_LABELS[key]?.label ?? key}</span>
                <span className={`ml-auto text-[10px] rounded px-1 py-0.5 flex-shrink-0 ${
                  isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  v{tmpl?.version ?? 1}
                </span>
              </button>
            );
          })}

          <div className="pt-4 border-t border-border mt-4 px-2 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">Architectural Directives</p>
            <div className="text-[10px] text-muted-foreground space-y-1 leading-relaxed">
              <p>• <strong>Engine 1</strong>: Single-pass structured product details.</p>
              <p>• <strong>Engine 2</strong>: Isolated lifestyle rendering.</p>
              <p>• <strong>Schema</strong>: 100% database & SEO synced.</p>
            </div>
          </div>
        </aside>

        {/* Main Content Workspace */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Stage Header Banner */}
          {currentTemplate && (
            <div className="p-6 border-b border-border bg-muted/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${STAGE_LABELS[currentTemplate.key]?.color ?? "text-muted-foreground"}`}>
                      Stage {STAGE_ORDER.indexOf(currentTemplate.key) + 1}
                    </span>
                    <h2 className="font-display text-base font-bold text-foreground">
                      {currentTemplate.name}
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-2xl">
                    {currentTemplate.purpose}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-muted-foreground block">
                      Version v{currentTemplate.version}
                    </span>
                    {currentTemplate.updated_at && (
                      <span className="text-[10px] text-muted-foreground block">
                        Updated {new Date(currentTemplate.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex border-b border-border px-6 bg-muted/10 gap-2">
            {(["editor", "sandbox", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-3 text-xs font-medium border-b-2 transition -mb-px capitalize cursor-pointer ${
                  activeTab === tab
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "history" ? `Version History (${historyLogs.length})` : tab === "sandbox" ? "Sandbox Test" : "Prompt Editor"}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* ─────────────── PROMPT EDITOR ─────────────── */}
            {currentTemplate && activeTab === "editor" && (
              <div className="space-y-5">
                {/* Active toggle */}
                <div className="flex items-center justify-between bg-muted/40 border border-border rounded-lg px-4 py-3">
                  <div>
                    <p className="text-xs font-medium">Template Active Status</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Inactive templates are skipped by the pipeline.
                    </p>
                  </div>
                  <button
                    disabled={!isSuperAdmin}
                    onClick={() => handleFieldChange("is_active", !currentTemplate.is_active)}
                    className={`inline-flex items-center text-xs font-bold gap-1 transition cursor-pointer ${
                      currentTemplate.is_active ? "text-emerald-600" : "text-red-500"
                    } disabled:opacity-60`}
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
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold">Prompt Directives</h3>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={handleResetToDefault}
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset to Canonical Default
                        </button>
                      )}
                    </div>
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
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold">Test with Real Product</p>
                      <p className="text-[11px] text-muted-foreground">
                        Select an existing showroom product to run this stage in isolated sandbox mode.
                      </p>
                    </div>
                    <button
                      onClick={runSandbox}
                      disabled={testing || !selectedProductId}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      <Play className="h-3 w-3" />
                      {testing ? "Executing Sandbox..." : "Run Sandbox Test"}
                    </button>
                  </div>

                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full text-xs rounded-md bg-background border border-border p-2.5 font-medium outline-none focus:border-primary"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.brand ? `(${p.brand})` : ""} — {p.processing_state}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Error Banner */}
                {sandboxError && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-600 text-xs">
                    <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Sandbox Execution Error</p>
                      <p className="text-[11px] mt-0.5 font-mono">{sandboxError}</p>
                    </div>
                  </div>
                )}

                {/* Sandbox Results */}
                {sandboxResult && (
                  <div className="space-y-4">
                    {/* Metrics Bar */}
                    <div className="flex flex-wrap items-center gap-4 bg-muted/40 border border-border rounded-lg px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        Execution Successful
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {sandboxResult.executionMs}ms
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground font-mono">
                        Provider: {sandboxResult.providerName}
                      </div>
                    </div>

                    {/* Compiled Prompt */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Compiled Prompt (Placeholders Injected)
                      </p>
                      <pre className="text-[11px] font-mono bg-muted/30 border border-border rounded-lg p-3 whitespace-pre-wrap overflow-x-auto max-h-48 text-foreground/80 leading-relaxed">
                        {sandboxResult.compiledPrompt}
                      </pre>
                    </div>

                    {/* AI Response */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        AI Model Output
                      </p>
                      {sandboxResult.isImageStage && sandboxResult.imageUrl ? (
                        <div className="space-y-2">
                          <div className="aspect-square max-w-sm rounded-lg border border-border overflow-hidden bg-background">
                            <img
                              src={sandboxResult.imageUrl}
                              alt="Generated Sandbox Result"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground truncate">
                            {sandboxResult.imageUrl}
                          </p>
                        </div>
                      ) : (
                        <pre className="text-[11px] font-mono bg-background border border-border rounded-lg p-4 whitespace-pre-wrap overflow-x-auto max-h-96 text-foreground leading-relaxed">
                          {sandboxResult.aiResponse}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─────────────── HISTORY ─────────────── */}
            {currentTemplate && activeTab === "history" && (
              <div className="space-y-4">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : historyLogs.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-xs">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No version history recorded yet. Edits made from now on will appear here.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-lg border border-border bg-card p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold bg-muted px-2 py-0.5 rounded">
                              v{log.version}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleRestore(log)}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-semibold cursor-pointer"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Restore this version
                            </button>
                          )}
                        </div>
                        <pre className="text-[10px] font-mono bg-muted/30 border border-border rounded p-2.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                          {log.prompt_text}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
