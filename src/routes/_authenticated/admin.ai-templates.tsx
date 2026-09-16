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
  product_details: `Analyze the product details and image:
Product Name: {product_name}
Code: {code}
Brand: {brand}
Production Name: {production_name}
Finish: {finish}
Material: {material}
Color: {color}
Size: {size}
Price: {price}
Original Price: {original_price}
Pricing Unit: {pricing_unit}
Differentiator Type: {differentiator_type}
Differentiator Note: {differentiator_note}
Type: {type}
Category: {category}
Subcategory: {subcategory}
Family Group: {family}

Output strict JSON with ONLY these keys:
- generated_description (rich, elegant customer-facing showroom product narrative)
- seo_title (compelling search engine title under 60 chars)
- seo_description (concise search engine snippet under 160 chars, distinct from product description)
- seo_keywords (array of high-intent search terms)
- canonical_slug (url-friendly slug suggestion)
- applications (array of 2 to 4 product-specific application strings e.g. ["Master Bathroom Walls", "Luxury Kitchen Islands", "High-Traffic Commercial Flooring"])
- application_summary (short, 1-2 sentence product-specific application context explaining where and why this material excels)
- faq (array of 0-2 product-specific {question, answer} objects)
- structured_data (valid JSON-LD Product schema object)
- search_keywords (array of search terms)
- alternative_terms (array of alternative product names)
- related_terms (array of complementary terms)
- synonyms (array of synonyms)
- misspellings (array of common customer typos)`,
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

      const allProds = prodRes.data ?? [];
      setProducts(allProds);
      if (allProds[0]?.id) setSelectedProductId(allProds[0].id);

      // Map to canonical STAGE_ORDER
      const rawMap: Record<string, any> = {};
      (promptsRes.data ?? []).forEach((p: any) => {
        if (p.key) rawMap[p.key] = p;
      });

      const merged: PromptTemplate[] = STAGE_ORDER.map((key) => {
        const p = rawMap[key];
        return {
          id: p?.id ?? key,
          key,
          name: p?.name ?? STAGE_LABELS[key]?.label ?? key,
          purpose: p?.purpose ?? STAGE_LABELS[key]?.description ?? "",
          prompt_text: p?.prompt_text || p?.description_prompt || CANONICAL_PROMPT_DEFAULTS[key] || "",
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

  const handleSave = async () => {
    if (!isSuperAdmin) return toast.error("Access Denied: Only admins can save prompt templates.");
    const current = templates.find((t) => t.key === selectedKey);
    if (!current) return;

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: current.name,
        purpose: current.purpose,
        prompt_text: current.prompt_text,
        description_prompt: current.prompt_text,
        is_active: current.is_active,
        updated_by: user?.id,
      };

      const { error } = await supabase
        .from("ai_prompt_templates")
        .update(payload as any)
        .eq("id", current.id);
      if (error) throw error;

      toast.success(`✓ ${current.name} saved — version incremented`);
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
          description_prompt: version.prompt_text,
          is_active: version.is_active,
          version: (currentTemplate?.version ?? 1) + 1,
          updated_by: user?.id,
        } as any)
        .eq("id", version.template_id);
      if (error) throw error;

      toast.success(`Restored to v${version.version}`);
      setActiveTab("editor");
      void loadData();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to restore template");
    } finally {
      setSaving(false);
    }
  };

  const handleRunSandbox = async () => {
    if (!selectedProductId) return toast.error("Please select a product for testing.");
    const current = templates.find((t) => t.key === selectedKey);
    if (!current) return;

    setTesting(true);
    setSandboxResult(null);
    setSandboxError("");

    try {
      const res = await sandboxFn({
        data: {
          productId: selectedProductId,
          stageKey: selectedKey,
          promptOverride: current.prompt_text,
        },
      });

      if (res.ok && res.data) {
        setSandboxResult(res.data);
        toast.success(`Sandbox executed successfully in ${res.data.executionMs}ms`);
      } else {
        setSandboxError(res.error ?? "Sandbox execution failed");
        toast.error("Sandbox test failed");
      }
    } catch (e: any) {
      setSandboxError(e.message ?? "Failed to execute sandbox");
      toast.error(e.message ?? "Sandbox error");
    } finally {
      setTesting(false);
    }
  };

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const next = text.substring(0, start) + variable + text.substring(end);
    handleFieldChange("prompt_text", next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 50);
  };

  const variables = [
    { label: "Product Name", tag: "{product_name}" },
    { label: "Product Code", tag: "{code}" },
    { label: "Brand", tag: "{brand}" },
    { label: "Finish", tag: "{finish}" },
    { label: "Material", tag: "{material}" },
    { label: "Color", tag: "{color}" },
    { label: "Size", tag: "{size}" },
    { label: "Price", tag: "{price}" },
    { label: "Original Price", tag: "{original_price}" },
    { label: "Pricing Unit", tag: "{pricing_unit}" },
    { label: "Differentiator Type", tag: "{differentiator_type}" },
    { label: "Differentiator Note", tag: "{differentiator_note}" },
    { label: "Category", tag: "{category}" },
    { label: "Subcategory", tag: "{subcategory}" },
    { label: "Type", tag: "{type}" },
    { label: "Family", tag: "{family}" },
    { label: "Installation Context", tag: "{context}" },
  ];

  if (loading) {
    return (
      <div className="container-app py-12 text-center text-xs text-muted-foreground font-mono">
        Loading AI Control Center…
      </div>
    );
  }

  return (
    <div className="container-app py-6 max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground uppercase flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> AI Control Center
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Single-Pass Product Intelligence (Engine 1) & Lifestyle Image (Engine 2) Prompts
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Template"}
            </button>
          </div>
        )}
      </div>

      {/* Stage Selector Pills */}
      <div className="grid grid-cols-2 gap-3">
        {STAGE_ORDER.map((key) => {
          const tmpl = templates.find((t) => t.key === key);
          const meta = STAGE_LABELS[key];
          const Icon = STAGE_ICONS[key] || FileText;
          const isSelected = selectedKey === key;
          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className={`p-2 rounded-lg border ${meta.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-bold uppercase text-foreground">{meta.label}</h3>
                  <span className="text-[10px] font-mono text-muted-foreground">v{tmpl?.version ?? 1}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{meta.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Workspace Tabs */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("editor")}
              className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
                activeTab === "editor"
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Prompt Editor
            </button>
            <button
              onClick={() => setActiveTab("sandbox")}
              className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
                activeTab === "sandbox"
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Live Sandbox Test
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
                activeTab === "history"
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Version History
            </button>
          </div>
        </div>

        {/* Tab 1: Editor */}
        {activeTab === "editor" && currentTemplate && (
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                  {STAGE_LABELS[selectedKey]?.label || currentTemplate.name}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{STAGE_LABELS[selectedKey]?.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">Stage Key: {currentTemplate.key}</span>
              </div>
            </div>

            {/* Variable Insertion Pills */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Available Product Variables</label>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVariable(v.tag)}
                    className="rounded bg-muted px-2 py-1 text-[10px] font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
                  >
                    + {v.label} ({v.tag})
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea Editor */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prompt Template Text</label>
              <textarea
                ref={textareaRef}
                rows={18}
                value={currentTemplate.prompt_text}
                onChange={(e) => handleFieldChange("prompt_text", e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background p-4 text-xs font-mono leading-relaxed resize-y"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Sandbox */}
        {activeTab === "sandbox" && (
          <div className="p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 items-end">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Select Test Product</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.brand || "Enreach"})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleRunSandbox}
                disabled={testing || !selectedProductId}
                className="flex items-center justify-center gap-2 rounded bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/95 transition shadow-sm disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> {testing ? "Executing AI Sandbox…" : "Run Test Sandbox"}
              </button>
            </div>

            {sandboxError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                {sandboxError}
              </div>
            )}

            {sandboxResult && (
              <div className="space-y-4 pt-2">
                <div className="rounded-lg border border-border bg-background p-3 text-xs flex items-center justify-between font-mono">
                  <span>Provider: {sandboxResult.providerName}</span>
                  <span>Execution: {sandboxResult.executionMs}ms</span>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase text-foreground mb-1">AI Output Response</h3>
                  <pre className="rounded-lg border border-border bg-muted/30 p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96">
                    {sandboxResult.aiResponse}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: History */}
        {activeTab === "history" && (
          <div className="p-5 space-y-3">
            {historyLoading ? (
              <div className="text-xs text-muted-foreground font-mono py-6 text-center">Loading version history…</div>
            ) : historyLogs.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-6 text-center">No version history records found yet for this template.</div>
            ) : (
              <div className="space-y-2.5">
                {historyLogs.map((h) => (
                  <div key={h.id} className="rounded-lg border border-border bg-background p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground font-mono">Version v{h.version}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1 font-mono">{h.prompt_text}</p>
                    </div>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleRestore(h)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-border bg-muted/60 text-[10px] font-bold uppercase text-foreground hover:bg-muted transition"
                      >
                        <RotateCcw className="h-3 w-3" /> Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
