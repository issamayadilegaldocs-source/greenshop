import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatTND } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/finances")({
  head: () => ({
    meta: [{ title: "Finances — Maison Noura" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminFinancesPage,
});

type EntryType = Database["public"]["Enums"]["finance_entry_type"];

type Entry = {
  id: string;
  entry_type: EntryType;
  amount: number;
  note: string | null;
  created_at: string;
  order_id: string | null;
  orders: { reference: string } | null;
};

const ENTRY_LABELS: Record<string, [string, string]> = {
  revenue: ["Chiffre d'affaires", "رقم المعاملات"],
  cogs: ["Coût des marchandises", "تكلفة البضاعة"],
  discount: ["Remises", "الخصومات"],
  delivery_income: ["Frais de livraison", "رسوم التوصيل"],
  cash_collected: ["Espèces encaissées", "نقد محصّل"],
  refund: ["Remboursements", "استردادات"],
  return_revenue_reversal: ["Reversement CA (retour)", "عكس رقم المعاملات (إرجاع)"],
  return_cogs_reversal: ["Reversement COGS (retour)", "عكس التكلفة (إرجاع)"],
  return_loss: ["Perte sur retour", "خسارة إرجاع"],
  damage_loss: ["Perte dommages", "خسارة تلف"],
  commission: ["Commission plateforme", "عمولة المنصة"],
  commission_reversal: ["Reversement commission", "عكس العمولة"],
  seller_settlement: ["Règlement vendeur", "تسوية البائع"],
};

function AdminFinancesPage() {
  const { tr, locale } = useI18n();
  const { isAdmin } = useAuth();

  const entries = useQuery({
    queryKey: ["admin", "finances"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_entries")
        .select("id, entry_type, amount, note, created_at, order_id, orders(reference)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  const unpaid = useQuery({
    queryKey: ["admin", "finances", "unpaid"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, reference, customer_name, total, delivered_at")
        .eq("status", "delivered")
        .eq("payment_status", "unpaid")
        .order("delivered_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const map = new Map<EntryType, number>();
    for (const e of entries.data ?? []) {
      map.set(e.entry_type, (map.get(e.entry_type) ?? 0) + Number(e.amount));
    }
    const revenue = map.get("revenue") ?? 0;
    const cogs = map.get("cogs") ?? 0;
    const discount = map.get("discount") ?? 0;
    const delivery = map.get("delivery_income") ?? 0;
    const cash = map.get("cash_collected") ?? 0;
    const losses =
      (map.get("return_loss") ?? 0) + (map.get("damage_loss") ?? 0) + (map.get("refund") ?? 0);
    const gross = revenue + delivery - discount - cogs - losses;
    return { map, revenue, cogs, discount, delivery, cash, losses, gross };
  }, [entries.data]);

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Wallet}
        title={tr("Accès réservé aux administrateurs", "مخصص للمسؤولين")}
        description={tr(
          "Les écritures financières ne sont visibles que pour les administrateurs.",
          "القيود المالية ظاهرة للمسؤولين فقط.",
        )}
      />
    );
  }

  return (
    <div>
      <PageHeader
        icon={Wallet}
        title={tr("Finances", "المالية")}
        description={tr(
          "Ventes livrées, encaissements COD et écritures comptables.",
          "المبيعات المسلّمة وتحصيلات الدفع عند الاستلام والقيود.",
        )}
      />

      {entries.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : entries.isError ? (
        <ErrorState error={entries.error} onRetry={() => entries.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={tr("CA livré", "رقم المعاملات المسلّم")}
              value={formatTND(totals.revenue, locale)}
            />
            <Stat
              label={tr("Marge brute estimée", "الهامش الإجمالي التقديري")}
              value={formatTND(totals.gross, locale)}
            />
            <Stat
              label={tr("Espèces encaissées", "نقد محصّل")}
              value={formatTND(totals.cash, locale)}
            />
            <Stat
              label={tr("À encaisser", "بانتظار التحصيل")}
              value={formatTND(
                (unpaid.data ?? []).reduce((s, o) => s + Number(o.total), 0),
                locale,
              )}
            />
          </div>

          {(unpaid.data?.length ?? 0) > 0 && (
            <section className="mb-6 rounded-2xl border bg-card p-5">
              <h2 className="mb-3 font-semibold">
                {tr("COD à encaisser", "دفع استلام بانتظار التحصيل")}
              </h2>
              <ul className="divide-y text-sm">
                {unpaid.data!.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link
                        to="/admin/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="font-mono font-medium text-primary hover:underline"
                      >
                        {o.reference}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {o.customer_name} · {formatDate(o.delivered_at, locale)}
                      </p>
                    </div>
                    <span className="font-semibold">{formatTND(o.total, locale)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border bg-card">
            <div className="border-b px-5 py-3">
              <h2 className="font-semibold">{tr("Écritures récentes", "القيود الأخيرة")}</h2>
            </div>
            {!entries.data?.length ? (
              <p className="p-6 text-sm text-muted-foreground">
                {tr(
                  "Aucune écriture pour l'instant. Elles apparaissent à la livraison / encaissement.",
                  "لا قيود بعد. تظهر عند التسليم / التحصيل.",
                )}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{tr("Type", "النوع")}</th>
                    <th className="px-4 py-3 text-end font-medium">{tr("Montant", "المبلغ")}</th>
                    <th className="hidden px-4 py-3 text-start font-medium md:table-cell">
                      {tr("Commande", "الطلب")}
                    </th>
                    <th className="hidden px-4 py-3 text-start font-medium lg:table-cell">
                      {tr("Date", "التاريخ")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.data.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {tr(
                            ENTRY_LABELS[e.entry_type]?.[0] ?? e.entry_type,
                            ENTRY_LABELS[e.entry_type]?.[1] ?? e.entry_type,
                          )}
                        </p>
                        {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-end font-medium">
                        {formatTND(e.amount, locale)}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {e.order_id && e.orders ? (
                          <Link
                            to="/admin/orders/$orderId"
                            params={{ orderId: e.order_id }}
                            className="font-mono text-primary hover:underline"
                          >
                            {e.orders.reference}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                        {formatDate(e.created_at, locale, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
