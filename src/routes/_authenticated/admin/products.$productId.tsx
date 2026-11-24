import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Package, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/admin/AdminShell";
import { ProductForm } from "@/components/admin/products/ProductForm";
import { fetchProductForEdit } from "@/components/admin/products/data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import type { Category } from "@/components/admin/categories/types";

export const Route = createFileRoute("/_authenticated/admin/products/$productId")({
  head: () => ({
    meta: [
      { title: "Fiche produit — Maison Noura" },
      {
        name: "description",
        content:
          "Créer ou modifier un produit : photos, caractéristiques, variantes, prix et stock.",
      },
      { property: "og:title", content: "Fiche produit — Maison Noura" },
      { property: "og:description", content: "Administration produit Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProductEditPage,
});

function ProductEditPage() {
  const { productId } = Route.useParams();
  const { tr } = useI18n();
  const { isAdmin, loading } = useAuth();
  const isNew = productId === "new";

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order")
        .order("name_fr");
      if (error) throw error;
      return data as Category[];
    },
  });
  const product = useQuery({
    queryKey: ["admin", "product", productId],
    enabled: !isNew,
    queryFn: () => fetchProductForEdit(productId),
  });

  if (!loading && !isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={tr("Réservé aux administrateurs", "مخصص للمشرفين")}
        description={tr(
          "Seuls les administrateurs peuvent modifier les produits.",
          "فقط المشرفون يمكنهم تعديل المنتجات.",
        )}
      />
    );
  }
  if (categories.error || product.error)
    return (
      <ErrorState
        error={categories.error ?? product.error}
        onRetry={() => {
          categories.refetch();
          product.refetch();
        }}
      />
    );
  if (categories.isLoading || (!isNew && product.isLoading))
    return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (!isNew && !product.data) {
    return (
      <EmptyState
        icon={Package}
        title={tr("Produit introuvable", "المنتج غير موجود")}
        action={
          <Button asChild variant="outline">
            <Link to="/admin/products">{tr("Retour aux produits", "العودة إلى المنتجات")}</Link>
          </Button>
        }
      />
    );
  }
  if (!categories.data?.length) {
    return (
      <EmptyState
        icon={Package}
        title={tr("Créez d'abord une catégorie", "أنشئ قسماً أولاً")}
        description={tr(
          "Chaque produit appartient à une catégorie qui définit ses caractéristiques.",
          "كل منتج ينتمي إلى قسم يحدد خصائصه.",
        )}
        action={
          <Button asChild>
            <Link to="/admin/categories">{tr("Gérer les catégories", "إدارة الأقسام")}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      {!isNew && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-primary-soft/50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Megaphone className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm font-medium">
              {tr(
                "Accélérez les ventes de ce produit avec une vidéo Reels et des posts Facebook / Instagram générés par l'IA.",
                "سرّع مبيعات هذا المنتج عبر فيديو إعلاني ومنشورات فيسبوك وإنستغرام بالذكاء الاصطناعي.",
              )}
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/admin/social-studio" search={{ productId }}>
              <Megaphone className="mr-1.5 h-3.5 w-3.5" />
              {tr("Créer pub & vidéo IA", "إنشاء إعلان وفيديو")}
            </Link>
          </Button>
        </div>
      )}
      <ProductForm
        key={productId}
        categories={categories.data}
        initial={isNew ? null : (product.data ?? null)}
      />
    </div>
  );
}
