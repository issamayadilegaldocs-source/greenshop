import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Package,
  Pencil,
  Percent,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatTND } from "@/lib/format";
import { categoryPath, type Category } from "@/components/admin/categories/types";
import { STATUS_LABELS } from "@/components/admin/products/types";

export const Route = createFileRoute("/_authenticated/admin/products/")({
  head: () => ({
    meta: [
      { title: "Produits — Maison Noura" },
      {
        name: "description",
        content: "Catalogue produits, prix, variantes et stock de la boutique.",
      },
      { property: "og:title", content: "Produits — Maison Noura" },
      { property: "og:description", content: "Administration des produits Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProductsPage,
});

const PAGE = 20;
const ALL = "__all__";

function ProductsPage() {
  const { tr, locale } = useI18n();
  const { isAdmin, can } = useAuth();
  const canManage = isAdmin || can("products.manage");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState(ALL);
  const [cat, setCat] = useState(ALL);
  const [page, setPage] = useState(0);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"percent" | "fixed">("percent");
  const [bulkDelta, setBulkDelta] = useState("10");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [debounced, status, cat]);

  const categories = useQuery({
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

  const list = useQuery({
    queryKey: ["admin", "products", { debounced, status, cat, page }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(
          "id, name_fr, sku, slug, status, is_featured, price, promo_price, category_id, updated_at, product_images(url, position), product_variants(id, is_active, inventory(available, reserved, low_stock_threshold))",
          { count: "exact" },
        )
        .order("updated_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      const term = debounced.replace(/[%,()]/g, " ").trim();
      if (term)
        query = query.or(`name_fr.ilike.%${term}%,sku.ilike.%${term}%,brand.ilike.%${term}%`);
      if (status !== ALL) query = query.eq("status", status as "draft" | "published" | "archived");
      if (cat !== ALL) query = query.eq("category_id", cat);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });

  const duplicate = useMutation({
    mutationFn: async (sourceId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("admin_duplicate_product", {
        _source_id: sourceId,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: (newId) => {
      toast.success(tr("Produit dupliqué en brouillon", "تم نسخ المنتج كمسودة"));
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      navigate({ to: "/admin/products/$productId", params: { productId: newId } });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const bulkPrice = useMutation({
    mutationFn: async () => {
      const delta = Number(bulkDelta.replace(",", "."));
      if (!Number.isFinite(delta) || delta === 0) {
        throw new Error(tr("Valeur d'ajustement invalide.", "قيمة التعديل غير صالحة."));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("admin_bulk_adjust_product_prices", {
        _product_ids: selectedIds,
        _mode: bulkMode,
        _delta: delta,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (count) => {
      setBulkOpen(false);
      setSelectedIds([]);
      toast.success(
        tr(`${count} produit(s) mis à jour (journalisé)`, `تم تحديث أسعار ${count} منتج`),
      );
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["public"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  function exportCsv() {
    const rows = list.data?.rows ?? [];
    if (!rows.length) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["SKU", "Nom FR", "Categorie", "Prix (TND)", "Promo (TND)", "Stock", "Statut"];
    const lines = [
      headers.map(esc).join(","),
      ...rows.map((p) => {
        const active = (p.product_variants ?? []).filter((v) => v.is_active);
        const stock = active.reduce((n, v) => n + (v.inventory?.available ?? 0), 0);
        return [
          p.sku,
          p.name_fr,
          catName(p.category_id),
          p.price,
          p.promo_price ?? "",
          stock,
          p.status,
        ]
          .map(esc)
          .join(",");
      }),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `produits-maison-noura-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("delete_product", { _product_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      toast.success(
        res === "archived"
          ? tr("Produit déjà commandé : il a été archivé.", "المنتج مطلوب سابقاً: تمت أرشفته.")
          : tr("Produit supprimé", "تم حذف المنتج"),
      );
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["public"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE));
  const catName = (id: string) =>
    categoryPath(categories.data ?? [], id)
      .map((c) => (locale === "ar" && c.name_ar) || c.name_fr)
      .join(" › ");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title={tr("Produits", "المنتجات")}
        description={tr(
          "Votre catalogue : prix, variantes, photos et stock.",
          "الكتالوج: الأسعار، المتغيرات، الصور والمخزون.",
        )}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={exportCsv}>
                <Download /> {tr("Exporter CSV", "تصدير CSV")}
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/products/$productId" params={{ productId: "new" }}>
                  <Camera /> {tr("Créer par photo IA", "إنشاء من صورة IA")}
                </Link>
              </Button>
              <Button asChild>
                <Link to="/admin/products/$productId" params={{ productId: "new" }}>
                  <Plus /> {tr("Nouveau produit", "منتج جديد")}
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("Nom, référence ou marque…", "الاسم، المرجع أو العلامة…")}
            className="ps-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr("Tous les statuts", "كل الحالات")}</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {tr(v[0], v[1])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr("Toutes les catégories", "كل الأقسام")}</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {catName(c.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canManage && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft/60 px-4 py-2.5 text-sm">
          <span className="font-medium">
            {tr(
              `${selectedIds.length} produit(s) sélectionné(s)`,
              `تم تحديد ${selectedIds.length} منتج`,
            )}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds([])}>
              {tr("Tout désélectionner", "إلغاء التحديد")}
            </Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <Percent className="h-3.5 w-3.5" />
              {tr("Ajuster les prix en masse", "تعديل الأسعار جماعياً")}
            </Button>
          </div>
        </div>
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !list.data?.rows.length ? (
        <EmptyState
          icon={Package}
          title={
            debounced || status !== ALL || cat !== ALL
              ? tr("Aucun produit trouvé", "لا توجد منتجات")
              : tr("Aucun produit pour l'instant", "لا توجد منتجات بعد")
          }
          description={tr(
            "Créez un produit et choisissez sa catégorie : le formulaire s'adapte à ses caractéristiques.",
            "أنشئ منتجاً واختر قسمه: يتكيف النموذج مع خصائصه.",
          )}
          action={
            isAdmin ? (
              <Button asChild>
                <Link to="/admin/products/$productId" params={{ productId: "new" }}>
                  <Plus /> {tr("Nouveau produit", "منتج جديد")}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  {canManage && (
                    <th className="w-10 px-3 py-3">
                      <Checkbox
                        checked={
                          list.data.rows.length > 0 &&
                          list.data.rows.every((r) => selectedIds.includes(r.id))
                        }
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedIds(list.data.rows.map((r) => r.id));
                          else setSelectedIds([]);
                        }}
                        aria-label={tr("Tout sélectionner", "تحديد الكل")}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-start font-medium">{tr("Produit", "المنتج")}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr("Catégorie", "القسم")}</th>
                  <th className="px-4 py-3 text-end font-medium">{tr("Prix", "السعر")}</th>
                  <th className="px-4 py-3 text-end font-medium">{tr("Stock", "المخزون")}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr("Statut", "الحالة")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.data.rows.map((p) => {
                  const img = [...(p.product_images ?? [])].sort(
                    (a, b) => a.position - b.position,
                  )[0]?.url;
                  const active = (p.product_variants ?? []).filter((v) => v.is_active);
                  const stock = active.reduce((n, v) => n + (v.inventory?.available ?? 0), 0);
                  const low = active.some(
                    (v) => v.inventory && v.inventory.available <= v.inventory.low_stock_threshold,
                  );
                  const st = STATUS_LABELS[p.status];
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      {canManage && (
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={selectedIds.includes(p.id)}
                            onCheckedChange={(checked) =>
                              setSelectedIds((prev) =>
                                checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                              )
                            }
                            aria-label={p.name_fr}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-primary-soft">
                            {img && (
                              <img
                                src={img}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-medium">
                              {p.name_fr}
                              {p.is_featured && (
                                <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {p.sku} · {active.length}{" "}
                              {active.length > 1
                                ? tr("variantes", "متغيرات")
                                : tr("variante", "متغير")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{catName(p.category_id)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {p.promo_price != null ? (
                          <>
                            <span className="font-medium text-primary">
                              {formatTND(p.promo_price, locale)}
                            </span>
                            <br />
                            <span className="text-xs text-muted-foreground line-through">
                              {formatTND(p.price, locale)}
                            </span>
                          </>
                        ) : (
                          formatTND(p.price, locale)
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span className="tabular-nums">{stock}</span>
                        {low && (
                          <Badge
                            variant="outline"
                            className="ms-2 border-highlight/40 text-highlight"
                          >
                            {tr("Faible", "منخفض")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === "published" ? "default" : "secondary"}>
                          {st ? tr(st[0], st[1]) : p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-label={tr("Modifier", "تعديل")}
                          >
                            <Link to="/admin/products/$productId" params={{ productId: p.id }}>
                              <Pencil />
                            </Link>
                          </Button>
                          {canManage && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={duplicate.isPending}
                              onClick={() => duplicate.mutate(p.id)}
                              aria-label={tr("Dupliquer", "نسخ")}
                              title={tr("Dupliquer", "نسخ")}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setToDelete({ id: p.id, name: p.name_fr })}
                              aria-label={tr("Supprimer", "حذف")}
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {list.data.count} {tr("produits", "منتجات")}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                aria-label={tr("Précédent", "السابق")}
              >
                <ChevronLeft className="rtl:rotate-180" />
              </Button>
              <span>
                {page + 1} / {pages}
              </span>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
                aria-label={tr("Suivant", "التالي")}
              >
                <ChevronRight className="rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Ajuster les prix en masse", "تعديل الأسعار جماعياً")}</DialogTitle>
            <DialogDescription>
              {tr(
                `Applique une variation de prix sur les ${selectedIds.length} produit(s) sélectionné(s) et leurs variantes. L'opération est enregistrée dans le journal d'audit.`,
                `يطبق تعديلاً على أسعار ${selectedIds.length} منتج(ات) محددة ومتغيراتها مع تسجيل العملية في سجل التدقيق.`,
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>{tr("Type d'ajustement", "نوع التعديل")}</Label>
              <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as "percent" | "fixed")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">
                    {tr("Pourcentage (% — ex. +10 ou -15)", "نسبة مئوية (% — مثال +10 أو -15)")}
                  </SelectItem>
                  <SelectItem value="fixed">
                    {tr(
                      "Montant fixe en DT (ex. +5 ou -10)",
                      "مبلغ ثابت بالدينار (مثال +5 أو -10)",
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                {bulkMode === "percent"
                  ? tr("Variation (%)", "التغيير (%)")
                  : tr("Montant (DT)", "المبلغ (د.ت)")}
              </Label>
              <Input
                type="number"
                step="any"
                value={bulkDelta}
                onChange={(e) => setBulkDelta(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              {tr("Annuler", "إلغاء")}
            </Button>
            <Button disabled={bulkPrice.isPending} onClick={() => bulkPrice.mutate()}>
              {bulkPrice.isPending && <Loader2 className="animate-spin" />}
              {tr("Appliquer la modification", "تطبيق التعديل")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Supprimer ce produit ?", "حذف هذا المنتج؟")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                `« ${toDelete?.name ?? ""} » sera supprimé avec ses photos, variantes et stock. S'il a déjà été commandé, il sera archivé à la place pour garder l'historique.`,
                `سيتم حذف «${toDelete?.name ?? ""}» مع صوره ومتغيراته ومخزونه. إذا سبق طلبه، ستتم أرشفته للحفاظ على السجل.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annuler", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              {tr("Supprimer", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
