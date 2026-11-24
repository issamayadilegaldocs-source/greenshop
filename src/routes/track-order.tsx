import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Loader2, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StoreLayout } from "@/components/store/StoreLayout";
import {
  OrderStatusBadge,
  OrderTimeline,
  PaymentStatusBadge,
} from "@/components/store/OrderStatus";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatTND, dbErrorMessage } from "@/lib/format";
import { trackStoreOrder, type TrackedOrder } from "@/lib/shop.functions";
import type { OrderStatus, PaymentStatus } from "@/lib/orders";

const trackSearchSchema = z.object({
  ref: z.string().max(40).optional().catch(undefined),
  phone: z.string().max(40).optional().catch(undefined),
});

export const Route = createFileRoute("/track-order")({
  validateSearch: (s) => trackSearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Suivre ma commande — Maison Noura" },
      {
        name: "description",
        content:
          "Suivez l'état de votre commande Maison Noura avec la référence et votre téléphone.",
      },
      { property: "og:title", content: "Suivre ma commande — Maison Noura" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackOrderPage,
});

function TrackOrderPage() {
  const { t, tr, locale } = useI18n();
  const search = Route.useSearch();
  const [reference, setReference] = useState(search.ref?.toUpperCase() ?? "");
  const [phone, setPhone] = useState(search.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  async function lookupOrder(refVal: string, phoneVal: string) {
    setBusy(true);
    setError(null);
    setOrder(null);
    try {
      const result = await trackStoreOrder({
        data: { reference: refVal.trim(), phone: phoneVal.trim() },
      });
      if (!result) {
        setError(t("track.notFound"));
        return;
      }
      setOrder(result);
    } catch (err) {
      setError(dbErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (search.ref && search.phone) {
      setReference(search.ref.toUpperCase());
      setPhone(search.phone);
      void lookupOrder(search.ref, search.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.ref, search.phone]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await lookupOrder(reference, phone);
  }

  return (
    <StoreLayout>
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
            <PackageSearch className="h-6 w-6" />
          </span>
          <h1 className="text-3xl font-bold">{t("track.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("track.subtitle")}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-card">
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ref">{t("track.reference")}</Label>
            <Input
              id="ref"
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="WS2611-000123"
              maxLength={40}
              required
              autoComplete="off"
              dir="ltr"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">{t("track.hint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t("track.phone")}</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="22 123 456"
              maxLength={20}
              required
              dir="ltr"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t("track.submit")}
          </Button>
        </form>

        {order && (
          <div className="mt-8 space-y-6 rounded-2xl border bg-card p-6 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold">{order.reference}</span>
              <OrderStatusBadge status={order.status as OrderStatus} />
              <PaymentStatusBadge status={order.payment_status as PaymentStatus} />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(order.created_at, locale, true)} · {order.customer_name} · {order.city}
            </p>

            <OrderTimeline
              status={order.status as OrderStatus}
              history={order.history.map((h) => ({
                to_status: h.to_status,
                created_at: h.created_at,
              }))}
            />

            <ul className="divide-y rounded-xl border">
              {order.items.map((item, i) => (
                <li key={i} className="flex gap-3 p-3 text-sm">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="grid h-14 w-14 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">
                      —
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.product_name}</p>
                    {item.variant_label && (
                      <p className="text-xs text-muted-foreground">{item.variant_label}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      ×{item.quantity} · {formatTND(item.unit_price, locale)}
                    </p>
                  </div>
                  <span className="font-medium">{formatTND(item.line_total, locale)}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-1 text-sm">
              <Row k={tr("Sous-total", "المجموع الفرعي")} v={formatTND(order.subtotal, locale)} />
              {order.discount_total > 0 && (
                <Row k={tr("Remise", "الخصم")} v={`−${formatTND(order.discount_total, locale)}`} />
              )}
              <Row k={tr("Livraison", "التوصيل")} v={formatTND(order.delivery_fee, locale)} />
              <Row k={tr("Total", "المجموع")} v={formatTND(order.total, locale)} bold />
            </div>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t pt-2 font-semibold" : ""}`}>
      <span className={bold ? undefined : "text-muted-foreground"}>{k}</span>
      <span className={bold ? "text-primary" : undefined}>{v}</span>
    </div>
  );
}
