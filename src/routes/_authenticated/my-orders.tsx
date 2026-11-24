import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoreLayout } from "@/components/store/StoreLayout";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/store/OrderStatus";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatDate, formatTND } from "@/lib/format";
import type { OrderStatus, PaymentStatus } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/my-orders")({
  head: () => ({
    meta: [
      { title: "Mes commandes — Maison Noura" },
      {
        name: "description",
        content: "Historique et suivi de vos commandes Maison Noura.",
      },
      { property: "og:title", content: "Mes commandes — Maison Noura" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyOrdersPage,
});

type OrderItemRow = {
  id: string;
  product_name: string;
  variant_label: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url: string | null;
};

type OrderRow = {
  id: string;
  reference: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total: number;
  created_at: string;
  city: string;
  phone: string;
  address: string;
  order_items: OrderItemRow[];
};

function MyOrdersPage() {
  const { t, tr, locale } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const orders = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, reference, status, payment_status, total, created_at, city, phone, address, order_items(id, product_name, variant_label, quantity, unit_price, line_total, image_url)",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!cancelId) return;
      const trimmed = reason.trim();
      const { error } = await supabase.rpc("cancel_my_order", {
        _order_id: cancelId,
        ...(trimmed ? { _reason: trimmed } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Commande annulée", "تم إلغاء الطلب"));
      setCancelId(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <StoreLayout>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{t("account.orders")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr(
                "Suivez vos commandes passées avec votre compte.",
                "تابعوا الطلبات المرتبطة بحسابكم.",
              )}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/track-order">{t("nav.track")}</Link>
          </Button>
        </div>

        {orders.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : orders.isError ? (
          <p className="text-sm text-destructive">{dbErrorMessage(orders.error)}</p>
        ) : !orders.data?.length ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
            <Package className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">{t("account.orders.empty")}</p>
            <Button asChild className="mt-4">
              <Link to="/shop">{tr("Voir la boutique", "عرض المتجر")}</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.data.map((o) => (
              <li
                key={o.id}
                className="rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-primary">{o.reference}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(o.created_at, locale, true)} · {o.city}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <OrderStatusBadge status={o.status} />
                      <PaymentStatusBadge status={o.payment_status} />
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold">{formatTND(o.total, locale)}</p>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      {o.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => setCancelId(o.id)}
                        >
                          {t("account.orders.cancel")}
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/track-order" search={{ ref: o.reference, phone: o.phone }}>
                          {tr("Détails", "التفاصيل")} <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
                {o.order_items?.length > 0 && (
                  <ul className="mt-3 divide-y rounded-xl border bg-muted/20">
                    {o.order_items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                            —
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.product_name}</p>
                          <p className="text-muted-foreground">
                            {item.variant_label ? `${item.variant_label} · ` : ""}×{item.quantity}
                          </p>
                        </div>
                        <span className="shrink-0 font-medium">
                          {formatTND(item.line_total, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={!!cancelId}
        onOpenChange={(open) => {
          if (!open) {
            setCancelId(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("account.orders.cancel")}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder={tr("Motif (facultatif)", "السبب (اختياري)")}
            className="min-h-24"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? <Loader2 className="animate-spin" /> : null}
              {tr("Confirmer l'annulation", "تأكيد الإلغاء")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StoreLayout>
  );
}
