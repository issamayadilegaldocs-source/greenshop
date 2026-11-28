import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatDate, formatTND } from "@/lib/format";
import { roundTnd } from "@/lib/erp/landed-cost";
import {
  createPurchaseOrder,
  fetchCatalogVariantsForPo,
  fetchExchangeRates,
  fetchPurchaseOrders,
  fetchReplenishmentSuggestions,
  fetchSuppliers,
  latestRateMap,
  receivePoItem,
  updatePurchaseOrderStatus,
  type CurrencyCode,
  type PurchaseOrderRow,
  type ReplenishmentSuggestionRow,
} from "@/lib/erp/erp-api";

export const Route = createFileRoute("/_authenticated/admin/purchases")({
  head: () => ({
    meta: [
      { title: "Bons de commande (PO) & Réappro — Maison Noura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PurchasesPage,
});

const PO_STATUS_LABELS: Record<PurchaseOrderRow["status"], [string, string]> = {
  DRAFT: ["Brouillon", "مسودة"],
  SENT: ["Envoyé", "مرسل"],
  CONFIRMED: ["Confirmé", "مؤكد"],
  PARTIALLY_RECEIVED: ["Partiellement reçu", "استلام جزئي"],
  RECEIVED: ["Reçu", "تم الاستلام"],
  CLOSED: ["Clôturé", "مغلق"],
  CANCELLED: ["Annulé", "ملغى"],
};

type DraftLine = {
  variant_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  quantity_ordered: string;
  unit_cost_foreign: string;
  unit_weight_grams: string;
};

function PurchasesPage() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [activePoId, setActivePoId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("CNY");
  const [exchangeRate, setExchangeRate] = useState("0.435");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickVariantId, setPickVariantId] = useState("");
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});

  const posQ = useQuery({ queryKey: ["erp", "purchase-orders"], queryFn: fetchPurchaseOrders });
  const suppliersQ = useQuery({ queryKey: ["erp", "suppliers"], queryFn: fetchSuppliers });
  const ratesQ = useQuery({ queryKey: ["erp", "exchange-rates"], queryFn: fetchExchangeRates });
  const variantsQ = useQuery({
    queryKey: ["erp", "variants-for-po"],
    queryFn: fetchCatalogVariantsForPo,
  });
  const replQ = useQuery({
    queryKey: ["erp", "replenishment"],
    queryFn: () => fetchReplenishmentSuggestions(25),
  });

  const rateMap = latestRateMap(ratesQ.data ?? []);
  const activePo = (posQ.data ?? []).find((p) => p.id === activePoId) ?? null;

  function openNewPo(prefillLines?: DraftLine[]) {
    const firstSup = suppliersQ.data?.[0];
    const curr = firstSup?.currency ?? "CNY";
    setSupplierId(firstSup?.id ?? "");
    setCurrency(curr);
    setExchangeRate(String(rateMap[curr]));
    setExpectedAt("");
    setNotes("");
    setLines(prefillLines ?? []);
    setCreateOpen(true);
  }

  function addVariantLine() {
    const v = variantsQ.data?.find((x) => x.id === pickVariantId);
    if (!v) return;
    if (lines.some((l) => l.variant_id === v.id)) {
      toast.error(tr("Cette variante est déjà dans la liste.", "هذا المتغير موجود بالفعل."));
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        variant_id: v.id,
        product_id: v.product_id,
        sku: v.sku,
        product_name: v.products?.name_fr ?? v.sku,
        quantity_ordered: "20",
        unit_cost_foreign: "20",
        unit_weight_grams: String(v.products?.weight_grams ?? 400),
      },
    ]);
    setPickVariantId("");
  }

  const createMut = useMutation({
    mutationFn: () =>
      createPurchaseOrder({
        supplier_id: supplierId,
        currency,
        exchange_rate: Number(exchangeRate),
        expected_at: expectedAt || null,
        notes,
        items: lines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          sku: l.sku,
          product_name: l.product_name,
          quantity_ordered: Math.max(1, Math.floor(Number(l.quantity_ordered))),
          unit_cost_foreign: Math.max(0, Number(l.unit_cost_foreign)),
          unit_weight_grams: Math.max(0, Math.floor(Number(l.unit_weight_grams || 0))),
        })),
      }),
    onSuccess: (newId) => {
      setCreateOpen(false);
      setActivePoId(newId);
      toast.success(tr("Bon de commande créé en brouillon", "تم إنشاء أمر الشراء كمسودة"));
      qc.invalidateQueries({ queryKey: ["erp", "purchase-orders"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, st }: { id: string; st: PurchaseOrderRow["status"] }) =>
      updatePurchaseOrderStatus(id, st),
    onSuccess: () => {
      toast.success(tr("Statut mis à jour", "تم تحديث الحالة"));
      qc.invalidateQueries({ queryKey: ["erp", "purchase-orders"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const receiveMut = useMutation({
    mutationFn: ({ itemId, qty }: { itemId: string; qty: number }) => receivePoItem(itemId, qty),
    onSuccess: () => {
      toast.success(
        tr(
          "Réception enregistrée : stock incrémenté, lot créé et coût mis à jour !",
          "تم الاستلام: زيادة المخزون وإنشاء الدفعة وتحديث التكلفة!",
        ),
      );
      qc.invalidateQueries({ queryKey: ["erp", "purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["erp", "replenishment"] });
      qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const draftSubtotalForeign = lines.reduce(
    (s, l) => s + (Number(l.quantity_ordered) || 0) * (Number(l.unit_cost_foreign) || 0),
    0,
  );
  const draftTotalTnd = roundTnd(draftSubtotalForeign * (Number(exchangeRate) || 0));

  function draftPoFromReplenishment(row: ReplenishmentSuggestionRow) {
    openNewPo([
      {
        variant_id: row.variant_id,
        product_id: row.product_id,
        sku: row.sku,
        product_name: row.product_name,
        quantity_ordered: String(Math.max(10, row.suggested_qty)),
        unit_cost_foreign: "20",
        unit_weight_grams: String(row.weight_grams || 400),
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ClipboardList}
        title={tr("Achats Internationaux (PO) & Réapprovisionnement", "أوامر الشراء والتموين")}
        description={tr(
          "Commandes fournisseurs multi-devises (CNY/USD/EUR), réception en stock par lot et suggestions de réapprovisionnement.",
          "أوامر شراء بعملات متعددة، استلام جزئي أو كلي في المخزون واقتراحات إعادة التموين.",
        )}
        actions={
          <Button onClick={() => openNewPo()}>
            <Plus /> {tr("Nouveau bon de commande", "أمر شراء جديد")}
          </Button>
        }
      />

      <Tabs defaultValue="orders" className="space-y-6">
        <TabsList>
          <TabsTrigger value="orders">
            {tr("Bons de commande", "أوامر الشراء")} ({posQ.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="replenishment">
            {tr("Suggestions de réappro", "اقتراحات التموين")} (
            {(replQ.data ?? []).filter((r) => r.suggested_qty > 0).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          {posQ.error ? (
            <ErrorState error={posQ.error} onRetry={() => posQ.refetch()} />
          ) : posQ.isLoading ? (
            <Skeleton className="h-80 rounded-2xl" />
          ) : !(posQ.data ?? []).length ? (
            <EmptyState
              icon={ClipboardList}
              title={tr("Aucun bon de commande fournisseur", "لا توجد أوامر شراء بعد")}
              description={tr(
                "Créez un bon de commande en CNY/USD/EUR pour suivre vos achats Chine et calculer le Landed Cost.",
                "أنشئ أمر شراء لتتبع مشترياتك من الصين وحساب التكلفة الحقيقية.",
              )}
              action={
                <Button onClick={() => openNewPo()}>
                  <Plus /> {tr("Créer un bon de commande", "إنشاء أمر شراء")}
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-start">{tr("Réf. PO", "المرجع")}</th>
                      <th className="px-4 py-3 text-start">{tr("Fournisseur", "المورد")}</th>
                      <th className="px-4 py-3 text-end">{tr("Total devise", "المبلغ بالعملة")}</th>
                      <th className="px-4 py-3 text-end">{tr("Taux figé", "السعر")}</th>
                      <th className="px-4 py-3 text-end">{tr("Base TND", "المقابل د.ت")}</th>
                      <th className="px-4 py-3 text-start">{tr("Statut", "الحالة")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(posQ.data ?? []).map((po) => {
                      const st = PO_STATUS_LABELS[po.status];
                      return (
                        <tr key={po.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono font-semibold">{po.po_number}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{po.suppliers?.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(po.created_at, locale)}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-end tabular-nums">
                            {Number(po.total_foreign).toFixed(2)} {po.currency}
                          </td>
                          <td className="px-4 py-3 text-end text-xs text-muted-foreground tabular-nums">
                            {Number(po.exchange_rate).toFixed(4)}
                          </td>
                          <td className="px-4 py-3 text-end font-semibold text-primary tabular-nums">
                            {formatTND(Number(po.total_tnd), locale)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={po.status === "RECEIVED" ? "default" : "secondary"}>
                              {st ? tr(st[0], st[1]) : po.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActivePoId(po.id)}
                            >
                              {tr("Gérer / Réceptionner", "إدارة واستلام")}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="replenishment">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <p className="font-semibold">
                  {tr(
                    "Suggestions intelligentes de réapprovisionnement (délai Chine 25j)",
                    "اقتراحات إعادة التموين الذكية (مدة التوريد 25 يوماً)",
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tr(
                    "Calculées sur les ventes des 30 derniers jours, le stock disponible et le délai fournisseur. Aucun PO n'est envoyé sans validation humaine.",
                    "محسوبة بناءً على مبيعات آخر 30 يوماً والمخزون المتوفر ومدة التوريد. لا يتم إرسال أي طلب دون موافقة بشرية.",
                  )}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => replQ.refetch()}>
                <RefreshCw className="h-3.5 w-3.5" /> {tr("Actualiser", "تحديث")}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start">{tr("Produit / SKU", "المنتج")}</th>
                    <th className="px-4 py-3 text-end">{tr("Dispo", "متوفر")}</th>
                    <th className="px-4 py-3 text-end">{tr("Réservé", "محجوز")}</th>
                    <th className="px-4 py-3 text-end">{tr("Ventes 30j", "مبيعات 30ي")}</th>
                    <th className="px-4 py-3 text-end">{tr("Point alerte", "نقطة الطلب")}</th>
                    <th className="px-4 py-3 text-end">
                      {tr("Qté conseillée", "الكمية المقترحة")}
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(replQ.data ?? []).map((r) => (
                    <tr key={r.variant_id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.product_name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{r.available}</td>
                      <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                        {r.reserved}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{r.sold_30d}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{r.reorder_point}</td>
                      <td className="px-4 py-3 text-end">
                        {r.suggested_qty > 0 ? (
                          <Badge className="tabular-nums">+{r.suggested_qty}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {r.suggested_qty > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => draftPoFromReplenishment(r)}
                          >
                            {tr("Créer PO Brouillon", "إنشاء مسودة شراء")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create PO Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr("Nouveau bon de commande fournisseur", "أمر شراء جديد")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Le taux de change est figé sur ce bon de commande pour préserver l'historique comptable.",
                "يتم تثبيت سعر الصرف في أمر الشراء للحفاظ على دقة السجل المالي.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <Label>{tr("Fournisseur", "المورد")}</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  const sup = suppliersQ.data?.find((s) => s.id === v);
                  if (sup) {
                    setCurrency(sup.currency);
                    setExchangeRate(String(rateMap[sup.currency]));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("Choisir un fournisseur", "اختر مورداً")} />
                </SelectTrigger>
                <SelectContent>
                  {(suppliersQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.country} · {s.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr("Arrivée prévue", "الوصول المتوقع")}</Label>
              <Input
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Devise", "العملة")}</Label>
              <Select
                value={currency}
                onValueChange={(v) => {
                  const c = v as CurrencyCode;
                  setCurrency(c);
                  setExchangeRate(String(rateMap[c]));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">CNY (Yuan)</SelectItem>
                  <SelectItem value="USD">USD (Dollar)</SelectItem>
                  <SelectItem value="EUR">EUR (Euro)</SelectItem>
                  <SelectItem value="TND">TND (Dinar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr(`Taux (1 ${currency} → DT)`, "سعر الصرف")}</Label>
              <Input
                type="number"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Notes", "ملاحظات")}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <Label>{tr("Ajouter un article du catalogue", "إضافة منتج من الكتالوج")}</Label>
            <div className="flex gap-2">
              <Select value={pickVariantId} onValueChange={setPickVariantId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={tr("Sélectionner un SKU…", "اختر منتجاً…")} />
                </SelectTrigger>
                <SelectContent>
                  {(variantsQ.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.products?.name_fr ?? v.sku} ({v.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={addVariantLine}
                disabled={!pickVariantId}
              >
                <Plus className="h-4 w-4" /> {tr("Ajouter", "إضافة")}
              </Button>
            </div>

            {lines.length > 0 && (
              <div className="mt-3 space-y-2">
                {lines.map((l, idx) => (
                  <div
                    key={l.variant_id}
                    className="grid items-center gap-2 rounded-lg border bg-background p-2.5 sm:grid-cols-[1fr_80px_100px_80px_32px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{l.product_name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{l.sku}</p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      value={l.quantity_ordered}
                      onChange={(e) =>
                        setLines((arr) =>
                          arr.map((x, i) =>
                            i === idx ? { ...x, quantity_ordered: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="Qté"
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.unit_cost_foreign}
                      onChange={(e) =>
                        setLines((arr) =>
                          arr.map((x, i) =>
                            i === idx ? { ...x, unit_cost_foreign: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder={`Coût ${currency}`}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      min="0"
                      value={l.unit_weight_grams}
                      onChange={(e) =>
                        setLines((arr) =>
                          arr.map((x, i) =>
                            i === idx ? { ...x, unit_weight_grams: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="g"
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setLines((arr) => arr.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 text-sm font-semibold">
                  <span>
                    {tr("Total achat :", "المجموع:")} {draftSubtotalForeign.toFixed(2)} {currency}
                  </span>
                  <span className="text-primary">≈ {formatTND(draftTotalTnd, locale)}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {tr("Annuler", "إلغاء")}
            </Button>
            <Button
              disabled={createMut.isPending || !supplierId || lines.length === 0}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending && <Loader2 className="animate-spin" />}
              {tr("Créer le bon de commande", "إنشاء أمر الشراء")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PO Detail & Receiving Sheet */}
      <Sheet open={!!activePo} onOpenChange={(o) => !o && setActivePoId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {activePo && (
            <div className="space-y-5 p-2">
              <SheetHeader>
                <SheetTitle className="font-mono">{activePo.po_number}</SheetTitle>
                <SheetDescription>
                  {activePo.suppliers?.name} · {Number(activePo.total_foreign).toFixed(2)}{" "}
                  {activePo.currency} ({formatTND(Number(activePo.total_tnd), locale)} @{" "}
                  {Number(activePo.exchange_rate).toFixed(4)})
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-wrap items-center gap-2">
                {(["DRAFT", "SENT", "CONFIRMED", "CLOSED", "CANCELLED"] as const).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={activePo.status === st ? "default" : "outline"}
                    disabled={statusMut.isPending}
                    onClick={() => statusMut.mutate({ id: activePo.id, st })}
                  >
                    {tr(PO_STATUS_LABELS[st][0], PO_STATUS_LABELS[st][1])}
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  {tr("Lignes & Réception en entrepôt", "المنتجات والاستلام في المستودع")}
                </p>
                {(activePo.purchase_order_items ?? []).map((item) => {
                  const remaining = item.quantity_ordered - item.quantity_received;
                  const qtyInput = receiveQtys[item.id] ?? String(Math.max(1, remaining));
                  return (
                    <div key={item.id} className="space-y-2 rounded-xl border p-3.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
                        </div>
                        <Badge variant={remaining === 0 ? "default" : "outline"}>
                          {item.quantity_received} / {item.quantity_ordered}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>
                          {tr("Coût achat :", "سعر الشراء:")}{" "}
                          {Number(item.unit_cost_foreign).toFixed(2)} {activePo.currency}
                        </span>
                        {item.landed_unit_cost_tnd != null && (
                          <span className="font-semibold text-primary">
                            {tr("Landed Cost :", "تكلفة الهبوط:")}{" "}
                            {formatTND(Number(item.landed_unit_cost_tnd), locale)}
                          </span>
                        )}
                      </div>
                      {remaining > 0 && activePo.status !== "CANCELLED" ? (
                        <div className="flex items-center gap-2 pt-1">
                          <Input
                            type="number"
                            min={1}
                            max={remaining}
                            value={qtyInput}
                            onChange={(e) =>
                              setReceiveQtys((m) => ({ ...m, [item.id]: e.target.value }))
                            }
                            className="h-8 w-24 text-xs"
                          />
                          <Button
                            size="sm"
                            disabled={receiveMut.isPending}
                            onClick={() =>
                              receiveMut.mutate({
                                itemId: item.id,
                                qty: Math.min(remaining, Math.max(1, Math.floor(Number(qtyInput)))),
                              })
                            }
                          >
                            <PackageCheck className="h-3.5 w-3.5" />
                            {tr("Réceptionner en stock", "استلام في المخزون")}
                          </Button>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {tr("Entièrement réceptionné", "تم الاستلام بالكامل")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
