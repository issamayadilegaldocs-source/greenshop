import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Banknote,
  FolderTree,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { formatTND } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — Maison Noura" },
      {
        name: "description",
        content: "Vue d'ensemble des ventes, commandes et stock de la boutique.",
      },
      { property: "og:title", content: "Tableau de bord — Maison Noura" },
      { property: "og:description", content: "Administration Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

type OrderRow = {
  id: string;
  reference: string;
  customer_name: string;
  created_at: string;
  status: string;
  payment_status: string;
  total: number;
};

function useDashboardData() {
  return useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const [products, published, categories, orders, inventory, pending] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("status", "published"),
        supabase.from("categories").select("id", { count: "exact", head: true }),
        supabase
          .from("orders")
          .select("id,reference,customer_name,created_at,status,payment_status,total")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("inventory").select("variant_id,available,low_stock_threshold"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      for (const r of [products, published, categories, orders, inventory, pending])
        if (r.error) throw r.error;
      return {
        products: products.count ?? 0,
        published: published.count ?? 0,
        categories: categories.count ?? 0,
        pending: pending.count ?? 0,
        orders: (orders.data ?? []) as OrderRow[],
        lowStock: (inventory.data ?? []).filter((i) => i.available <= i.low_stock_threshold).length,
      };
    },
  });
}

const chartConfig = {
  placed: { label: "Passées", color: "var(--chart-1)" },
  delivered: { label: "Livrées", color: "var(--chart-2)" },
} satisfies ChartConfig;

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: typeof Package;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "highlight" | "warning" | "success";
}) {
  const tones = {
    primary: "bg-primary-soft text-primary",
    highlight: "bg-highlight/10 text-highlight",
    warning: "bg-warning/15 text-warning-foreground",
    success: "bg-success/10 text-success",
  };
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DashboardPage() {
  const { tr, locale } = useI18n();
  const { isAdmin } = useAuth();
  const q = useDashboardData();

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;
  const live = d?.orders.filter((o) => o.status !== "cancelled") ?? [];
  const delivered = live.filter((o) => o.status === "delivered");
  const deliveredSales = delivered.reduce((s, o) => s + Number(o.total), 0);
  const collected = live
    .filter((o) => o.payment_status === "paid")
    .reduce((s, o) => s + Number(o.total), 0);
  const outstanding = delivered
    .filter((o) => o.payment_status === "unpaid")
    .reduce((s, o) => s + Number(o.total), 0);

  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 86400_000);
    const key = day.toISOString().slice(0, 10);
    return {
      day: day.toLocaleDateString(locale === "ar" ? "ar-TN" : "fr-FR", {
        day: "2-digit",
        month: "short",
      }),
      placed: live.filter((o) => o.created_at.slice(0, 10) === key).length,
      delivered: delivered.filter((o) => o.created_at.slice(0, 10) === key).length,
    };
  });

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title={tr("Tableau de bord", "لوحة القيادة")}
        description={tr("Les 30 derniers jours", "آخر 30 يوماً")}
      />

      {q.isLoading || !d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={ShoppingBag}
              label={tr("Commandes (30 j)", "الطلبات (30 يوماً)")}
              value={live.length}
              hint={`${d.pending} ${tr("en attente", "في الانتظار")}`}
            />
            <Stat
              icon={Truck}
              label={tr("Ventes livrées", "مبيعات مسلّمة")}
              value={formatTND(deliveredSales, locale)}
              hint={`${delivered.length} ${tr("commandes", "طلبات")}`}
              tone="success"
            />
            <Stat
              icon={Banknote}
              label={tr("Espèces encaissées", "النقد المحصّل")}
              value={formatTND(collected, locale)}
              hint={`${tr("À encaisser", "للتحصيل")} : ${formatTND(outstanding, locale)}`}
              tone="highlight"
            />
            <Stat
              icon={AlertTriangle}
              label={tr("Stock faible", "مخزون منخفض")}
              value={d.lowStock}
              hint={tr("variantes sous le seuil", "متغيرات تحت الحد")}
              tone="warning"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-card p-5 shadow-card lg:col-span-2">
              <p className="font-semibold">{tr("Commandes par jour", "الطلبات يومياً")}</p>
              <p className="text-xs text-muted-foreground">
                {tr("14 derniers jours, hors annulations", "آخر 14 يوماً بدون الملغاة")}
              </p>
              <ChartContainer config={chartConfig} className="mt-4 h-64 w-full">
                <BarChart data={days}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    fontSize={11}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="placed" fill="var(--color-placed)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delivered" fill="var(--color-delivered)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
            <div className="space-y-4">
              <Stat
                icon={Package}
                label={tr("Produits", "المنتجات")}
                value={d.products}
                hint={`${d.published} ${tr("publiés", "منشورة")}`}
              />
              <Stat icon={FolderTree} label={tr("Catégories", "الأقسام")} value={d.categories} />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-card shadow-card">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <p className="font-semibold">{tr("Dernières commandes", "آخر الطلبات")}</p>
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/orders">{tr("Voir tout", "عرض الكل")}</Link>
              </Button>
            </div>
            {d.orders.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={ShoppingBag}
                  title={tr("Aucune commande pour l'instant", "لا توجد طلبات بعد")}
                  description={
                    d.categories === 0
                      ? tr(
                          "Commencez par créer vos catégories et leurs attributs.",
                          "ابدأ بإنشاء الأقسام وخصائصها.",
                        )
                      : tr(
                          "Les commandes apparaîtront ici dès qu'un client commandera.",
                          "ستظهر الطلبات هنا فور قيام حريف بالطلب.",
                        )
                  }
                  action={
                    isAdmin && d.categories === 0 ? (
                      <Button asChild>
                        <Link to="/admin/categories">{tr("Créer une catégorie", "إنشاء قسم")}</Link>
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ul className="divide-y">
                {d.orders.slice(0, 8).map((o) => (
                  <li key={o.id} className="px-5 py-3 text-sm">
                    <Link
                      to="/admin/orders/$orderId"
                      params={{ orderId: o.id }}
                      className="flex items-center justify-between gap-4 hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-primary">{o.reference}</p>
                        <p className="truncate text-xs text-muted-foreground">{o.customer_name}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{o.status}</span>
                      <span className="font-medium">{formatTND(o.total, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
