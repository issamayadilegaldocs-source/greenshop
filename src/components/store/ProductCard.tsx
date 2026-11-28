import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import { toast } from "sonner";
import type { ProductCardData } from "@/lib/shop.functions";
import { pickLocale, useI18n } from "@/lib/i18n";
import { useWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/utils";
import { PriceTag, discountPercent } from "./PriceTag";

export function ProductCard({ product }: { product: ProductCardData }) {
  const { locale, tr } = useI18n();
  const wishlist = useWishlist();
  const saved = wishlist.has(product.id);
  const name = pickLocale(product, "name", locale);
  const off = discountPercent(product.price, product.promo_price);

  async function onToggleWish(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const added = await wishlist.toggle(product.id);
      toast.success(
        added
          ? tr("Ajouté aux favoris", "أضيف إلى المفضلة")
          : tr("Retiré des favoris", "تمت الإزالة من المفضلة"),
      );
    } catch {
      /* ignore */
    }
  }

  return (
    <Link
      to="/product/$slug"
      params={{ slug: product.slug }}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition hover:-translate-y-0.5 hover:border-primary/30"
    >
      <div className="relative aspect-square overflow-hidden bg-primary-soft">
        {product.image ? (
          <img
            src={product.image}
            alt={name}
            width={600}
            height={600}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full w-full place-items-center font-display text-5xl font-bold text-primary/20">
            {name.charAt(0)}
          </span>
        )}
        <div className="absolute start-2 top-2 flex flex-col gap-1">
          {off > 0 && (
            <span className="rounded-md bg-highlight px-2 py-0.5 text-xs font-bold text-highlight-foreground">
              -{off}%
            </span>
          )}
          {!product.in_stock && (
            <span className="rounded-md bg-background/90 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {tr("Épuisé", "نفد المخزون")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleWish}
          aria-label={
            saved
              ? tr("Retirer des favoris", "إزالة من المفضلة")
              : tr("Ajouter aux favoris", "إضافة إلى المفضلة")
          }
          className={cn(
            "absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/85 shadow-sm backdrop-blur transition hover:scale-105",
            saved ? "text-rose-600" : "text-muted-foreground hover:text-rose-600",
          )}
        >
          <Heart className={cn("h-4 w-4", saved && "fill-current")} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.brand && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {product.brand}
          </p>
        )}
        <p className="line-clamp-2 text-sm font-medium leading-snug">{name}</p>
        {product.rating_count > 0 && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />{" "}
            {product.rating_avg.toFixed(1)} ({product.rating_count})
          </p>
        )}
        <div className="mt-auto pt-1">
          <PriceTag price={product.price} promo={product.promo_price} />
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
