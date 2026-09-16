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
    if (filters.q.trim()) {
      const sq = `%${filters.q}%`;
      q = q.or(`name.ilike.${sq},code.ilike.${sq},production_name.ilike.${sq}`);
    }
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const [t, c, s, f] = await Promise.all([
        supabase.from("product_types").select("id,name").order("name"),
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
    
    toast.success(`${label} applied to ${ids.length} products`, {
      action: {
        label: "Undo",
        onClick: async () => {
          if (!previous || !previous.length) return;
          try {
            await Promise.all(
              previous.map(p => 
                supabase.from("products").update({
                  status: p.status,
                  deleted_at: p.deleted_at
                } as any).eq("id", p.id)
              )
            );
            toast.success("Bulk action undone successfully");
            load();
          } catch (err: any) {
            toast.error("Failed to undo: " + err.message);
          }
        }
      }
    });

    setSelected(new Set());
    load();
  };

  const softDelete = () => bulk("Soft delete", { deleted_at: new Date().toISOString() });
  const restore = () => bulk("Restore", { deleted_at: null });

  return (
    <div className="container-app py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage catalogue items, manual details, and single-pass product intelligence.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/admin/products/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Product
          </Link>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 bg-card p-3 rounded-lg border border-border text-xs">
        <input
          type="text"
          placeholder="Search name, code…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          className="col-span-2 rounded border border-input bg-background px-2 py-1.5"
        />

        <select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, category: "", subcategory: "", family: "" }))}
          className="rounded border border-input bg-background px-2 py-1.5"
        >
          <option value="">All Types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value, subcategory: "", family: "" }))}
          className="rounded border border-input bg-background px-2 py-1.5"
        >
          <option value="">All Categories</option>
          {filteredCats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={filters.subcategory}
          onChange={(e) => setFilters((f) => ({ ...f, subcategory: e.target.value, family: "" }))}
          className="rounded border border-input bg-background px-2 py-1.5"
        >
          <option value="">All Subcategories</option>
          {filteredSubs.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={filters.family}
          onChange={(e) => setFilters((f) => ({ ...f, family: e.target.value }))}
          className="rounded border border-input bg-background px-2 py-1.5"
        >
          <option value="">All Families</option>
          {filteredFams.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="rounded border border-input bg-background px-2 py-1.5"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={filters.ai}
          onChange={(e) => setFilters((f) => ({ ...f, ai: e.target.value }))}
          className="rounded border border-input bg-background px-2 py-1.5"
        >
          <option value="">AI: Any</option>
          <option value="pending">AI: Pending</option>
          <option value="processing">AI: Processing</option>
          <option value="completed">AI: Completed</option>
          <option value="failed">AI: Failed</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded bg-primary/10 p-2 text-xs">
          <span className="font-semibold">{selected.size} selected</span>
          <button onClick={() => bulk("Publish", { status: "published" })} className="btn-sm rounded bg-primary text-primary-foreground px-2 py-1">Publish</button>
          <button onClick={() => bulk("Set Draft", { status: "draft" })} className="btn-sm rounded border bg-card px-2 py-1">Set Draft</button>
          <button onClick={() => bulk("Hide", { hidden: true })} className="btn-sm rounded border bg-card px-2 py-1">Hide</button>
          <button onClick={() => bulk("Unhide", { hidden: false })} className="btn-sm rounded border bg-card px-2 py-1">Unhide</button>
          <button onClick={softDelete} className="btn-sm rounded bg-destructive/10 text-destructive px-2 py-1">Soft Delete</button>
          {filters.includeDeleted && (
            <button onClick={restore} className="btn-sm rounded bg-emerald-600/10 text-emerald-600 px-2 py-1">Restore</button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              </th>
              <th className="p-3">Image</th>
              <th className="p-3">Code</th>
              <th className="p-3">Name</th>
              <th className="p-3">Price</th>
              <th className="p-3">Status</th>
              <th className="p-3">AI</th>
              <th className="p-3">Flags</th>
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted-foreground">Loading products…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted-foreground">No products found.</td>
              </tr>
            ) : (
              rows.map((r) => {
                const img = publicImageUrl(r.generated_studio_image) || publicImageUrl(r.image_url);
                return (
                  <tr key={r.id} className={`hover:bg-muted/30 ${r.deleted_at ? "opacity-50" : ""}`}>
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} />
                    </td>
                    <td className="p-3">
                      <div className="h-10 w-10 rounded border border-border overflow-hidden bg-muted">
                        {img ? (
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[9px] text-muted-foreground">None</div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono font-semibold">{r.code}</td>
                    <td className="p-3">
                      <div className="font-medium text-foreground">{r.name}</div>
                      {r.production_name && <div className="text-[10px] text-muted-foreground">Prod: {r.production_name}</div>}
                    </td>
                    <td className="p-3 font-mono">
                      ₦{Number(r.price).toLocaleString()}
                      {r.pricing_unit && <span className="text-[10px] text-muted-foreground ml-0.5">/{r.pricing_unit}</span>}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                        r.status === "published" ? "bg-emerald-500/10 text-emerald-500" :
                        r.status === "review" ? "bg-amber-500/10 text-amber-500" :
                        r.status === "archived" ? "bg-muted text-muted-foreground" :
                        "bg-zinc-500/10 text-zinc-500"
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                        r.ai_status === "completed" ? "bg-primary/10 text-primary" :
                        r.ai_status === "processing" ? "bg-blue-500/10 text-blue-500" :
                        r.ai_status === "failed" ? "bg-destructive/10 text-destructive" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {r.ai_status || "pending"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 text-[10px]">
                        {r.featured_homepage && <span className="bg-primary/10 text-primary px-1 rounded">Home</span>}
                        {r.featured_feed && <span className="bg-primary/10 text-primary px-1 rounded">Feed</span>}
                        {r.hidden && <span className="bg-destructive/10 text-destructive px-1 rounded">Hidden</span>}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-right">
                      <Link
                        to="/admin/products/$id"
                        params={{ id: r.id }}
                        className="rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
