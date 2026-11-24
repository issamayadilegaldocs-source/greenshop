import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  FolderTree,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { CategoryDialog } from "@/components/admin/categories/CategoryDialog";
import { AttributeDialog } from "@/components/admin/categories/AttributeDialog";
import {
  ATTRIBUTE_TYPES,
  categoryPath,
  type AttributeWithOptions,
  type Category,
} from "@/components/admin/categories/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { pickLocale, useI18n } from "@/lib/i18n";
import { dbErrorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ c: z.string().optional() });

export const Route = createFileRoute("/_authenticated/admin/categories")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Catégories & attributs — Maison Noura" },
      {
        name: "description",
        content: "Gérez l'arborescence des catégories et leurs attributs dynamiques.",
      },
      { property: "og:title", content: "Catégories & attributs — Maison Noura" },
      { property: "og:description", content: "Administration du catalogue Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CategoriesAdminPage,
});

function useCategories() {
  return useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order")
        .order("name_fr");
      if (error) throw error;
      return data as Category[];
    },
  });
}

type TreeProps = {
  node: Category;
  all: Category[];
  depth: number;
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
  forceOpen: boolean;
};

function TreeNode({
  node,
  all,
  depth,
  selectedId,
  onSelect,
  expanded,
  toggle,
  forceOpen,
}: TreeProps) {
  const { locale } = useI18n();
  const kids = all.filter((c) => c.parent_id === node.id);
  const open = forceOpen || expanded.has(node.id);
  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg py-1.5 pe-2 text-sm transition-colors",
          selectedId === node.id ? "bg-primary-soft font-medium text-primary" : "hover:bg-muted",
        )}
        style={{ paddingInlineStart: depth * 16 + 4 }}
      >
        <button
          type="button"
          className={cn(
            "grid h-5 w-5 place-items-center rounded text-muted-foreground",
            !kids.length && "invisible",
          )}
          onClick={() => toggle(node.id)}
          aria-label={open ? "Replier" : "Déplier"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
          onClick={() => onSelect(node.id)}
        >
          <span
            className={cn(
              "truncate",
              !node.is_active &&
                "text-muted-foreground line-through decoration-muted-foreground/50",
            )}
          >
            {pickLocale(node, "name", locale)}
          </span>
          {kids.length > 0 && <span className="text-xs text-muted-foreground">{kids.length}</span>}
        </button>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <TreeNode
              key={k.id}
              node={k}
              all={all}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expanded={expanded}
              toggle={toggle}
              forceOpen={forceOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CategoriesAdminPage() {
  const { tr } = useI18n();
  const { isAdmin } = useAuth();
  const { c: selectedId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = useCategories();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{
    open: boolean;
    editing: Category | null;
    parentId: string | null;
  }>({ open: false, editing: null, parentId: null });

  const all = useMemo(() => q.data ?? [], [q.data]);
  const select = (id: string | undefined) => navigate({ search: { c: id }, replace: true });

  const visible = useMemo(() => {
    if (!query.trim()) return all;
    const needle = query.trim().toLowerCase();
    const keep = new Set<string>();
    for (const c of all) {
      if (
        c.name_fr.toLowerCase().includes(needle) ||
        (c.name_ar ?? "").includes(needle) ||
        c.slug.includes(needle)
      ) {
        for (const p of categoryPath(all, c.id)) keep.add(p.id);
      }
    }
    return all.filter((c) => keep.has(c.id));
  }, [all, query]);

  const selected = all.find((c) => c.id === selectedId) ?? null;

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const newRoot = () => setDialog({ open: true, editing: null, parentId: null });

  return (
    <div>
      <PageHeader
        icon={FolderTree}
        title={tr("Catégories & attributs", "الأقسام والخصائص")}
        description={tr(
          "Créez n'importe quel univers de produits, sans toucher au code.",
          "أنشئ أي نوع من المنتجات دون تعديل الشيفرة.",
        )}
        actions={
          isAdmin && (
            <Button onClick={newRoot}>
              <Plus /> {tr("Nouvelle catégorie", "قسم جديد")}
            </Button>
          )
        }
      />

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title={tr("Aucune catégorie", "لا توجد أقسام")}
          description={tr(
            "Créez votre première catégorie (ex. Vêtements, Électroménager, Meubles), puis définissez ses attributs.",
            "أنشئ قسمك الأول (مثلاً ملابس، أجهزة منزلية، أثاث) ثم حدد خصائصه.",
          )}
          action={
            isAdmin && (
              <Button onClick={newRoot}>
                <Plus /> {tr("Créer une catégorie", "إنشاء قسم")}
              </Button>
            )
          }
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border bg-card p-3 shadow-card lg:sticky lg:top-20">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="ps-8"
                placeholder={tr("Rechercher…", "بحث…")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="max-h-[65vh] overflow-y-auto">
              {visible
                .filter((c) => !c.parent_id)
                .map((c) => (
                  <TreeNode
                    key={c.id}
                    node={c}
                    all={visible}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={select}
                    expanded={expanded}
                    toggle={toggle}
                    forceOpen={!!query.trim()}
                  />
                ))}
              {visible.length === 0 && (
                <li className="p-4 text-center text-sm text-muted-foreground">
                  {tr("Aucun résultat", "لا نتائج")}
                </li>
              )}
            </ul>
          </div>

          {selected ? (
            <CategoryDetail
              key={selected.id}
              category={selected}
              all={all}
              onEdit={() =>
                setDialog({ open: true, editing: selected, parentId: selected.parent_id })
              }
              onAddChild={() => {
                setExpanded((s) => new Set(s).add(selected.id));
                setDialog({ open: true, editing: null, parentId: selected.id });
              }}
              onDeleted={() => select(selected.parent_id ?? undefined)}
              onSelect={select}
            />
          ) : (
            <EmptyState
              icon={SlidersHorizontal}
              title={tr("Sélectionnez une catégorie", "اختر قسماً")}
              description={tr(
                "Choisissez une catégorie à gauche pour voir ses sous-catégories et attributs.",
                "اختر قسماً لعرض أقسامه الفرعية وخصائصه.",
              )}
            />
          )}
        </div>
      )}

      <CategoryDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        categories={all}
        editing={dialog.editing}
        defaultParentId={dialog.parentId}
        onSaved={(id) => select(id)}
      />
    </div>
  );
}

type DetailProps = {
  category: Category;
  all: Category[];
  onEdit: () => void;
  onAddChild: () => void;
  onDeleted: () => void;
  onSelect: (id: string) => void;
};

function CategoryDetail({ category, all, onEdit, onAddChild, onDeleted, onSelect }: DetailProps) {
  const { tr, locale } = useI18n();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attrDialog, setAttrDialog] = useState<{
    open: boolean;
    editing: AttributeWithOptions | null;
  }>({ open: false, editing: null });
  const [attrToDelete, setAttrToDelete] = useState<AttributeWithOptions | null>(null);

  const path = categoryPath(all, category.id);
  const children = all.filter((c) => c.parent_id === category.id);
  const ancestorIds = path.slice(0, -1).map((p) => p.id);

  const attrs = useQuery({
    queryKey: ["admin", "attributes", category.id, ancestorIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_attributes")
        .select("*, category_attribute_options(*)")
        .in("category_id", [...ancestorIds, category.id])
        .order("display_order")
        .order("name_fr");
      if (error) throw error;
      return data as AttributeWithOptions[];
    },
  });

  const own = (attrs.data ?? []).filter((a) => a.category_id === category.id);
  const inherited = (attrs.data ?? [])
    .filter((a) => a.category_id !== category.id)
    .sort((a, b) => ancestorIds.indexOf(a.category_id) - ancestorIds.indexOf(b.category_id));

  const invalidateCats = () => {
    qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    qc.invalidateQueries({ queryKey: ["public"] });
  };

  const toggleActive = useMutation({
    mutationFn: async (is_active: boolean) => {
      const { error } = await supabase
        .from("categories")
        .update({ is_active })
        .eq("id", category.id);
      if (error) throw error;
    },
    onSuccess: invalidateCats,
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("categories").delete().eq("id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Catégorie supprimée", "تم حذف القسم"));
      invalidateCats();
      onDeleted();
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const removeAttr = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("category_attributes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Attribut supprimé", "تم حذف الخاصية"));
      qc.invalidateQueries({ queryKey: ["admin", "attributes"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const typeLabel = (t: string) => {
    const x = ATTRIBUTE_TYPES.find((a) => a.value === t);
    return x ? tr(x.fr, x.ar) : t;
  };

  const renderAttr = (a: AttributeWithOptions, readOnly: boolean) => {
    const opts = [...a.category_attribute_options].sort(
      (x, y) => x.display_order - y.display_order,
    );
    return (
      <div className="flex flex-wrap items-start gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{pickLocale(a, "name", locale)}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {a.code}
            </code>
            <Badge variant="outline" className="font-normal">
              {typeLabel(a.type)}
              {a.unit ? ` · ${a.unit}` : ""}
            </Badge>
            {a.is_required && (
              <Badge className="bg-highlight/10 font-normal text-highlight hover:bg-highlight/10">
                {tr("Obligatoire", "إجباري")}
              </Badge>
            )}
            {a.is_variant && (
              <Badge className="bg-primary-soft font-normal text-primary hover:bg-primary-soft">
                {tr("Variante", "متغير")}
              </Badge>
            )}
            {a.is_filterable && (
              <Badge variant="secondary" className="font-normal">
                {tr("Filtre", "مرشح")}
              </Badge>
            )}
            {a.is_searchable && (
              <Badge variant="secondary" className="font-normal">
                {tr("Recherche", "بحث")}
              </Badge>
            )}
          </div>
          {opts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {opts.slice(0, 14).map((o) => (
                <span
                  key={o.id}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs"
                >
                  {o.color_hex && (
                    <span
                      className="h-3 w-3 rounded-full border"
                      style={{ backgroundColor: o.color_hex }}
                    />
                  )}
                  {(locale === "ar" ? o.label_ar : o.label_fr) || o.value}
                </span>
              ))}
              {opts.length > 14 && (
                <span className="text-xs text-muted-foreground">+{opts.length - 14}</span>
              )}
            </div>
          )}
        </div>
        {!readOnly && isAdmin && (
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setAttrDialog({ open: true, editing: a })}
              aria-label={tr("Modifier", "تعديل")}
            >
              <Pencil />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={() => setAttrToDelete(a)}
              aria-label={tr("Supprimer", "حذف")}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 rtl:-scale-x-100" />}
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => onSelect(p.id)}
              >
                {pickLocale(p, "name", locale)}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap items-start gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-primary-soft">
            {category.image_url ? (
              <img src={category.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center font-display text-3xl font-bold text-primary/30">
                {category.name_fr.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{category.name_fr}</h2>
            {category.name_ar && (
              <p className="text-sm text-muted-foreground" dir="rtl">
                {category.name_ar}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
              /{category.slug}
            </p>
            {category.description_fr && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {category.description_fr}
              </p>
            )}
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm">
                <Switch
                  checked={category.is_active}
                  disabled={toggleActive.isPending}
                  onCheckedChange={(v) => toggleActive.mutate(v)}
                />
                {category.is_active ? tr("Active", "نشط") : tr("Inactive", "غير نشط")}
              </label>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil /> {tr("Modifier", "تعديل")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
                aria-label={tr("Supprimer", "حذف")}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-card shadow-card">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="font-semibold">{tr("Attributs", "الخصائص")}</p>
            <p className="text-xs text-muted-foreground">
              {tr(
                "Ils construisent automatiquement le formulaire produit et les filtres.",
                "تبني تلقائياً استمارة المنتج والمرشحات.",
              )}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setAttrDialog({ open: true, editing: null })}>
              <Plus /> {tr("Attribut", "خاصية")}
            </Button>
          )}
        </div>
        {attrs.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : attrs.error ? (
          <div className="p-5">
            <ErrorState error={attrs.error} onRetry={() => attrs.refetch()} />
          </div>
        ) : (
          <>
            {own.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                {tr(
                  "Aucun attribut propre. Ex. Taille, Couleur, Matière, Capacité, Classe énergétique…",
                  "لا توجد خصائص. مثلاً المقاس، اللون، الخامة، السعة…",
                )}
              </p>
            ) : (
              <ul className="divide-y">
                {own.map((a) => (
                  <li key={a.id}>{renderAttr(a, false)}</li>
                ))}
              </ul>
            )}
            {inherited.length > 0 && (
              <div className="border-t bg-muted/30">
                <p className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tr("Hérités des catégories parentes", "موروثة من الأقسام الأم")}
                </p>
                <ul className="divide-y opacity-80">
                  {inherited.map((a) => {
                    const from = all.find((c) => c.id === a.category_id);
                    return (
                      <li key={a.id}>
                        <p className="px-5 pt-2 text-[11px] text-muted-foreground">
                          {tr("de", "من")} {from ? pickLocale(from, "name", locale) : ""}
                        </p>
                        {renderAttr(a, true)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-2xl border bg-card shadow-card">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <p className="font-semibold">
            {tr("Sous-catégories", "الأقسام الفرعية")}{" "}
            <span className="text-muted-foreground">({children.length})</span>
          </p>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={onAddChild}>
              <FolderPlus /> {tr("Sous-catégorie", "قسم فرعي")}
            </Button>
          )}
        </div>
        {children.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {tr("Aucune sous-catégorie.", "لا توجد أقسام فرعية.")}
          </p>
        ) : (
          <ul className="grid gap-2 p-4 sm:grid-cols-2">
            {children.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-start text-sm hover:bg-muted"
                >
                  <span className={cn(!c.is_active && "text-muted-foreground")}>
                    {pickLocale(c, "name", locale)}
                  </span>
                  {!c.is_active && (
                    <Badge variant="outline" className="font-normal">
                      {tr("Inactive", "غير نشط")}
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AttributeDialog
        open={attrDialog.open}
        onOpenChange={(open) => setAttrDialog((d) => ({ ...d, open }))}
        categoryId={category.id}
        editing={attrDialog.editing}
        nextOrder={own.length}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("Supprimer cette catégorie ?", "حذف هذا القسم؟")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "Ses attributs seront supprimés. Impossible si elle contient des sous-catégories ou des produits — désactivez-la plutôt.",
                "ستحذف خصائصه. غير ممكن إذا احتوى على أقسام فرعية أو منتجات — قم بتعطيله بدلاً من ذلك.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annuler", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => remove.mutate()}
            >
              {tr("Supprimer", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!attrToDelete} onOpenChange={(o) => !o && setAttrToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("Supprimer l'attribut", "حذف الخاصية")} « {attrToDelete?.name_fr} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "Les valeurs saisies sur les produits pour cet attribut seront aussi supprimées.",
                "ستحذف القيم المدخلة على المنتجات لهذه الخاصية أيضاً.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annuler", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (attrToDelete) removeAttr.mutate(attrToDelete.id);
                setAttrToDelete(null);
              }}
            >
              {tr("Supprimer", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
