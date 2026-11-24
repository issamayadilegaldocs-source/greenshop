import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Boxes, History, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({
    meta: [
      { title: "Stock — Maison Noura" },
      {
        name: "description",
        content:
          "Niveaux de stock, alertes de stock faible, ajustements et historique des mouvements.",
      },
      { property: "og:title", content: "Stock — Maison Noura" },
      { property: "og:description", content: "Gestion des stocks Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InventoryPage,
});

type Row = {
  variant_id: string;
  sku: string;
  label: string;
  product_id: string;
  product_name: string;
  image: string | null;
  is_active: boolean;
  available: number;
  reserved: number;
  damaged: number;
  incoming: number;
  low_stock_threshold: number;
};

const ACTIONS = [
  { value: "restock", fr: "Réapprovisionner (+ disponible)", ar: "إعادة التموين (+ متوفر)" },
  { value: "remove", fr: "Retirer du stock (− disponible)", ar: "سحب من المخزون (− متوفر)" },
  {
    value: "damage",
    fr: "Déclarer endommagé (disponible → endommagé)",
    ar: "تصريح بالتلف (متوفر ← تالف)",
  },
  {
    value: "repair_damaged",
    fr: "Réparé (endommagé → disponible)",
    ar: "تم الإصلاح (تالف ← متوفر)",
  },
  { value: "writeoff_damaged", fr: "Mettre au rebut (− endommagé)", ar: "إتلاف (− تالف)" },
  { value: "incoming", fr: "Commande fournisseur (+ en arrivage)", ar: "طلب مورد (+ قادم)" },
  {
    value: "receive_incoming",
    fr: "Réception (en arrivage → disponible)",
    ar: "استلام (قادم ← متوفر)",
  },
] as const;

const MOVE_LABELS: Record<string, [string, string]> = {
  initial: ["Stock initial", "مخزون أولي"],
  restock: ["Réapprovisionnement", "إعادة تموين"],
  removal: ["Retrait", "سحب"],
  reservation: ["Réservé (commande)", "محجوز (طلب)"],
  reservation_release: ["Réservation libérée", "تحرير الحجز"],
  shipment: ["Expédié", "تم الشحن"],
  delivery_return: ["Retour livraison", "إرجاع التوصيل"],
  return_restock: ["Retour remis en stock", "إرجاع للمخزون"],
  return_damaged: ["Retour endommagé", "إرجاع تالف"],
  damage: ["Endommagé", "تالف"],
  damage_writeoff: ["Mis au rebut", "إتلاف"],
  damage_repaired: ["Réparé", "تم الإصلاح"],
  incoming: ["Commande fournisseur", "طلب مورد"],
  incoming_received: ["Réception fournisseur", "استلام مورد"],
};

const BUCKETS: Record<string, [string, string]> = {
  available: ["disponible", "متوفر"],
  reserved: ["réservé", "محجوز"],
  damaged: ["endommagé", "تالف"],
  incoming: ["en arrivage", "قادم"],
};

const PAGE = 50;

function InventoryPage() {
  const { tr, locale } = useI18n();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [adjust, setAdjust] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);

  useEffect(() => {
    const t = setTimeout(
      () =>
        setTerm(
          q
            .trim()
            .replace(/[%,()]/g, " ")
            .trim(),
        ),
      250,
    );
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [term, lowOnly]);

  const list = useQuery({
    queryKey: ["admin", "inventory", { term, page }],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: Row[]; count: number }> => {
      let query = supabase
        .from("product_variants")
        .select(
          "id, sku, is_active, position, product_id, products!inner(name_fr, name_ar, status, product_images(url, position)), inventory(available, reserved, damaged, incoming, low_stock_threshold), variant_attribute_values(category_attribute_options(value, label_fr, label_ar))",
          { count: "exact" },
        )
        .neq("products.status", "archived")
        .order("product_id")
        .order("position")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (term) query = query.ilike("sku", `%${term}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      const rows: Row[] = (data ?? []).map((v) => {
        const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
        const prod = v.products;
        const img =
          [...(prod?.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null;
        const label = (v.variant_attribute_values ?? [])
          .map((x) => x.category_attribute_options)
          .filter(Boolean)
          .map((o) => (locale === "ar" && o!.label_ar) || o!.label_fr || o!.value)
          .join(" / ");
        return {
          variant_id: v.id,
          sku: v.sku,
          label,
          product_id: v.product_id,
          product_name: (locale === "ar" && prod?.name_ar) || prod?.name_fr || "",
          image: img,
          is_active: v.is_active,
          available: inv?.available ?? 0,
          reserved: inv?.reserved ?? 0,
          damaged: inv?.damaged ?? 0,
          incoming: inv?.incoming ?? 0,
          low_stock_threshold: inv?.low_stock_threshold ?? 0,
        };
      });
      return { rows, count: count ?? 0 };
    },
  });

  const rows = (list.data?.rows ?? []).filter(
    (r) => !lowOnly || r.available <= r.low_stock_threshold,
  );
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE));
  const lowCount = (list.data?.rows ?? []).filter(
    (r) => r.is_active && r.available <= r.low_stock_threshold,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Boxes}
        title={tr("Stock", "المخزون")}
        description={tr(
          "Disponible, réservé par les commandes, endommagé et en arrivage, par variante.",
          "المتوفر، المحجوز، التالف والقادم لكل متغير.",
        )}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("Référence de variante…", "مرجع المتغير…")}
            className="ps-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={lowOnly} onCheckedChange={setLowOnly} />{" "}
          {tr("Stock faible uniquement", "المخزون المنخفض فقط")}
          {lowCount > 0 && (
            <Badge variant="outline" className="border-highlight/40 text-highlight">
              {lowCount}
            </Badge>
          )}
        </label>
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={
            lowOnly
              ? tr("Aucun stock faible", "لا يوجد مخزون منخفض")
              : tr("Aucune variante", "لا توجد متغيرات")
          }
          description={tr(
            "Le stock apparaît ici dès qu'un produit est créé.",
            "يظهر المخزون هنا بمجرد إنشاء منتج.",
          )}
          action={
            <Button asChild variant="outline">
              <Link to="/admin/products">{tr("Voir les produits", "عرض المنتجات")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">
                    {tr("Produit / variante", "المنتج / المتغير")}
                  </th>
                  <th className="px-4 py-3 text-end font-medium">{tr("Disponible", "متوفر")}</th>
                  <th className="px-4 py-3 text-end font-medium">{tr("Réservé", "محجوز")}</th>
                  <th className="px-4 py-3 text-end font-medium">{tr("Endommagé", "تالف")}</th>
                  <th className="px-4 py-3 text-end font-medium">{tr("En arrivage", "قادم")}</th>
                  <th className="px-4 py-3 text-end font-medium">{tr("Seuil", "الحد")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const low = r.available <= r.low_stock_threshold;
                  return (
                    <tr
                      key={r.variant_id}
                      className={cn("hover:bg-muted/30", !r.is_active && "opacity-60")}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-primary-soft">
                            {r.image && (
                              <img
                                src={r.image}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            )}
                          </span>
                          <div className="min-w-0">
                            <Link
                              to="/admin/products/$productId"
                              params={{ productId: r.product_id }}
                              className="font-medium hover:text-primary"
                            >
                              {r.product_name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {[r.label, r.sku].filter(Boolean).join(" · ")}
                              {!r.is_active && ` · ${tr("inactive", "غير نشط")}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            r.available === 0 ? "text-destructive" : low ? "text-highlight" : "",
                          )}
                        >
                          {r.available}
                        </span>
                        {low && (
                          <AlertTriangle
                            className="ms-1 inline h-3.5 w-3.5 text-highlight"
                            aria-label={tr("Stock faible", "مخزون منخفض")}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                        {r.reserved}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                        {r.damaged}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                        {r.incoming}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <ThresholdInput row={r} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setAdjust(r)}>
                            <SlidersHorizontal /> {tr("Ajuster", "تعديل")}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setHistory(r)}
                            aria-label={tr("Historique", "السجل")}
                          >
                            <History />
                          </Button>
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
              {list.data?.count ?? 0} {tr("variantes", "متغيرات")}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                {tr("Précédent", "السابق")}
              </Button>
              <span>
                {page + 1} / {pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {tr("Suivant", "التالي")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AdjustDialog row={adjust} onClose={() => setAdjust(null)} />
      <HistorySheet row={history} onClose={() => setHistory(null)} locale={locale} />
    </div>
  );
}

function ThresholdInput({ row }: { row: Row }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const [v, setV] = useState(String(row.low_stock_threshold));
  useEffect(() => setV(String(row.low_stock_threshold)), [row.low_stock_threshold]);
  const save = useMutation({
    mutationFn: async (n: number) => {
      const { error } = await supabase.rpc("set_low_stock_threshold", {
        _variant_id: row.variant_id,
        _threshold: n,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Seuil enregistré", "تم حفظ الحد"));
      qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
    onError: (e) => {
      toast.error(dbErrorMessage(e));
      setV(String(row.low_stock_threshold));
    },
  });
  function commit() {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      setV(String(row.low_stock_threshold));
      return;
    }
    if (n !== row.low_stock_threshold) save.mutate(n);
  }
  return (
    <Input
      className="ms-auto h-8 w-16 text-end"
      inputMode="numeric"
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      aria-label={tr("Seuil de stock faible", "حد المخزون المنخفض")}
    />
  );
}

function AdjustDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const [action, setAction] = useState<string>("restock");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (row) {
      setAction("restock");
      setQty("1");
      setReason("");
    }
  }, [row]);

  const limit = !row
    ? 0
    : action === "remove" || action === "damage"
      ? row.available
      : action === "repair_damaged" || action === "writeoff_damaged"
        ? row.damaged
        : action === "receive_incoming"
          ? row.incoming
          : 100000;
  const n = Number(qty);
  const invalid = !Number.isInteger(n) || n <= 0 || n > limit || reason.trim().length < 2;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("adjust_inventory", {
        _variant_id: row!.variant_id,
        _action: action,
        _quantity: n,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Stock mis à jour", "تم تحديث المخزون"));
      qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["admin", "movements", row!.variant_id] });
      qc.invalidateQueries({ queryKey: ["public"] });
      onClose();
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("Ajuster le stock", "تعديل المخزون")}</DialogTitle>
          <DialogDescription>
            {row
              ? `${row.product_name}${row.label ? ` — ${row.label}` : ""} · ${tr("disponible", "متوفر")} ${row.available}, ${tr("endommagé", "تالف")} ${row.damaged}, ${tr("en arrivage", "قادم")} ${row.incoming}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          id="adjust-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>{tr("Opération", "العملية")}</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {tr(a.fr, a.ar)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-qty">{tr("Quantité", "الكمية")}</Label>
            <Input
              id="adj-qty"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            />
            {limit < 100000 && (
              <p
                className={cn("text-xs", n > limit ? "text-destructive" : "text-muted-foreground")}
              >
                {tr(`Maximum : ${limit}`, `الحد الأقصى: ${limit}`)}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">
              {tr("Motif", "السبب")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="adj-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder={tr(
                "Ex. : livraison fournisseur du 12/05",
                "مثال: توصيل المورد بتاريخ 12/05",
              )}
            />
          </div>
          {action === "damage" && (
            <p className="rounded-lg bg-highlight/10 p-3 text-xs text-highlight">
              {tr(
                "La perte (coût d'achat × quantité) sera enregistrée dans les finances.",
                "ستسجل الخسارة (التكلفة × الكمية) في المالية.",
              )}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tr("Annuler", "إلغاء")}
          </Button>
          <Button type="submit" form="adjust-form" disabled={invalid || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} {tr("Valider", "تأكيد")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorySheet({
  row,
  onClose,
  locale,
}: {
  row: Row | null;
  onClose: () => void;
  locale: "fr" | "ar";
}) {
  const { tr } = useI18n();
  const moves = useQuery({
    queryKey: ["admin", "movements", row?.variant_id],
    enabled: !!row,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*")
        .eq("variant_id", row!.variant_id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const bucket = (b: string | null) => (b ? tr(BUCKETS[b]?.[0] ?? b, BUCKETS[b]?.[1] ?? b) : "—");
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{tr("Historique du stock", "سجل المخزون")}</SheetTitle>
          <SheetDescription>
            {row ? `${row.product_name}${row.label ? ` — ${row.label}` : ""} · ${row.sku}` : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {moves.isLoading ? (
            <Skeleton className="h-40" />
          ) : moves.error ? (
            <ErrorState error={moves.error} />
          ) : !moves.data?.length ? (
            <p className="text-sm text-muted-foreground">
              {tr("Aucun mouvement.", "لا توجد حركات.")}
            </p>
          ) : (
            <ol className="space-y-3">
              {moves.data.map((m) => {
                const l = MOVE_LABELS[m.movement_type];
                const plus =
                  !m.from_bucket || (m.to_bucket === "available" && m.from_bucket !== "available");
                return (
                  <li key={m.id} className="rounded-xl border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{l ? tr(l[0], l[1]) : m.movement_type}</span>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          plus ? "text-success" : "text-foreground",
                        )}
                      >
                        {m.quantity}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {bucket(m.from_bucket)} → {bucket(m.to_bucket)} ·{" "}
                      {formatDate(m.created_at, locale, true)}
                    </p>
                    {m.reason && <p className="mt-1 text-xs">{m.reason}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
