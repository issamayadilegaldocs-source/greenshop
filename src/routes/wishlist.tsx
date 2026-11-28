import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductGrid } from "@/components/store/ProductCard";
import { useWishlist } from "@/lib/wishlist";
import { getProductsByIds } from "@/lib/catalog.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: "Mes favoris — Maison Noura" },
      {
        name: "description",
        content: "Retrouvez vos articles favoris sauvegardés chez Maison Noura.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const { tr } = useI18n();
  const wishlist = useWishlist();

  const q = useQuery({
    queryKey: ["public", "wishlist-products", wishlist.ids],
    enabled: wishlist.ids.length > 0,
    queryFn: () => getProductsByIds({ data: { ids: wishlist.ids } }),
  });

  return (
    <StoreLayout>
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold md:text-3xl">
              <Heart className="h-6 w-6 fill-primary text-primary" />
              {tr("Mes favoris", "المفضلة")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr(`${wishlist.count} article(s) enregistré(s)`, `${wishlist.count} منتج محفوظ`)}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/shop">{tr("Continuer mes achats", "مواصلة التسوق")}</Link>
          </Button>
        </div>

        {wishlist.ids.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
            <Heart className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-lg font-medium">
              {tr("Votre liste de favoris est vide", "قائمة المفضلة فارغة")}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {tr(
                "Cliquez sur le cœur sur n'importe quel produit pour le retrouver facilement ici.",
                "انقر على أيقونة القلب على أي منتج لحفظه والعودة إليه بسهولة.",
              )}
            </p>
            <Button asChild className="mt-2">
              <Link to="/shop">{tr("Découvrir la boutique", "تصفح المتجر")}</Link>
            </Button>
          </div>
        ) : q.isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: Math.min(4, wishlist.ids.length) }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
            ))}
          </div>
        ) : (
          <ProductGrid products={q.data ?? []} />
        )}
      </div>
    </StoreLayout>
  );
}
