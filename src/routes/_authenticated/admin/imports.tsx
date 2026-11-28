import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Calculator, Loader2, Plus, Ship, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { dbErrorMessage, formatTND } from "@/lib/format";
import {
  calculateLandedCost,
  roundTnd,
  type AllocationMethod,
  type LandedCostLineInput,
} from "@/lib/erp/landed-cost";
import {
  addImportExpense,
  applyShipmentLandedCostRpc,
  createImportShipment,
  deleteImportExpense,
  fetchExchangeRates,
  fetchImportShipments,
  fetchPurchaseOrders,
  latestRateMap,
  updateShipmentStatus,
  type CurrencyCode,
  type ImportExpenseRow,
  type ImportShipmentRow,
} from "@/lib/erp/erp-api";

export const Route = createFileRoute("/_authenticated/admin/imports")({
  head: () => ({
    meta: [
      { title: "Imports & Landed Cost — Maison Noura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImportsPage,
});

const SHIPMENT_STATUSES: { value: ImportShipmentRow["status"]; fr: string; ar: string }[] = [
  { value: "PREPARING", fr: "Préparation", ar: "قيد التحضير" },
  { value: "SHIPPED", fr: "Expédié Chine", ar: "تم الشحن" },
  { value: "IN_TRANSIT", fr: "En transit", ar: "في الطريق" },
  { value: "CUSTOMS_CLEARANCE", fr: "Dédouanement", ar: "التخليص الجمركي" },
  { value: "ARRIVED", fr: "Arrivé Tunis", ar: "وصل تونس" },
  { value: "COMPLETED", fr: "Clôturé", ar: "مكتمل" },
];

const EXPENSE_TYPES: { value: ImportExpenseRow["expense_type"]; fr: string; ar: string }[] = [
  { value: "shipping", fr: "Fret international", ar: "الشحن الدولي" },
  { value: "customs", fr: "Droits de douane", ar: "الجمارك" },
  { value: "insurance", fr: "Assurance", ar: "التأمين" },
  { value: "taxes", fr: "Taxes & frais portuaires", ar: "الضرائب والميناء" },
  { value: "handling", fr: "Manutention & transitaire", ar: "المناولة والعبور" },
  { value: "other", fr: "Autre frais", ar: "مصاريف أخرى" },
];

function ImportsPage() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shipForm, setShipForm] = useState({
    purchase_order_id: "",
    shipping_company: "",
    origin_country: "China",
    destination_city: "Tunis",
    transport_method: "sea" as ImportShipmentRow["transport_method"],
    tracking_number: "",
    estimated_arrival: "",
  });

  const [expForm, setExpForm] = useState({
    expense_type: "shipping" as ImportExpenseRow["expense_type"],
    label: "",
    amount_foreign: "",
    currency: "TND" as CurrencyCode,
    exchange_rate: "1",
  });
  const [method, setMethod] = useState<AllocationMethod>("value");
  const [manualShares, setManualShares] = useState<Record<string, string>>({});

  const shipQ = useQuery({ queryKey: ["erp", "import-shipments"], queryFn: fetchImportShipments });
  const posQ = useQuery({ queryKey: ["erp", "purchase-orders"], queryFn: fetchPurchaseOrders });
  const ratesQ = useQuery({ queryKey: ["erp", "exchange-rates"], queryFn: fetchExchangeRates });

  const rateMap = latestRateMap(ratesQ.data ?? []);
  const activeShipment = (shipQ.data ?? []).find((s) => s.id === activeId) ?? null;

  const createMut = useMutation({
    mutationFn: () => {
      const po = posQ.data?.find((p) => p.id === shipForm.purchase_order_id);
      return createImportShipment({
        purchase_order_id: shipForm.purchase_order_id || null,
        supplier_id: po?.supplier_id ?? null,
        shipping_company: shipForm.shipping_company,
        origin_country: shipForm.origin_country,
        destination_city: shipForm.destination_city,
        transport_method: shipForm.transport_method,
        tracking_number: shipForm.tracking_number,
        estimated_arrival: shipForm.estimated_arrival || null,
      });
    },
    onSuccess: (id) => {
      setCreateOpen(false);
      setActiveId(id);
      toast.success(tr("Expédition d'import créée", "تم إنشاء شحنة الاستيراد"));
      qc.invalidateQueries({ queryKey: ["erp", "import-shipments"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, st }: { id: string; st: ImportShipmentRow["status"] }) =>
      updateShipmentStatus(id, st),
    onSuccess: () => {
      toast.success(tr("Statut d'expédition mis à jour", "تم تحديث حالة الشحنة"));
      qc.invalidateQueries({ queryKey: ["erp", "import-shipments"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const addExpMut = useMutation({
    mutationFn: () => {
      if (!activeShipment) throw new Error("Expédition non sélectionnée");
      return addImportExpense({
        shipment_id: activeShipment.id,
        expense_type: expForm.expense_type,
        label: expForm.label || expForm.expense_type,
        amount_foreign: Number(expForm.amount_foreign),
        currency: expForm.currency,
        exchange_rate: Number(expForm.exchange_rate),
      });
    },
    onSuccess: () => {
      setExpForm({ ...expForm, label: "", amount_foreign: "" });
      toast.success(tr("Frais d'import ajouté", "تمت إضافة المصروف"));
      qc.invalidateQueries({ queryKey: ["erp", "import-shipments"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const delExpMut = useMutation({
    mutationFn: deleteImportExpense,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp", "import-shipments"] }),
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const totalExpensesTnd = useMemo(() => {
    const exps = activeShipment?.import_expenses ?? [];
    return roundTnd(exps.reduce((s, e) => s + Number(e.amount_tnd), 0));
  }, [activeShipment]);

  const landedPreview = useMemo(() => {
    const po = activeShipment?.purchase_orders;
    const items = po?.purchase_order_items ?? [];
    if (!po || !items.length) return [];
    const inputs: LandedCostLineInput[] = items.map((i) => ({
      purchase_order_item_id: i.id,
      product_id: i.product_id,
      variant_id: i.variant_id,
      sku: i.sku,
      product_name: i.product_name,
      quantity: i.quantity_ordered,
      unit_cost_foreign: Number(i.unit_cost_foreign),
      po_exchange_rate: Number(po.exchange_rate),
      unit_weight_grams: Number(i.unit_weight_grams ?? 0),
      unit_volume_cm3: Number(i.unit_volume_cm3 ?? 0),
      manual_expense_tnd: Number(manualShares[i.id] ?? 0),
    }));
    return calculateLandedCost(inputs, totalExpensesTnd, method);
  }, [activeShipment, totalExpensesTnd, method, manualShares]);

  const applyLandedMut = useMutation({
    mutationFn: () => {
      if (!activeShipment) throw new Error("Aucune expédition");
      return applyShipmentLandedCostRpc(activeShipment.id, method, landedPreview);
    },
    onSuccess: (count) => {
      toast.success(
        tr(
          `Landed Cost appliqué sur ${count} ligne(s) et coût produit mis à jour en TND !`,
          `تم تطبيق تكلفة الهبوط على ${count} منتج وتحديث التكلفة بالدينار!`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["erp", "import-shipments"] });
      qc.invalidateQueries({ queryKey: ["erp", "purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Ship}
        title={tr("Expéditions d'Import & Landed Cost", "شحنات الاستيراد وتكلفة الهبوط")}
        description={tr(
          "Suivez vos conteneurs/colis depuis la Chine, saisissez fret & douane et calculez le coût de revient réel en TND.",
          "تتبع شحناتك من الصين، سجّل الشحن والجمارك واحسب التكلفة الحقيقية بالدينار التونسي.",
        )}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> {tr("Nouvelle expédition", "شحنة جديدة")}
          </Button>
        }
      />

      {shipQ.error ? (
        <ErrorState error={shipQ.error} onRetry={() => shipQ.refetch()} />
      ) : shipQ.isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : !(shipQ.data ?? []).length ? (
        <EmptyState
          icon={Ship}
          title={tr("Aucune expédition d'import", "لا توجد شحنات استيراد بعد")}
          description={tr(
            "Liez un bon de commande Chine à une expédition pour saisir les frais (fret, douane, assurance) et calculer le Landed Cost.",
            "اربط أمر شراء بشحنة استيراد لحساب التكلفة النهائية للمنتجات بالدينار.",
          )}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> {tr("Créer une expédition", "إنشاء شحنة")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start">{tr("Réf. Import", "المرجع")}</th>
                  <th className="px-4 py-3 text-start">{tr("PO / Fournisseur", "أمر الشراء")}</th>
                  <th className="px-4 py-3 text-start">
                    {tr("Trajet & Transport", "المسار والنقل")}
                  </th>
                  <th className="px-4 py-3 text-end">{tr("Frais import", "مصاريف الاستيراد")}</th>
                  <th className="px-4 py-3 text-start">{tr("Statut", "الحالة")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(shipQ.data ?? []).map((s) => {
                  const expSum = (s.import_expenses ?? []).reduce(
                    (acc, e) => acc + Number(e.amount_tnd),
                    0,
                  );
                  const stObj = SHIPMENT_STATUSES.find((x) => x.value === s.status);
                  return (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold">{s.reference}</p>
                        {s.tracking_number && (
                          <p className="text-xs text-muted-foreground">{s.tracking_number}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-medium">
                          {s.purchase_orders?.po_number ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.suppliers?.name ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {s.origin_country} → {s.destination_city} (
                        {s.transport_method.toUpperCase()})
                        {s.shipping_company && (
                          <p className="text-muted-foreground">{s.shipping_company}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end font-semibold text-primary tabular-nums">
                        {formatTND(expSum, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={s.status === "COMPLETED" ? "default" : "secondary"}>
                          {stObj ? tr(stObj.fr, stObj.ar) : s.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setMethod(s.allocation_method);
                            setActiveId(s.id);
                          }}
                        >
                          <Calculator className="h-3.5 w-3.5" />
                          {tr("Frais & Landed Cost", "المصاريف وتكلفة الهبوط")}
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

      {/* Create Shipment Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Nouvelle expédition d'import", "شحنة استيراد جديدة")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label>{tr("Bon de commande associé (PO)", "أمر الشراء المرتبط")}</Label>
              <Select
                value={shipForm.purchase_order_id}
                onValueChange={(v) => setShipForm({ ...shipForm, purchase_order_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("Choisir un PO…", "اختر أمر شراء…")} />
                </SelectTrigger>
                <SelectContent>
                  {(posQ.data ?? []).map((po) => (
                    <SelectItem key={po.id} value={po.id}>
                      {po.po_number} — {po.suppliers?.name} (
                      {formatTND(Number(po.total_tnd), locale)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr("Transporteur / Transitaire", "شركة الشحن")}</Label>
              <Input
                placeholder="CMA CGM / DHL / MSC..."
                value={shipForm.shipping_company}
                onChange={(e) => setShipForm({ ...shipForm, shipping_company: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Mode de transport", "وسيلة النقل")}</Label>
              <Select
                value={shipForm.transport_method}
                onValueChange={(v) =>
                  setShipForm({
                    ...shipForm,
                    transport_method: v as ImportShipmentRow["transport_method"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sea">{tr("Maritime (FCL/LCL)", "بحري")}</SelectItem>
                  <SelectItem value="air">{tr("Aérien", "جوي")}</SelectItem>
                  <SelectItem value="express">{tr("Express (DHL/FedEx)", "سريع")}</SelectItem>
                  <SelectItem value="land">{tr("Terrestre", "بري")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr("N° de suivi / B/L", "رقم التتبع")}</Label>
              <Input
                dir="ltr"
                value={shipForm.tracking_number}
                onChange={(e) => setShipForm({ ...shipForm, tracking_number: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Arrivée estimée (ETA)", "تاريخ الوصول المتوقع")}</Label>
              <Input
                type="date"
                value={shipForm.estimated_arrival}
                onChange={(e) => setShipForm({ ...shipForm, estimated_arrival: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {tr("Annuler", "إلغاء")}
            </Button>
            <Button disabled={createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending && <Loader2 className="animate-spin" />}
              {tr("Créer l'expédition", "إنشاء الشحنة")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shipment Expenses & Landed Cost Calculator Sheet */}
      <Sheet open={!!activeShipment} onOpenChange={(o) => !o && setActiveId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {activeShipment && (
            <div className="space-y-6 p-2">
              <SheetHeader>
                <SheetTitle className="font-mono">
                  {activeShipment.reference} — {tr("Calculateur Landed Cost", "حاسبة تكلفة الهبوط")}
                </SheetTitle>
                <SheetDescription>
                  {activeShipment.purchase_orders?.po_number
                    ? `PO ${activeShipment.purchase_orders.po_number} · ${tr("Frais totaux :", "إجمالي المصاريف:")} ${formatTND(totalExpensesTnd, locale)}`
                    : tr("Aucun PO lié", "لا يوجد أمر شراء مرتبط")}
                </SheetDescription>
              </SheetHeader>

              {/* Status bar */}
              <div className="flex flex-wrap gap-1.5">
                {SHIPMENT_STATUSES.map((st) => (
                  <Button
                    key={st.value}
                    size="sm"
                    variant={activeShipment.status === st.value ? "default" : "outline"}
                    onClick={() => statusMut.mutate({ id: activeShipment.id, st: st.value })}
                  >
                    {tr(st.fr, st.ar)}
                  </Button>
                ))}
              </div>

              {/* Add import expense */}
              <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                <p className="text-sm font-semibold">
                  {tr("1. Frais d'importation (fret, douane, assurance…)", "1. مصاريف الاستيراد")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={expForm.expense_type}
                    onValueChange={(v) =>
                      setExpForm({
                        ...expForm,
                        expense_type: v as ImportExpenseRow["expense_type"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {tr(t.fr, t.ar)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={tr("Libellé (ex. Douane Radès)", "الوصف")}
                    value={expForm.label}
                    onChange={(e) => setExpForm({ ...expForm, label: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={tr("Montant", "المبلغ")}
                      value={expForm.amount_foreign}
                      onChange={(e) => setExpForm({ ...expForm, amount_foreign: e.target.value })}
                    />
                    <Select
                      value={expForm.currency}
                      onValueChange={(v) => {
                        const c = v as CurrencyCode;
                        setExpForm({ ...expForm, currency: c, exchange_rate: String(rateMap[c]) });
                      }}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TND">TND</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="CNY">CNY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    disabled={addExpMut.isPending || !expForm.amount_foreign}
                    onClick={() => addExpMut.mutate()}
                  >
                    <Plus className="h-4 w-4" /> {tr("Ajouter ce frais", "إضافة المصروف")}
                  </Button>
                </div>

                {(activeShipment.import_expenses ?? []).length > 0 && (
                  <ul className="divide-y rounded-lg border bg-background text-xs">
                    {(activeShipment.import_expenses ?? []).map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div>
                          <span className="font-medium">{e.label}</span>{" "}
                          <span className="text-muted-foreground">
                            ({Number(e.amount_foreign).toFixed(2)} {e.currency})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">
                            {formatTND(Number(e.amount_tnd), locale)}
                          </span>
                          <button
                            type="button"
                            onClick={() => delExpMut.mutate(e.id)}
                            className="text-destructive hover:opacity-75"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Allocation method & live Landed Cost preview */}
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {tr(
                      "2. Répartition & Coût de revient réel (TND)",
                      "2. توزيع المصاريف والتكلفة النهائية",
                    )}
                  </p>
                  <Select value={method} onValueChange={(v) => setMethod(v as AllocationMethod)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">
                        {tr("Par valeur d'achat", "حسب قيمة الشراء")}
                      </SelectItem>
                      <SelectItem value="quantity">{tr("Par quantité", "حسب الكمية")}</SelectItem>
                      <SelectItem value="weight">{tr("Par poids (g)", "حسب الوزن")}</SelectItem>
                      <SelectItem value="volume">{tr("Par volume (cm³)", "حسب الحجم")}</SelectItem>
                      <SelectItem value="manual">{tr("Manuel (TND)", "توزيع يدوي")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {landedPreview.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      "Liez cette expédition à un bon de commande contenant des articles pour calculer le Landed Cost.",
                      "اربط هذه الشحنة بأمر شراء يحتوي على منتجات لحساب تكلفة الهبوط.",
                    )}
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-muted/40 text-muted-foreground">
                          <tr>
                            <th className="px-2 py-2 text-start">SKU</th>
                            <th className="px-2 py-2 text-end">Qté</th>
                            <th className="px-2 py-2 text-end">{tr("Base/u", "الشراء/و")}</th>
                            <th className="px-2 py-2 text-end">
                              {tr("Frais alloués", "المصاريف")}
                            </th>
                            <th className="px-2 py-2 text-end font-semibold text-primary">
                              {tr("Landed/u (DT)", "التكلفة/و")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {landedPreview.map((row) => (
                            <tr key={row.purchase_order_item_id}>
                              <td className="px-2 py-2">
                                <p className="font-medium">{row.product_name}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">
                                  {row.sku}
                                </p>
                              </td>
                              <td className="px-2 py-2 text-end tabular-nums">{row.quantity}</td>
                              <td className="px-2 py-2 text-end tabular-nums">
                                {row.base_unit_tnd.toFixed(3)}
                              </td>
                              <td className="px-2 py-2 text-end tabular-nums">
                                {method === "manual" ? (
                                  <Input
                                    type="number"
                                    step="0.001"
                                    className="ms-auto h-7 w-24 text-end text-xs"
                                    value={manualShares[row.purchase_order_item_id] ?? "0"}
                                    onChange={(e) =>
                                      setManualShares((m) => ({
                                        ...m,
                                        [row.purchase_order_item_id]: e.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  `${row.allocated_expenses_tnd.toFixed(3)} (+${row.uplift_pct}%)`
                                )}
                              </td>
                              <td className="px-2 py-2 text-end font-bold text-primary tabular-nums">
                                {formatTND(row.unit_landed_cost_tnd, locale)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <Button
                      className="w-full"
                      disabled={applyLandedMut.isPending}
                      onClick={() => applyLandedMut.mutate()}
                    >
                      {applyLandedMut.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Calculator />
                      )}
                      {tr(
                        "Appliquer le Coût de Revient (Landed Cost) aux produits",
                        "تطبيق تكلفة الهبوط على المنتجات",
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
