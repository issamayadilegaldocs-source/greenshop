import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Banknote,
  BadgeCheck,
  Heart,
  Minus,
  PackageX,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreLayout } from "@/components/store/StoreLayout";
import { PriceTag, discountPercent } from "@/components/store/PriceTag";
import { ProductGrid } from "@/components/store/ProductCard";
import {
  productQuery,
  type ProductDetail,
  type PublicVariant,
  type VariantAxis,
  type FacetOption,
  type Spec,
  type Review,
  type ProductImage,
} from "@/lib/shop.functions";
import { publicCategoriesQuery, type PublicCategory } from "@/lib/catalog.functions";
import { MAX_LINE_QTY, useCart } from "@/lib/cart";
import { recordRecentlyViewed, useWishlist } from "@/lib/wishlist";
import { pickLocale, useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ context, params }) => {
    const [data] = await Promise.all([
      context.queryClient.ensureQueryData(productQuery(params.slug)),
      context.queryClient.ensureQueryData(publicCategoriesQuery()),
    ]);
    if (!data) throw notFound();
    const desc = (data.product.description_fr ?? "").replace(/\s+/g, " ").slice(0, 155);
    return { name: data.product.name_fr, description: desc };
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.name} — Maison Noura` : "Produit — Maison Noura";
    const description =
      loaderData?.description ||
      "Commandez chez Maison Noura, paiement à la livraison partout en Tunisie.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: ProductNotFound,
  component: ProductPage,
});

function ProductNotFound() {
  const { tr } = useI18n();
  return (
    <StoreLayout>
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <PackageX className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">{tr("Produit introuvable", "المنتج غير موجود")}</h1>
        <p className="text-muted-foreground">
          {tr(
            "Ce produit n'existe pas ou n'est plus disponible.",
            "هذا المنتج غير موجود أو لم يعد متوفراً.",
          )}
        </p>
        <Button asChild>
          <Link to="/shop">{tr("Retour à la boutique", "العودة إلى المتجر")}</Link>
        </Button>
      </div>
    </StoreLayout>
  );
}

function matches(v: PublicVariant, sel: Record<string, string>) {
  return Object.entries(sel).every(([a, o]) => v.options[a] === o);
}

function ProductPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(productQuery(slug));
  const { data: categories } = useSuspenseQuery(publicCategoriesQuery());
  if (!data) return <ProductNotFound />;
  return <ProductView key={data.product.id} data={data} categories={categories} />;
}

function ProductView({ data, categories }: { data: ProductDetail; categories: PublicCategory[] }) {
  const { tr, locale } = useI18n();
  const navigate = useNavigate();
  const cart = useCart();
  const wishlist = useWishlist();
  const { product, images, specs, axes, variants, reviews, related } = data;
  const savedInWish = wishlist.has(product.id);
  const [imageIndex, setImageIndex] = useState(0);
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const v = variants.find((x: PublicVariant) => x.available > 0) ?? variants[0];
    return v ? { ...v.options } : {};
  });
  const [qty, setQty] = useState(1);

  useEffect(() => {
    recordRecentlyViewed({
      id: product.id,
      slug: product.slug,
      name_fr: product.name_fr,
      name_ar: product.name_ar,
      brand: product.brand,
      price: product.price,
      promo_price: product.promo_price,
      image: images[0]?.url ?? null,
      rating_avg: product.rating_avg,
      rating_count: product.rating_count,
      is_featured: false,
      in_stock: variants.some((v) => v.available > 0),
    });
  }, [product, images, variants]);

  const variant = useMemo(() => {
    if (!axes.length) return variants[0];
    return variants.find((v: PublicVariant) =>
      axes.every((a: VariantAxis) => v.options[a.id] === selection[a.id]),
    );
  }, [axes, variants, selection]);

  const price = variant?.price ?? product.price;
  const promo = variant ? variant.promo_price : product.promo_price;
  const available = variant?.available ?? 0;
  const maxQty = Math.max(1, Math.min(available, MAX_LINE_QTY));
  const off = discountPercent(price, promo);
  const name = pickLocale(product, "name", locale);
  const description = pickLocale(product, "description", locale);
  const category = categories.find((c) => c.id === product.category_id);
  const parent = category?.parent_id
    ? categories.find((c) => c.id === category.parent_id)
    : undefined;

  function choose(axisId: string, optionId: string) {
    const next = { ...selection, [axisId]: optionId };
    if (variants.some((v: PublicVariant) => matches(v, next))) {
      setSelection(next);
    } else {
      const fallback =
        variants.find((v: PublicVariant) => v.options[axisId] === optionId && v.available > 0) ??
        variants.find((v: PublicVariant) => v.options[axisId] === optionId);
      if (fallback) setSelection({ ...fallback.options });
    }
    setQty(1);
  }

  function optionState(axisId: string, optionId: string) {
    const candidates = variants.filter((v: PublicVariant) =>
      matches(v, { ...selection, [axisId]: optionId }),
    );
    if (!candidates.length) return "unavailable" as const;
    return candidates.some((v: PublicVariant) => v.available > 0)
      ? ("ok" as const)
      : ("soldout" as const);
  }

  function addToCart() {
    if (!variant) return;
    const n = Math.min(qty, maxQty);
    cart.add(
      {
        variantId: variant.id,
        productId: product.id,
        slug: product.slug,
        name_fr: product.name_fr,
        name_ar: product.name_ar,
        label_fr: variant.label_fr,
        label_ar: variant.label_ar,
        image: images[0]?.url ?? null,
        unitPrice: variant.promo_price ?? variant.price,
      },
      n,
    );
    toast.success(tr("Ajouté au panier", "أضيف إلى السلة"), {
      description: [name, locale === "ar" ? variant.label_ar : variant.label_fr]
        .filter(Boolean)
        .join(" — "),
    });
  }

  function buyNow() {
    if (!variant || available <= 0) return;
    addToCart();
    navigate({ to: "/cart" });
  }

  const productJsonLd = useMemo(
    () =>
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name_fr,
        description: (product.description_fr ?? "").slice(0, 500),
        image: images.map((i) => i.url),
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        sku: variant?.sku ?? product.sku,
        offers: {
          "@type": "Offer",
          priceCurrency: "TND",
          price: (promo ?? price).toFixed(3),
          availability:
            available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        },
        ...(product.rating_count > 0
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: product.rating_avg.toFixed(1),
                reviewCount: product.rating_count,
              },
            }
          : {}),
      }),
    [product, images, variant, promo, price, available],
  );

  return (
    <StoreLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLd }} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <nav
          className="mb-5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          aria-label={tr("Fil d'Ariane", "مسار التنقل")}
        >
          <Link to="/" className="hover:text-foreground">
            {tr("Accueil", "الرئيسية")}
          </Link>
          <span>/</span>
          <Link to="/shop" className="hover:text-foreground">
            {tr("Boutique", "المتجر")}
          </Link>
          {parent && (
            <>
              <span>/</span>
              <Link to="/shop" search={{ c: parent.slug }} className="hover:text-foreground">
                {pickLocale(parent, "name", locale)}
              </Link>
            </>
          )}
          {category && (
            <>
              <span>/</span>
              <Link to="/shop" search={{ c: category.slug }} className="hover:text-foreground">
                {pickLocale(category, "name", locale)}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-2xl border bg-primary-soft">
              {images[imageIndex] ? (
                <img
                  src={images[imageIndex]!.url}
                  alt={images[imageIndex]!.alt ?? name}
                  width={900}
                  height={900}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center font-display text-8xl font-bold text-primary/20">
                  {name.charAt(0)}
                </span>
              )}
              {off > 0 && (
                <span className="absolute start-3 top-3 rounded-md bg-highlight px-2.5 py-1 text-sm font-bold text-highlight-foreground">
                  -{off}%
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {images.map((img: ProductImage, i: number) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setImageIndex(i)}
                    className={cn(
                      "h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2",
                      i === imageIndex
                        ? "border-primary"
                        : "border-transparent opacity-70 hover:opacity-100",
                    )}
                    aria-label={tr(`Photo ${i + 1}`, `صورة ${i + 1}`)}
                  >
                    <img
                      src={img.url}
                      alt=""
                      width={80}
                      height={80}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              {product.brand && (
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {product.brand}
                </p>
              )}
              <h1 className="text-3xl font-bold leading-tight md:text-4xl">{name}</h1>
              {product.rating_count > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Stars value={product.rating_avg} /> {product.rating_avg.toFixed(1)} ·{" "}
                  {product.rating_count} {tr("avis", "تقييم")}
                </p>
              )}
            </div>

            <PriceTag price={price} promo={promo} size="lg" />

            {axes.map((axis: VariantAxis) => {
              const selected = axis.options.find((o: FacetOption) => o.id === selection[axis.id]);
              return (
                <div key={axis.id} className="space-y-2">
                  <p className="text-sm font-medium">
                    {pickLocale(axis, "name", locale)}
                    {selected && (
                      <span className="text-muted-foreground">
                        {" "}
                        :{" "}
                        {(locale === "ar" && selected.label_ar) ||
                          selected.label_fr ||
                          selected.value}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {axis.options.map((o: FacetOption) => {
                      const state = optionState(axis.id, o.id);
                      const on = selection[axis.id] === o.id;
                      const label = (locale === "ar" && o.label_ar) || o.label_fr || o.value;
                      if (axis.type === "color") {
                        return (
                          <button
                            key={o.id}
                            type="button"
                            title={label}
                            aria-label={label}
                            aria-pressed={on}
                            onClick={() => choose(axis.id, o.id)}
                            className={cn(
                              "relative grid h-10 w-10 place-items-center rounded-full border-2 transition",
                              on ? "border-primary" : "border-border hover:border-primary/50",
                              state !== "ok" && "opacity-50",
                            )}
                          >
                            <span
                              className="h-7 w-7 rounded-full border"
                              style={{ backgroundColor: o.color_hex ?? undefined }}
                            />
                          </button>
                        );
                      }
                      return (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => choose(axis.id, o.id)}
                          className={cn(
                            "min-w-12 rounded-lg border px-3 py-2 text-sm font-medium transition",
                            on
                              ? "border-primary bg-primary-soft text-primary"
                              : "bg-card hover:border-primary/50",
                            state !== "ok" && "text-muted-foreground line-through decoration-1",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <StockLine variant={variant} />

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-lg border">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={qty <= 1}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label={tr("Diminuer", "إنقاص")}
                >
                  <Minus />
                </Button>
                <span className="w-10 text-center font-medium tabular-nums" aria-live="polite">
                  {qty}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={qty >= maxQty}
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  aria-label={tr("Augmenter", "زيادة")}
                >
                  <Plus />
                </Button>
              </div>
              <Button
                size="lg"
                className="flex-1"
                disabled={!variant || available <= 0}
                onClick={addToCart}
              >
                <ShoppingBag />{" "}
                {!variant
                  ? tr("Combinaison indisponible", "هذا الاختيار غير متوفر")
                  : available <= 0
                    ? tr("Épuisé", "نفد المخزون")
                    : tr("Ajouter au panier", "أضف إلى السلة")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                disabled={!variant || available <= 0}
                onClick={buyNow}
              >
                <Zap className="h-4 w-4" />
                {tr("Acheter maintenant", "اشترِ الآن")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={async () => {
                  const added = await wishlist.toggle(product.id);
                  toast.success(
                    added
                      ? tr("Ajouté aux favoris", "أضيف إلى المفضلة")
                      : tr("Retiré des favoris", "تمت الإزالة من المفضلة"),
                  );
                }}
                aria-label={tr("Favoris", "المفضلة")}
                className={cn(savedInWish && "border-rose-300 text-rose-600")}
              >
                <Heart className={cn("h-4 w-4", savedInWish && "fill-current")} />
              </Button>
            </div>
            {cart.ready && cart.count > 0 && (
              <Link to="/cart" className="block text-sm font-medium text-primary hover:underline">
                {tr(`Voir mon panier (${cart.count})`, `عرض سلتي (${cart.count})`)} →
              </Link>
            )}

            <ul className="grid gap-2 rounded-2xl border bg-muted/40 p-4 text-sm sm:grid-cols-3">
              <li className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" />{" "}
                {tr("Paiement à la livraison", "الدفع عند الاستلام")}
              </li>
              <li className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />{" "}
                {tr("Livraison partout en Tunisie", "توصيل لكامل تونس")}
              </li>
              <li className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-primary" /> {tr("Retours simples", "إرجاع سهل")}
              </li>
            </ul>

            {description && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">{tr("Description", "الوصف")}</h2>
                <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-lg font-semibold">{tr("Caractéristiques", "الخصائص")}</h2>
              <dl className="divide-y rounded-xl border text-sm">
                {product.model && <SpecRow k={tr("Modèle", "الطراز")} v={product.model} />}
                {specs.map((s: Spec) => (
                  <SpecRow
                    key={s.name_fr}
                    k={pickLocale(s, "name", locale)}
                    v={locale === "ar" ? s.value_ar : s.value_fr}
                  />
                ))}
                {product.warranty && (
                  <SpecRow k={tr("Garantie", "الضمان")} v={product.warranty} icon />
                )}
                <SpecRow k={tr("Référence", "المرجع")} v={variant?.sku ?? product.sku} />
              </dl>
            </section>
          </div>
        </div>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold">{tr("Avis clients", "آراء الحرفاء")}</h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {tr(
                "Aucun avis pour le moment. Les clients ayant reçu ce produit pourront donner leur avis.",
                "لا توجد تقييمات بعد. يمكن للحرفاء الذين استلموا المنتج إضافة تقييمهم.",
              )}
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {reviews.map((r: Review) => (
                <li key={r.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Stars value={r.rating} />
                    <span className="text-xs text-muted-foreground">
                      {formatDate(r.created_at, locale)}
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium">
                    {r.author_name || tr("Client", "حريف")}
                    {r.is_verified && (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <BadgeCheck className="h-3.5 w-3.5" /> {tr("Achat vérifié", "شراء مؤكد")}
                      </span>
                    )}
                  </p>
                  {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-5 text-2xl font-semibold">
              {tr("Vous aimerez aussi", "قد يعجبك أيضاً")}
            </h2>
            <ProductGrid products={related} />
          </section>
        )}
      </div>
    </StoreLayout>
  );
}

function StockLine({ variant }: { variant: PublicVariant | undefined }) {
  const { tr } = useI18n();
  if (!variant)
    return (
      <p className="text-sm text-muted-foreground">
        {tr(
          "Cette combinaison n'existe pas. Choisissez une autre option.",
          "هذا الاختيار غير موجود. اختر خياراً آخر.",
        )}
      </p>
    );
  if (variant.available <= 0)
    return (
      <p className="text-sm font-medium text-destructive">
        {tr("Épuisé pour le moment", "نفد المخزون حالياً")}
      </p>
    );
  if (variant.available <= 5)
    return (
      <p className="text-sm font-medium text-highlight">
        {tr(`Plus que ${variant.available} en stock`, `بقي ${variant.available} فقط في المخزون`)}
      </p>
    );
  return <p className="text-sm font-medium text-success">{tr("En stock", "متوفر")}</p>;
}

function SpecRow({ k, v, icon }: { k: string; v: string; icon?: boolean }) {
  return (
    <div className="flex gap-4 px-4 py-2.5">
      <dt className="w-36 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="flex items-center gap-1.5 font-medium">
        {icon && <ShieldCheck className="h-4 w-4 text-primary" />}
        {v}
      </dd>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= Math.round(value) ? "fill-warning text-warning" : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
