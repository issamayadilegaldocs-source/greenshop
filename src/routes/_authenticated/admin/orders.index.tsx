import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Phone, Search, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/store/OrderStatus";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatTND } from "@/lib/format";
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/admin/orders/")({
  head: () => ({
    meta: [
      { title: "Commandes — Maison Noura" },
      { name: "description", content: "Gestion des commandes COD Maison Noura." },
      { property: "og:title", content: "Commandes — Maison Noura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOrdersPage,
});

const PAGE = 20;
const ALL = "__all__";

type OrderRow = {
  id: string;
  reference: string;
  customer_name: string;
  phone: string;
  city: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total: number;
  created_at: string;
};

function AdminOrdersPage() {
  const { tr, locale } = useI18n();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [debounced, status]);

  const list = useQuery({
    queryKey: ["admin", "orders", { debounced, status, page }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(
          "id, reference, customer_name, phone, city, status, payment_status, total, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);

      if (status !== ALL) query = query.eq("status", status as OrderStatus);
      if (debounced) {
        const like = `%${debounced}%`;
        query = query.or(
          `reference.ilike.${like},customer_name.ilike.${like},phone.ilike.${like},city.ilike.${like}`,
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as OrderRow[], total: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE));

  return (
    <div>
      <PageHeader
        icon={ShoppingBag}
        title={tr("Commandes", "الطلبات")}
        description={tr(
          "Confirmez, préparez et suivez les commandes paiement à la livraison.",
          "أكّدوا وحضّروا وتابعوا طلبات الدفع عند الاستلام.",
        )}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("Réf., client, téléphone…", "مرجع، حريف، هاتف…")}
            className="ps-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={tr("Statut", "الحالة")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr("Tous les statuts", "كل الحالات")}</SelectItem>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {tr(ORDER_STATUS_LABELS[s][0], ORDER_STATUS_LABELS[s][1])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data?.rows.length ? (
        <EmptyState
          icon={ShoppingBag}
          title={tr("Aucune commande", "لا توجد طلبات")}
          description={tr(
            "Les commandes passées depuis la boutique apparaîtront ici.",
            "ستظهر هنا الطلبات الواردة من المتجر.",
          )}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-start text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{tr("Référence", "المرجع")}</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    {tr("Client", "الحريف")}
                  </th>
                  <th className="px-4 py-3 font-medium">{tr("Statut", "الحالة")}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    {tr("Paiement", "الدفع")}
                  </th>
                  <th className="px-4 py-3 text-end font-medium">{tr("Total", "المجموع")}</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    {tr("Date", "التاريخ")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.rows.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        to="/admin/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="font-mono font-semibold text-primary hover:underline"
                      >
                        {o.reference}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
                        {o.customer_name}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p className="font-medium">{o.customer_name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                        <Phone className="h-3 w-3" /> {o.phone} · {o.city}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <PaymentStatusBadge status={o.payment_status} />
                    </td>
                    <td className="px-4 py-3 text-end font-medium">
                      {formatTND(o.total, locale)}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {formatDate(o.created_at, locale, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {tr(
                `${list.data.total} commande(s)`,
                `${list.data.total} طلب`,
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="text-sm">
                {page + 1} / {totalPages}
              </span>
              <Button
                size="icon"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
