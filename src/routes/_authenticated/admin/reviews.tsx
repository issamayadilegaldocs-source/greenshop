import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, MessageSquareText, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatDate } from "@/lib/format";
import type { ReviewStatus } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Avis — Maison Noura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminReviewsPage,
});

const ALL = "__all__";

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  author_name: string | null;
  status: ReviewStatus;
  is_verified: boolean;
  created_at: string;
  product_id: string;
  products: { name_fr: string; slug: string } | null;
};

function AdminReviewsPage() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const [status, setStatus] = useState(ALL);

  const list = useQuery({
    queryKey: ["admin", "reviews", status],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("reviews")
        .select(
          "id, rating, comment, author_name, status, is_verified, created_at, product_id, products(name_fr, slug)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (status !== ALL) query = query.eq("status", status as ReviewStatus);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ReviewRow[];
    },
  });

  const moderate = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: ReviewStatus }) => {
      const { error } = await supabase.from("reviews").update({ status: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Avis mis à jour", "تم تحديث التقييم"));
      qc.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        icon={MessageSquareText}
        title={tr("Avis", "التقييمات")}
        description={tr(
          "Modérez les avis publiés sur les fiches produits.",
          "عدّلوا التقييمات المنشورة على صفحات المنتجات.",
        )}
      />

      <div className="mb-4 max-w-xs">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr("Tous", "الكل")}</SelectItem>
            <SelectItem value="published">{tr("Publiés", "منشورة")}</SelectItem>
            <SelectItem value="hidden">{tr("Masqués", "مخفية")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data?.length ? (
        <EmptyState
          icon={MessageSquareText}
          title={tr("Aucun avis", "لا توجد تقييمات")}
          description={tr(
            "Les avis clients sur les produits apparaîtront ici.",
            "ستظهر هنا تقييمات الحرفاء للمنتجات.",
          )}
        />
      ) : (
        <ul className="space-y-3">
          {list.data.map((r) => (
            <li key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${i < r.rating ? "fill-current" : "opacity-30"}`}
                        />
                      ))}
                    </div>
                    <Badge variant={r.status === "published" ? "default" : "secondary"}>
                      {r.status === "published"
                        ? tr("Publié", "منشور")
                        : tr("Masqué", "مخفي")}
                    </Badge>
                    {r.is_verified && (
                      <Badge variant="outline">{tr("Achat vérifié", "شراء موثّق")}</Badge>
                    )}
                  </div>
                  <p className="mt-2 font-medium">
                    {r.products ? (
                      <Link
                        to="/product/$slug"
                        params={{ slug: r.products.slug }}
                        className="text-primary hover:underline"
                        target="_blank"
                      >
                        {r.products.name_fr}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.author_name || tr("Anonyme", "مجهول")} ·{" "}
                    {formatDate(r.created_at, locale, true)}
                  </p>
                  {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                </div>
                <div className="flex gap-2">
                  {r.status === "published" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ id: r.id, next: "hidden" })}
                    >
                      <EyeOff /> {tr("Masquer", "إخفاء")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ id: r.id, next: "published" })}
                    >
                      <Eye /> {tr("Publier", "نشر")}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
