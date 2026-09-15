import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { publicImageUrl } from "@/components/ImageUploader";

export const Route = createFileRoute("/_authenticated/admin/products")({
  component: ProductsLayout,
});

function ProductsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Nested routes (new / $id) render their own page
  if (pathname !== "/admin/products") return <Outlet />;
  return <ProductLibrary />;
}

type Row = {
  id: string;
  code: string;
  name: string;
  production_name: string | null;
  finish_name: string | null;
  price: number;
  original_price?: number | null;
  pricing_unit?: string | null;
  status: string;
  featured_homepage: boolean;
  featured_feed: boolean;
  hidden: boolean;
  ai_status: string;
  created_at: string;
  image_url: string | null;
  generated_studio_image: string | null;
  type_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  family_id: string | null;
  deleted_at: string | null;
};

const STATUSES = ["draft", "review", "published", "archived"] as const;

function ProductLibrary() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string; type_id: string }[]>([]);
  const [subs, setSubs] = useState<{ id: string; name: string; category_id: string }[]>([]);
  const [fams, setFams] = useState<{ id: string; name: string; subcategory_id: string }[]>([]);

  const [filters, setFilters] = useState({
    type: "",
    category: "",
    subcategory: "",
    family: "",
    status: "",
    featured: "",
    hidden: "",
    ai: "",
    includeDeleted: false,
    q: "",
  });

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("products")
      .select(
        "id,code,name,production_name,finish_name,price,status,featured_homepage,featured_feed,hidden,ai_status,created_at,image_url,generated_studio_image,type_id,category_id,subcategory_id,family_id,deleted_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (!filters.includeDeleted) q = q.is("deleted_at", null);
    if (filters.type) q = q.eq("type_id", filters.type);
    if (filters.category) q = q.eq("category_id", filters.category);
    if (filters.subcategory) q = q.eq("subcategory_id", filters.subcategory);
    if (filters.family) q = q.eq("family_id", filters.family);
    if (filters.status) q = q.eq("status", filters.status as any);
    if (filters.ai) q = q.eq("ai_status", filters.ai as any);
    if (filters.hidden === "yes") q = q.eq("hidden", true);
    if (filters.hidden === "no") q = q.eq("hidden", false);
    if (filters.featured === "home") q = q.eq("featured_homepage", true);
    if (filters.featured === "feed") q = q.eq("featured_feed", true);
    if (filters.q.trim())
      q = q.or(`name.ilike.%${filters.q}%,code.ilike.%${filters.q}%,production_name.ilike.%${filters.q}%`);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const [t, c, s, f] = await Promise.all([\n        supabase.from("product_types").select("id,name").order("name"),
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const filteredCats = useMemo(
    () => (filters.type ? cats.filter((c) => c.type_id === filters.type) : cats),
    [filters.type, cats],
  );
  const filteredSubs = useMemo(
    () => (filters.category ? subs.filter((s) => s.category_id === filters.category) : subs),
    [filters.category, subs],
  );
  const filteredFams = useMemo(
    () => (filters.subcategory ? fams.filter((f) => f.subcategory_id === filters.subcategory) : fams),
    [filters.subcategory, fams],
  );

  const toggleSel = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const bulk = async (label: string, patch: Record<string, any>) => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    
    // Fetch previous states for Undo
    const { data: previous } = await supabase.from("products").select("id, status, deleted_at").in("id", ids);

    const { error } = await supabase.from("products").update(patch as any).in("id", ids);
    if (error) return toast.error(error.message);
    
    toast.success(`${label}: ${ids.length} product(s)`, {
      action: {
        label: "Undo",
        onClick: async () => {
          for (const prev of previous || []) {
            await supabase.from("products").update({
              status: prev.status,
              deleted_at: prev.deleted_at
            } as any).eq("id", prev.id);
          }
          toast.success("Bulk actions undone!");
          load();
        }
      }
    });
    setSelected(new Set());
    load();
  };

  const bulkDeleteHard = async () => {
    if (!selected.size) return;
    if (!confirm(`Permanently delete ${selected.size} product(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("products").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
    load();
  };

  const rowAction = async (id: string, label: string, patch: Record<string, any>) => {
    // Fetch previous state for Undo
    const { data: prev } = await supabase.from("products").select("status, deleted_at").eq("id", id).single();

    const { error } = await supabase.from("products").update(patch as any).eq("id", id);
    if (error) return toast.error(error.message);
    
    toast.success(label, {
      description: "You can undo this action if needed.",
      action: {
        label: "Undo",
        onClick: async () => {
          await supabase.from("products").update({
            status: prev?.status,
            deleted_at: prev?.deleted_at
          } as any).eq("id", id);
          toast.success("Action undone!");
          load();
        }
      }
    });
    load();
  };

  const confirmPublish = (id: string, name: string) => {
    toast(`Publish "${name}"?`, {
      description: "This will make it instantly live on the showroom storefront.",
      action: {
        label: "Publish",
        onClick: () => rowAction(id, "Published", { status: "published" })
      }
    });
  };

  const duplicate = async (id: string) => {
    const { data } = await supabase.from("products").select("*").eq("id", id).single();
    if (!data) return;
    const { id: _id, code: _c, slug: _s, created_at: _ca, updated_at: _ua, similar_product_ids: _sim, ...rest } =
      data as any;
    const copy = {
      ...rest,
      name: `${rest.name} (Copy)`,
      slug: `${rest.slug}-copy-${Math.random().toString(36).slice(2, 6)}`,
      status: "draft",
    };
    const { data: ins, error } = await supabase.from("products").insert(copy as any).select("id").single();
    if (error) return toast.error(error.message);
    toast.success("Duplicated");
    if (ins?.id) navigate({ to: "/admin/products/$id", params: { id: ins.id } });
  };

  return (
    <div className="container-app py-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Product Library</h1>
          <p className="text-sm text-muted-foreground">
            Master command center — {rows.length} product(s).
          </p>
        </div>
        <Link
          to="/admin/products/new"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New Product
        </Link>
      </div>

      {/* Filters */}
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-4 lg:grid-cols-5">
        <input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Search name / code…"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <Sel value={filters.type} onChange={(v) => setFilters({ ...filters, type: v, category: "", subcategory: "", family: "" })} label="Type" options={types} />
        <Sel value={filters.category} onChange={(v) => setFilters({ ...filters, category: v, subcategory: "", family: "" })} label="Category" options={filteredCats} />
        <Sel value={filters.subcategory} onChange={(v) => setFilters({ ...filters, subcategory: v, family: "" })} label="Subcategory" options={filteredSubs} />
        <Sel value={filters.family} onChange={(v) => setFilters({ ...filters, family: v })} label="Family" options={filteredFams} />
        <Sel value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} label="Status" options={STATUSES.map((s) => ({ id: s, name: s }))} />
        <Sel value={filters.featured} onChange={(v) => setFilters({ ...filters, featured: v })} label="Featured" options={[{ id: "home", name: "Homepage" }, { id: "feed", name: "Feed" }]} />
        <Sel value={filters.hidden} onChange={(v) => setFilters({ ...filters, hidden: v })} label="Hidden" options={[{ id: "yes", name: "Hidden" }, { id: "no", name: "Visible" }]} />
        <Sel value={filters.ai} onChange={(v) => setFilters({ ...filters, ai: v })} label="AI Status" options={["idle", "queued", "processing", "ready", "failed"].map((s) => ({ id: s, name: s }))} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={filters.includeDeleted} onChange={(e) => setFilters({ ...filters, includeDeleted: e.target.checked })} />
          Show soft-deleted
        </label>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Btn onClick={() => bulk("Published", { status: "published" })}>Publish</Btn>
          <Btn onClick={() => bulk("Archived", { status: "archived" })}>Archive</Btn>
          <Btn onClick={() => bulk("Featured on Homepage", { featured_homepage: true })}>Feature Home</Btn>
          <Btn onClick={() => bulk("Featured on Feed", { featured_feed: true })}>Feature Feed</Btn>
          <Btn onClick={() => bulk("Un-featured", { featured_homepage: false, featured_feed: false })}>Un-feature</Btn>
          <Btn onClick={() => bulk("Hidden", { hidden: true })}>Hide</Btn>
          <Btn onClick={() => bulk("Unhidden", { hidden: false })}>Unhide</Btn>
          <Btn onClick={() => bulk("AI Regenerate queued", { ai_status: "queued", is_ai_processing: true })}>Regenerate AI</Btn>
          <Btn onClick={() => bulk("Soft-deleted", { deleted_at: new Date().toISOString() })}>Soft Delete</Btn>
          <Btn onClick={() => bulk("Restored", { deleted_at: null })}>Restore</Btn>
          <Btn onClick={bulkDeleteHard} variant="destructive">Permanent Delete</Btn>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-xs">
          <thead className="border-b border-border bg-muted/30 text-left uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-2"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              <th className="p-2">Image</th>
              <th className="p-2">Code</th>
              <th className="p-2">Name</th>
              <th className="p-2">Production</th>
              <th className="p-2">Finish</th>
              <th className="p-2">Hierarchy</th>
              <th className="p-2">Price</th>
              <th className="p-2">Status</th>
              <th className="p-2">Flags</th>
              <th className="p-2">AI</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={13} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">No products match these filters.</td></tr>
            )}
            {rows.map((r) => {
              const type = types.find((x) => x.id === r.type_id)?.name ?? "—";
              const cat = cats.find((x) => x.id === r.category_id)?.name ?? "—";
              const sub = subs.find((x) => x.id === r.subcategory_id)?.name ?? "—";
              const fam = fams.find((x) => x.id === r.family_id)?.name ?? "—";
              const img = publicImageUrl(r.generated_studio_image) || publicImageUrl(r.image_url);
              return (
                <tr key={r.id} className={r.deleted_at ? "opacity-50" : ""}>
                  <td className="p-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                  <td className="p-2">
                    {img ? (
                      <img src={img} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted" />
                    )}
                  </td>
                  <td className="p-2 font-mono">{r.code}</td>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 text-muted-foreground">{r.production_name ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{r.finish_name ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{type} › {cat} › {sub} › {fam}</td>
                  <td className="p-2">
                    <div className="flex flex-col">
                      {r.original_price != null && Number(r.original_price) > Number(r.price) && (
                        <span className="line-through text-[10px] text-destructive">
                          ₦{Number(r.original_price).toLocaleString()}
                        </span>
                      )}
                      <span className="font-semibold text-foreground">
                        ₦{Number(r.price).toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">/{r.pricing_unit || "sqm"}</span>
                      </span>
                    </div>
                  </td>
                  <td className="p-2"><Badge>{r.status}</Badge></td>
                  <td className="p-2 space-x-1">
                    {r.featured_homepage && <Badge tone="accent">Home</Badge>}
                    {r.featured_feed && <Badge tone="accent">Feed</Badge>}
                    {r.hidden && <Badge tone="muted">Hidden</Badge>}
                    {r.deleted_at && <Badge tone="destructive">Deleted</Badge>}
                  </td>
                  <td className="p-2"><Badge tone="muted">{r.ai_status}</Badge></td>
                  <td className="p-2 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <Link to="/admin/products/$id" params={{ id: r.id }} className="rounded border border-border px-1.5 py-0.5 hover:border-primary">Edit</Link>
                      <button onClick={() => duplicate(r.id)} className="rounded border border-border px-1.5 py-0.5 hover:border-primary">Duplicate</button>
                      <button onClick={() => confirmPublish(r.id, r.name)} className="rounded border border-border px-1.5 py-0.5 hover:border-primary">Publish</button>
                      <button onClick={() => rowAction(r.id, "Archived", { status: "archived" })} className="rounded border border-border px-1.5 py-0.5 hover:border-primary">Archive</button>
                      <button onClick={() => rowAction(r.id, "AI queued", { ai_status: "queued", is_ai_processing: true })} className="rounded border border-border px-1.5 py-0.5 hover:border-primary">Regen AI</button>
                      {r.deleted_at ? (\n                        <button onClick={() => rowAction(r.id, "Restored", { deleted_at: null })} className="rounded border border-border px-1.5 py-0.5 hover:border-primary">Restore</button>
                      ) : (
                        <button onClick={() => rowAction(r.id, "Soft deleted", { deleted_at: new Date().toISOString() })} className="rounded border border-border px-1.5 py-0.5 text-amber-600 hover:border-amber-600">Soft Del</button>
                      )}
                      <button
                        onClick={async () => {
                          if (!confirm("Permanently delete?")) return;
                          const { error } = await supabase.from("products").delete().eq("id", r.id);
                          if (error) return toast.error(error.message);
                          toast.success("Deleted");
                          load();
                        }}
                        className="rounded border border-destructive/40 px-1.5 py-0.5 text-destructive hover:bg-destructive/10"
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sel({
  value, onChange, label, options,
}: { value: string; onChange: (v: string) => void; label: string; options: { id: string; name: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
    >
      <option value="">All {label}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

function Btn({ onClick, children, variant }: { onClick: () => void; children: React.ReactNode; variant?: "destructive" }) {
  const base = "rounded-md px-2 py-1 font-medium transition";
  const tone = variant === "destructive"
    ? "border border-destructive/40 text-destructive hover:bg-destructive/10"
    : "border border-border bg-background hover:border-primary";
  return <button onClick={onClick} className={`${base} ${tone}`}>{children}</button>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "muted" | "accent" | "destructive" }) {
  const map: Record<string, string> = {
    muted: "border-border bg-muted text-muted-foreground",
    accent: "border-accent/40 bg-accent/10 text-accent",
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  const cls = map[tone ?? ""] ?? "border-primary/30 bg-primary/10 text-primary";
  return <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>{children}</span>;
}
