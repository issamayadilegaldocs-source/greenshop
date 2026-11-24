import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  Phone,
  Printer,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState, PageHeader } from "@/components/admin/AdminShell";
import {
  OrderStatusBadge,
  OrderTimeline,
  PaymentStatusBadge,
} from "@/components/store/OrderStatus";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatDate, formatTND } from "@/lib/format";
import {
  ORDER_ACTION_HELP,
  ORDER_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/admin/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Détail commande — Maison Noura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOrderDetailPage,
});

type OrderItem = {
  id: string;
  product_name: string;
  variant_label: string | null;
  sku: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  image_url: string | null;
};

type HistoryRow = {
  id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  note: string | null;
  created_at: string;
};

type OrderDetail = {
  id: string;
  reference: string;
  customer_name: string;
  phone: string;
  email: string | null;
  city: string;
  address: string;
  instructions: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  total: number;
  promo_code: string | null;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  order_items: OrderItem[];
  order_status_history: HistoryRow[];
  cash_collections: {
    amount_collected: number;
    collected_at: string;
    collected_by_name: string;
    note: string | null;
  } | null;
};

function AdminOrderDetailPage() {
  const { orderId } = Route.useParams();
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState("");
  const [collectOpen, setCollectOpen] = useState(false);
  const [collector, setCollector] = useState("");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectNote, setCollectNote] = useState("");

  const detail = useQuery({
    queryKey: ["admin", "order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `*, order_items(*), order_status_history(*), cash_collections(amount_collected, collected_at, collected_by_name, note)`,
        )
        .eq("id", orderId)
        .single();
      if (error) throw error;
      const row = data as unknown as OrderDetail & {
        cash_collections:
          | OrderDetail["cash_collections"]
          | OrderDetail["cash_collections"][]
          | null;
      };
      const cash = Array.isArray(row.cash_collections)
        ? (row.cash_collections[0] ?? null)
        : row.cash_collections;
      return {
        ...row,
        cash_collections: cash,
        order_status_history: [...(row.order_status_history ?? [])].sort(
          (a, b) => +new Date(a.created_at) - +new Date(b.created_at),
        ),
      } as OrderDetail;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const trimmed = note.trim();
      const { error } = await supabase.rpc("update_order_status", {
        _order_id: orderId,
        _status: target,
        ...(trimmed ? { _note: trimmed } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        tr(
          `Statut : ${ORDER_STATUS_LABELS[target!][0]}`,
          `الحالة: ${ORDER_STATUS_LABELS[target!][1]}`,
        ),
      );
      setTarget(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "order", orderId] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const collect = useMutation({
    mutationFn: async () => {
      const amount = Number(collectAmount.replace(",", "."));
      const trimmed = collectNote.trim();
      const { error } = await supabase.rpc("collect_cod_payment", {
        _order_id: orderId,
        _amount: amount,
        _collected_by: collector.trim(),
        ...(trimmed ? { _note: trimmed } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Paiement encaissé", "تم تحصيل الدفع"));
      setCollectOpen(false);
      setCollector("");
      setCollectNote("");
      qc.invalidateQueries({ queryKey: ["admin", "order", orderId] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "finances"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return <ErrorState error={detail.error ?? "missing"} onRetry={() => detail.refetch()} />;
  }

  const o = detail.data;
  const next = ORDER_TRANSITIONS[o.status] ?? [];
  const wa = `https://wa.me/216${o.phone.replace(/\D/g, "").replace(/^216/, "")}?text=${encodeURIComponent(
    `Bonjour ${o.customer_name}, concernant votre commande ${o.reference} Maison Noura…`,
  )}`;
  const tel = `tel:+216${o.phone.replace(/\D/g, "").replace(/^216/, "")}`;

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/orders">
            <ArrowLeft /> {tr("Retour aux commandes", "العودة للطلبات")}
          </Link>
        </Button>
      </div>

      <PageHeader
        icon={ShoppingBag}
        title={o.reference}
        description={`${o.customer_name} · ${formatDate(o.created_at, locale, true)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={tel}>
                <Phone /> {tr("Appeler", "اتصال")}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /> {tr("Imprimer", "طباعة")}
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={o.status} />
        <PaymentStatusBadge status={o.payment_status} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        {next.map((s) => (
          <Button
            key={s}
            variant={s === "cancelled" ? "destructive" : "default"}
            size="sm"
            onClick={() => {
              setTarget(s);
              setNote("");
            }}
          >
            {tr(
              ORDER_ACTION_LABELS[s]?.[0] ?? s,
              ORDER_ACTION_LABELS[s]?.[1] ?? s,
            )}
          </Button>
        ))}
        {o.status === "delivered" && o.payment_status === "unpaid" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setCollectAmount(String(o.total));
              setCollectOpen(true);
            }}
          >
            <Wallet /> {tr("Encaisser COD", "تحصيل الدفع")}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">{tr("Articles", "المنتجات")}</h2>
            <ul className="divide-y">
              {o.order_items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3 text-sm">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="grid h-14 w-14 place-items-center rounded-lg bg-muted">—</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.product_name}</p>
                    {item.variant_label && (
                      <p className="text-xs text-muted-foreground">{item.variant_label}</p>
                    )}
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {item.sku} · ×{item.quantity}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-medium">{formatTND(item.line_total, locale)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTND(item.unit_price, locale)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t pt-3 text-sm">
              <Row k={tr("Sous-total", "المجموع الفرعي")} v={formatTND(o.subtotal, locale)} />
              {o.discount_total > 0 && (
                <Row
                  k={
                    o.promo_code
                      ? tr(`Remise (${o.promo_code})`, `خصم (${o.promo_code})`)
                      : tr("Remise", "الخصم")
                  }
                  v={`−${formatTND(o.discount_total, locale)}`}
                />
              )}
              <Row k={tr("Livraison", "التوصيل")} v={formatTND(o.delivery_fee, locale)} />
              <Row k={tr("Total", "المجموع")} v={formatTND(o.total, locale)} bold />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">{tr("Historique", "السجل")}</h2>
            <ul className="space-y-3 text-sm">
              {o.order_status_history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <OrderStatusBadge status={h.to_status} />
                  <div>
                    <p className="text-muted-foreground">
                      {formatDate(h.created_at, locale, true)}
                    </p>
                    {h.note && <p>{h.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">{tr("Client & livraison", "الحريف والتوصيل")}</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">{tr("Nom", "الاسم")}</dt>
                <dd className="font-medium">{o.customer_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{tr("Téléphone", "الهاتف")}</dt>
                <dd dir="ltr">{o.phone}</dd>
              </div>
              {o.email && (
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd dir="ltr">{o.email}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">{tr("Adresse", "العنوان")}</dt>
                <dd>
                  {o.address}
                  <br />
                  {o.city}
                </dd>
              </div>
              {o.instructions && (
                <div>
                  <dt className="text-muted-foreground">{tr("Instructions", "تعليمات")}</dt>
                  <dd>{o.instructions}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">{tr("Suivi", "التتبع")}</h2>
            <OrderTimeline
              status={o.status}
              history={o.order_status_history.map((h) => ({
                to_status: h.to_status,
                created_at: h.created_at,
              }))}
            />
          </section>

          {o.cash_collections && (
            <section className="rounded-2xl border bg-card p-5 text-sm">
              <h2 className="mb-2 font-semibold">{tr("Encaissement", "التحصيل")}</h2>
              <p>
                {formatTND(o.cash_collections.amount_collected, locale)} ·{" "}
                {o.cash_collections.collected_by_name}
              </p>
              <p className="text-muted-foreground">
                {formatDate(o.cash_collections.collected_at, locale, true)}
              </p>
              {o.cash_collections.note && <p className="mt-1">{o.cash_collections.note}</p>}
            </section>
          )}
        </div>
      </div>

      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target
                ? tr(
                    ORDER_ACTION_LABELS[target]?.[0] ?? target,
                    ORDER_ACTION_LABELS[target]?.[1] ?? target,
                  )
                : ""}
            </DialogTitle>
          </DialogHeader>
          {target && ORDER_ACTION_HELP[target] && (
            <p className="text-sm text-muted-foreground">
              {tr(ORDER_ACTION_HELP[target]![0], ORDER_ACTION_HELP[target]![1])}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>
              {target === "cancelled"
                ? tr("Motif d'annulation", "سبب الإلغاء")
                : tr("Note (facultatif)", "ملاحظة (اختياري)")}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="min-h-24"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              {tr("Retour", "رجوع")}
            </Button>
            <Button
              variant={target === "cancelled" ? "destructive" : "default"}
              disabled={updateStatus.isPending || (target === "cancelled" && !note.trim())}
              onClick={() => updateStatus.mutate()}
            >
              {updateStatus.isPending ? <Loader2 className="animate-spin" /> : null}
              {tr("Valider", "تأكيد")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={collectOpen} onOpenChange={setCollectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Encaisser le paiement COD", "تحصيل دفع الاستلام")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{tr("Montant encaissé (TND)", "المبلغ المحصّل (د.ت)")}</Label>
              <Input
                value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)}
                inputMode="decimal"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Encaissé par", "حصّله")}</Label>
              <Input
                value={collector}
                onChange={(e) => setCollector(e.target.value)}
                maxLength={80}
                placeholder={tr("Nom du livreur / caissier", "اسم الموصل / الصندوق")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Note", "ملاحظة")}</Label>
              <Textarea
                value={collectNote}
                onChange={(e) => setCollectNote(e.target.value)}
                maxLength={300}
                className="min-h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectOpen(false)}>
              {tr("Annuler", "إلغاء")}
            </Button>
            <Button
              disabled={collect.isPending || !collector.trim() || !collectAmount}
              onClick={() => collect.mutate()}
            >
              {collect.isPending ? <Loader2 className="animate-spin" /> : null}
              {tr("Enregistrer", "حفظ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "pt-1 text-base font-semibold" : ""}`}>
      <span className={bold ? undefined : "text-muted-foreground"}>{k}</span>
      <span className={bold ? "text-primary" : undefined}>{v}</span>
    </div>
  );
}
