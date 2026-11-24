import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatTND } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({
    meta: [
      { title: "Clients — Maison Noura" },
      { name: "description", content: "Clients et historique de commandes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCustomersPage,
});

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
};

type OrderAgg = {
  user_id: string | null;
  total: number;
  created_at: string;
};

function AdminCustomersPage() {
  const { tr, locale } = useI18n();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const profiles = useQuery({
    queryKey: ["admin", "customers"],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, phone, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const orders = useQuery({
    queryKey: ["admin", "customers", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("user_id, total, created_at")
        .not("user_id", "is", null)
        .neq("status", "cancelled")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as OrderAgg[];
    },
  });

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; spent: number; last: string }>();
    for (const o of orders.data ?? []) {
      if (!o.user_id) continue;
      const cur = map.get(o.user_id) ?? { count: 0, spent: 0, last: o.created_at };
      cur.count += 1;
      cur.spent += Number(o.total) || 0;
      if (o.created_at > cur.last) cur.last = o.created_at;
      map.set(o.user_id, cur);
    }
    return map;
  }, [orders.data]);

  const filtered = useMemo(() => {
    const rows = profiles.data ?? [];
    if (!debounced) return rows;
    return rows.filter((p) => {
      const hay = `${p.full_name ?? ""} ${p.email ?? ""} ${p.phone ?? ""}`.toLowerCase();
      return hay.includes(debounced);
    });
  }, [profiles.data, debounced]);

  return (
    <div>
      <PageHeader
        icon={Users}
        title={tr("Clients", "الحرفاء")}
        description={tr(
          "Comptes clients et volume de commandes.",
          "حسابات الحرفاء وحجم الطلبات.",
        )}
      />

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("Nom, e-mail, téléphone…", "الاسم، البريد، الهاتف…")}
          className="ps-9"
        />
      </div>

      {profiles.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : profiles.isError ? (
        <ErrorState error={profiles.error} onRetry={() => profiles.refetch()} />
      ) : !filtered.length ? (
        <EmptyState
          icon={Users}
          title={tr("Aucun client", "لا يوجد حرفاء")}
          description={tr(
            "Les comptes créés depuis la boutique apparaîtront ici.",
            "ستظهر هنا الحسابات المنشأة من المتجر.",
          )}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{tr("Client", "الحريف")}</th>
                <th className="hidden px-4 py-3 text-start font-medium sm:table-cell">
                  {tr("Téléphone", "الهاتف")}
                </th>
                <th className="px-4 py-3 text-end font-medium">{tr("Commandes", "الطلبات")}</th>
                <th className="hidden px-4 py-3 text-end font-medium md:table-cell">
                  {tr("Dépensé", "المبلغ")}
                </th>
                <th className="hidden px-4 py-3 text-start font-medium lg:table-cell">
                  {tr("Inscription", "التسجيل")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const s = stats.get(p.id);
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {p.email}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell" dir="ltr">
                      {p.phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {s?.count ? (
                        <Link
                          to="/admin/orders"
                          className="font-medium text-primary hover:underline"
                        >
                          {s.count}
                        </Link>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-end md:table-cell">
                      {formatTND(s?.spent ?? 0, locale)}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {formatDate(p.created_at, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
