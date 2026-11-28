import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Banknote,
  Factory,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatDate, formatTND } from "@/lib/format";
import {
  addExchangeRate,
  fetchExchangeRates,
  fetchPurchaseOrders,
  fetchSupplierPayments,
  fetchSuppliers,
  latestRateMap,
  recordSupplierPayment,
  saveSupplier,
  type CurrencyCode,
  type SupplierRow,
} from "@/lib/erp/erp-api";

export const Route = createFileRoute("/_authenticated/admin/suppliers")({
  head: () => ({
    meta: [
      { title: "Fournisseurs & Devises — Maison Noura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuppliersPage,
});

const EMPTY_SUPPLIER = {
  id: "",
  name: "",
  company_name: "",
  country: "China",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  payment_terms: "30% TT / 70% avant expédition",
  currency: "CNY" as CurrencyCode,
  lead_time_days: "25",
  rating: "4.5",
  notes: "",
};

function SuppliersPage() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_SUPPLIER);

  // Payment form state
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    supplier_id: "",
    purchase_order_id: "",
    amount_foreign: "",
    currency: "CNY" as CurrencyCode,
    exchange_rate: "0.435",
    payment_method: "wire_transfer",
    reference: "",
    notes: "",
  });

  // Exchange rate form
  const [rateForm, setRateForm] = useState({
    currency_code: "CNY" as CurrencyCode,
    rate_to_tnd: "",
    effective_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const suppliersQ = useQuery({ queryKey: ["erp", "suppliers"], queryFn: fetchSuppliers });
  const ratesQ = useQuery({ queryKey: ["erp", "exchange-rates"], queryFn: fetchExchangeRates });
  const paymentsQ = useQuery({
    queryKey: ["erp", "supplier-payments"],
    queryFn: fetchSupplierPayments,
  });
  const posQ = useQuery({ queryKey: ["erp", "purchase-orders"], queryFn: fetchPurchaseOrders });

  const rateMap = latestRateMap(ratesQ.data ?? []);

  const saveMut = useMutation({
    mutationFn: () =>
      saveSupplier({
        ...(form.id ? { id: form.id } : {}),
        name: form.name,
        company_name: form.company_name,
        country: form.country,
        contact_person: form.contact_person,
        email: form.email,
        phone: form.phone,
        address: form.address,
        website: form.website,
        payment_terms: form.payment_terms,
        currency: form.currency,
        lead_time_days: Number(form.lead_time_days || 25),
        rating: Number(form.rating || 4.5),
        notes: form.notes,
      }),
    onSuccess: () => {
      setDialogOpen(false);
      toast.success(tr("Fournisseur enregistré", "تم حفظ المورد"));
      qc.invalidateQueries({ queryKey: ["erp", "suppliers"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const payMut = useMutation({
    mutationFn: () =>
      recordSupplierPayment({
        supplier_id: payForm.supplier_id,
        purchase_order_id: payForm.purchase_order_id || null,
        amount_foreign: Number(payForm.amount_foreign),
        currency: payForm.currency,
        exchange_rate: Number(payForm.exchange_rate),
        payment_method: payForm.payment_method,
        reference: payForm.reference,
        notes: payForm.notes,
      }),
    onSuccess: () => {
      setPayOpen(false);
      toast.success(tr("Paiement fournisseur enregistré", "تم تسجيل دفعة المورد"));
      qc.invalidateQueries({ queryKey: ["erp", "supplier-payments"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const rateMut = useMutation({
    mutationFn: () =>
      addExchangeRate({
        currency_code: rateForm.currency_code,
        rate_to_tnd: Number(rateForm.rate_to_tnd),
        effective_date: rateForm.effective_date,
        notes: rateForm.notes,
      }),
    onSuccess: () => {
      setRateForm({ ...rateForm, rate_to_tnd: "", notes: "" });
      toast.success(tr("Nouveau taux enregistré (historique conservé)", "تم حفظ سعر الصرف الجديد"));
      qc.invalidateQueries({ queryKey: ["erp", "exchange-rates"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  function openNew() {
    setForm(EMPTY_SUPPLIER);
    setDialogOpen(true);
  }

  function openEdit(s: SupplierRow) {
    setForm({
      id: s.id,
      name: s.name,
      company_name: s.company_name ?? "",
      country: s.country,
      contact_person: s.contact_person ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      website: s.website ?? "",
      payment_terms: s.payment_terms ?? "",
      currency: s.currency,
      lead_time_days: String(s.lead_time_days),
      rating: String(s.rating),
      notes: s.notes ?? "",
    });
    setDialogOpen(true);
  }

  function openPayment(supplier?: SupplierRow) {
    const curr = supplier?.currency ?? "CNY";
    setPayForm({
      supplier_id: supplier?.id ?? suppliersQ.data?.[0]?.id ?? "",
      purchase_order_id: "",
      amount_foreign: "",
      currency: curr,
      exchange_rate: String(rateMap[curr]),
      payment_method: "wire_transfer",
      reference: "",
      notes: "",
    });
    setPayOpen(true);
  }

  const filtered = (suppliersQ.data ?? []).filter((s) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return [s.name, s.company_name, s.country, s.contact_person, s.email]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Factory}
        title={tr("Fournisseurs & Devises", "الموردون وأسعار الصرف")}
        description={tr(
          "Base fournisseurs Chine / local, paiements internationaux et taux de change historiques.",
          "قاعدة موردي الصين والمحليين، المدفوعات الدولية وأسعار الصرف التاريخية.",
        )}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openPayment()}>
              <Banknote /> {tr("Enregistrer un paiement", "تسجيل دفعة")}
            </Button>
            <Button onClick={openNew}>
              <Plus /> {tr("Nouveau fournisseur", "مورد جديد")}
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="suppliers" className="space-y-6">
        <TabsList>
          <TabsTrigger value="suppliers">
            {tr("Fournisseurs", "الموردون")} ({suppliersQ.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="payments">
            {tr("Paiements", "المدفوعات")} ({paymentsQ.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="rates">{tr("Taux de change (FX)", "أسعار الصرف")}</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("Nom, société, pays, contact…", "الاسم، الشركة، البلد…")}
              className="ps-9"
            />
          </div>

          {suppliersQ.error ? (
            <ErrorState error={suppliersQ.error} onRetry={() => suppliersQ.refetch()} />
          ) : suppliersQ.isLoading ? (
            <Skeleton className="h-72 rounded-2xl" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Factory}
              title={tr("Aucun fournisseur", "لا يوجد موردون")}
              action={
                <Button onClick={openNew}>{tr("Ajouter un fournisseur", "إضافة مورد")}</Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((s) => (
                <div key={s.id} className="rounded-2xl border bg-card p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{s.name}</h3>
                        <Badge variant="outline">{s.country}</Badge>
                        <Badge variant="secondary">{s.currency}</Badge>
                      </div>
                      {s.company_name && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{s.company_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                        {Number(s.rating).toFixed(1)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openEdit(s)}
                        aria-label={tr("Modifier", "تعديل")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <dt className="font-medium text-foreground">
                        {tr("Contact", "جهة الاتصال")}
                      </dt>
                      <dd>{s.contact_person || "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">
                        {tr("Délai moyen", "مدة التوريد")}
                      </dt>
                      <dd>
                        {s.lead_time_days} {tr("jours", "يوم")}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">{tr("Téléphone", "الهاتف")}</dt>
                      <dd dir="ltr" className="text-start">
                        {s.phone || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">
                        {tr("Conditions", "شروط الدفع")}
                      </dt>
                      <dd>{s.payment_terms || "—"}</dd>
                    </div>
                  </dl>

                  {s.notes && (
                    <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      {s.notes}
                    </p>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openPayment(s)}>
                      <Banknote className="h-3.5 w-3.5" />
                      {tr("Paiement", "دفع")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start">{tr("Date", "التاريخ")}</th>
                    <th className="px-4 py-3 text-start">{tr("Fournisseur", "المورد")}</th>
                    <th className="px-4 py-3 text-end">{tr("Montant devise", "المبلغ بالعملة")}</th>
                    <th className="px-4 py-3 text-end">{tr("Taux", "السعر")}</th>
                    <th className="px-4 py-3 text-end">{tr("Équiv. TND", "المقابل د.ت")}</th>
                    <th className="px-4 py-3 text-start">{tr("Réf.", "المرجع")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(paymentsQ.data ?? []).map((p) => {
                    const sup = suppliersQ.data?.find((s) => s.id === p.supplier_id);
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(p.paid_at, locale)}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {sup?.name ?? p.supplier_id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {Number(p.amount_foreign).toFixed(2)} {p.currency}
                        </td>
                        <td className="px-4 py-3 text-end text-xs text-muted-foreground tabular-nums">
                          {Number(p.exchange_rate).toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-end font-semibold text-primary tabular-nums">
                          {formatTND(Number(p.amount_tnd), locale)}
                        </td>
                        <td className="px-4 py-3 text-xs">{p.reference || p.payment_method}</td>
                      </tr>
                    );
                  })}
                  {!(paymentsQ.data ?? []).length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        {tr("Aucun paiement fournisseur enregistré.", "لا توجد مدفوعات مسجلة بعد.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rates" className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            {(["CNY", "USD", "EUR", "TND"] as CurrencyCode[]).map((curr) => (
              <div key={curr} className="rounded-2xl border bg-card p-4 shadow-card">
                <p className="text-xs font-medium text-muted-foreground">1 {curr} → TND</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                  {rateMap[curr].toFixed(4)} DT
                </p>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              rateMut.mutate();
            }}
            className="grid gap-3 rounded-2xl border bg-card p-5 shadow-card md:grid-cols-5"
          >
            <div className="space-y-1.5">
              <Label>{tr("Devise", "العملة")}</Label>
              <Select
                value={rateForm.currency_code}
                onValueChange={(v) =>
                  setRateForm({ ...rateForm, currency_code: v as CurrencyCode })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">CNY (Yuan Chine)</SelectItem>
                  <SelectItem value="USD">USD (Dollar)</SelectItem>
                  <SelectItem value="EUR">EUR (Euro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Taux (1 unité en DT)", "السعر بالدينار")}</Label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                required
                placeholder="0.4350"
                value={rateForm.rate_to_tnd}
                onChange={(e) => setRateForm({ ...rateForm, rate_to_tnd: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Date d'effet", "تاريخ السريان")}</Label>
              <Input
                type="date"
                required
                value={rateForm.effective_date}
                onChange={(e) => setRateForm({ ...rateForm, effective_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Note", "ملاحظة")}</Label>
              <Input
                placeholder={tr("Ex. taux BCT", "مثال: سعر البنك المركزي")}
                value={rateForm.notes}
                onChange={(e) => setRateForm({ ...rateForm, notes: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={rateMut.isPending}>
                <ArrowLeftRight className="h-4 w-4" />
                {tr("Ajouter taux", "حفظ السعر")}
              </Button>
            </div>
          </form>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
            <div className="border-b px-5 py-3 text-sm font-semibold">
              {tr("Historique immuable des taux de change", "سجل أسعار الصرف التاريخية")}
            </div>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-start">{tr("Date", "التاريخ")}</th>
                  <th className="px-4 py-2.5 text-start">{tr("Devise", "العملة")}</th>
                  <th className="px-4 py-2.5 text-end">{tr("Taux TND", "السعر د.ت")}</th>
                  <th className="px-4 py-2.5 text-start">{tr("Note", "ملاحظة")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(ratesQ.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-xs">{r.effective_date}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold">{r.currency_code}</td>
                    <td className="px-4 py-2.5 text-end font-semibold tabular-nums">
                      {Number(r.rate_to_tnd).toFixed(4)} DT
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? tr("Modifier le fournisseur", "تعديل المورد")
                : tr("Nouveau fournisseur", "إضافة مورد جديد")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate();
            }}
            className="grid gap-3 md:grid-cols-2"
          >
            <div className="space-y-1">
              <Label>{tr("Nom court *", "الاسم *")}</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Raison sociale", "اسم الشركة")}</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Pays", "البلد")}</Label>
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Devise principale", "العملة الأساسية")}</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v as CurrencyCode })}
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
              <Label>{tr("Contact", "الشخص المسؤول")}</Label>
              <Input
                value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Téléphone / WeChat", "الهاتف")}</Label>
              <Input
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                dir="ltr"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr("Délai livraison (jours)", "مدة التوريد (أيام)")}</Label>
              <Input
                type="number"
                min="0"
                value={form.lead_time_days}
                onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>{tr("Conditions de paiement", "شروط الدفع")}</Label>
              <Input
                value={form.payment_terms}
                onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>{tr("Notes", "ملاحظات")}</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {tr("Annuler", "إلغاء")}
              </Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending && <Loader2 className="animate-spin" />}
                {tr("Enregistrer", "حفظ")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supplier Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tr("Enregistrer un paiement fournisseur", "تسجيل دفعة لمورد")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              payMut.mutate();
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>{tr("Fournisseur", "المورد")}</Label>
              <Select
                value={payForm.supplier_id}
                onValueChange={(v) => setPayForm({ ...payForm, supplier_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(suppliersQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr("Bon de commande lié (optionnel)", "أمر الشراء المرتبط (اختياري)")}</Label>
              <Select
                value={payForm.purchase_order_id || "__none__"}
                onValueChange={(v) =>
                  setPayForm({ ...payForm, purchase_order_id: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{tr("Aucun", "بدون")}</SelectItem>
                  {(posQ.data ?? []).map((po) => (
                    <SelectItem key={po.id} value={po.id}>
                      {po.po_number} ({Number(po.total_foreign).toFixed(2)} {po.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>{tr("Montant", "المبلغ")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={payForm.amount_foreign}
                  onChange={(e) => setPayForm({ ...payForm, amount_foreign: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr("Devise", "العملة")}</Label>
                <Select
                  value={payForm.currency}
                  onValueChange={(v) => {
                    const c = v as CurrencyCode;
                    setPayForm({ ...payForm, currency: c, exchange_rate: String(rateMap[c]) });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="TND">TND</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{tr("Taux → DT", "السعر")}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  required
                  value={payForm.exchange_rate}
                  onChange={(e) => setPayForm({ ...payForm, exchange_rate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{tr("Référence virement / SWIFT", "مرجع التحويل")}</Label>
              <Input
                value={payForm.reference}
                onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
                {tr("Annuler", "إلغاء")}
              </Button>
              <Button type="submit" disabled={payMut.isPending || !payForm.supplier_id}>
                {payMut.isPending && <Loader2 className="animate-spin" />}
                {tr("Enregistrer", "حفظ")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
