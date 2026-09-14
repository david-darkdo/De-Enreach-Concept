import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { publicImageUrl } from "@/components/ImageUploader";
import { generateDeterministicProductSlug } from "@/lib/slug";

export const Route = createFileRoute("/_authenticated/admin/products")({
  component: ProductsLayout,
});

function ProductsLayout() {
  const routerState = useRouterState();
  const isExact = routerState.location.pathname === "/admin/products";

  return (
    <div>
      <Outlet />
      {isExact && <ProductsIndexView />}
    </div>
  );
}

type ProductRow = {
  id: string;
  code: string | null;
  name: string;
  production_name: string | null;
  finish_name: string | null;
  type_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  family_id: string | null;
  price: number;
  status: string;
  processing_state: string | null;
  featured_homepage: boolean;
  featured_feed: boolean;
  hidden: boolean;
  ai_status: string | null;
  image_url: string | null;
  generated_studio_image: string | null;
  deleted_at: string | null;
  created_at: string;
};

type Option = { id: string; name: string };

function ProductsIndexView() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Taxonomy for filters
  const [types, setTypes] = useState<Option[]>([]);
  const [cats, setCats] = useState<Option[]>([]);
  const [subs, setSubs] = useState<Option[]>([]);
  const [fams, setFams] = useState<Option[]>([]);

  // Filter state
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("");
  const [catId, setCatId] = useState("");
  const [subId, setSubId] = useState("");
  const [famId, setFamId] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [flagFilter, setFlagFilter] = useState<string>(""); // featured_home, featured_feed, hidden, deleted

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadTaxonomy = async () => {
    const [t, c, s, f] = await Promise.all([
      supabase.from("product_types").select("id, name").order("name"),
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("subcategories").select("id, name").order("name"),
      supabase.from("family_groups").select("id, name").order("name"),
    ]);
    setTypes(t.data ?? []);
    setCats(c.data ?? []);
    setSubs(s.data ?? []);
    setFams(f.data ?? []);
  };

  const load = async () => {
    setLoading(true);
    let q = supabase.from("products").select("*").order("created_at", { ascending: false });

    if (typeId) q = q.eq("type_id", typeId);
    if (catId) q = q.eq("category_id", catId);
    if (subId) q = q.eq("subcategory_id", subId);
    if (famId) q = q.eq("family_id", famId);
    if (statusFilter) q = q.eq("status", statusFilter as any);

    if (flagFilter === "featured_home") q = q.eq("featured_homepage", true);
    if (flagFilter === "featured_feed") q = q.eq("featured_feed", true);
    if (flagFilter === "hidden") q = q.eq("hidden", true);
    if (flagFilter === "deleted") q = q.not("deleted_at", "is", null);

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      q = q.or(`name.ilike.${term},code.ilike.${term},production_name.ilike.${term},finish_name.ilike.${term}`);
    }

    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data as ProductRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTaxonomy();
  }, []);

  useEffect(() => {
    load();
  }, [typeId, catId, subId, famId, statusFilter, flagFilter, search]);

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = rows.length > 0 && selected.size === rows.length;

  // Bulk actions
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
    const copyName = `${rest.name} (Copy)`;
    const copy = {
      ...rest,
      name: copyName,
      slug: generateDeterministicProductSlug({ name: copyName }),
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

      {/* Filter bar */}
      <div className="grid gap-2.5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input
          type="text"
          placeholder="Search name, code, finish…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary lg:col-span-2"
        />
        <Sel value={typeId} onChange={setTypeId} label="Type" options={types} />
        <Sel value={catId} onChange={setCatId} label="Category" options={cats} />
        <Sel value={subId} onChange={setSubId} label="Subcategory" options={subs} />
        <Sel value={famId} onChange={setFamId} label="Family" options={fams} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Status:</span>
        {["", "draft", "published", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-2.5 py-1 font-medium transition ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {s ? s.toUpperCase() : "ALL"}
          </button>
        ))}

        <span className="ml-4 text-muted-foreground">Flags:</span>
        {[
          { id: "", label: "ALL" },
          { id: "featured_home", label: "Featured (Home)" },
          { id: "featured_feed", label: "Featured (Feed)" },
          { id: "hidden", label: "Hidden" },
          { id: "deleted", label: "Soft Deleted" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFlagFilter(f.id)}
            className={`rounded-full px-2.5 py-1 font-medium transition ${
              flagFilter === f.id
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
          <span className="font-semibold">{selected.size} selected</span>
          <Btn onClick={() => bulk("Published", { status: "published" })}>Publish</Btn>
          <Btn onClick={() => bulk("Set to Draft", { status: "draft" })}>Draft</Btn>
          <Btn onClick={() => bulk("Archived", { status: "archived" })}>Archive</Btn>
          <Btn onClick={() => bulk("Featured on Home", { featured_homepage: true })}>Feature Home</Btn>
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
                  <td className="p-2">${Number(r.price).toFixed(2)}</td>
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
                      {r.deleted_at ? (
                        <button onClick={() => rowAction(r.id, "Restored", { deleted_at: null })} className="rounded border border-border px-1.5 py-0.5 hover:border-primary">Restore</button>
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
