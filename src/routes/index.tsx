import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Banknote,
  Loader2,
  Mail,
  PackageCheck,
  Quote,
  RotateCcw,
  Ruler,
  ShoppingBag,
  Star,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoreLayout } from "@/components/store/StoreLayout";
import { CategoryTile } from "@/components/store/CategoryTile";
import {
  homepageSectionsQuery,
  publicCategoriesQuery,
  storeSettingsQuery,
  subscribeNewsletter,
  type PublicHomepageSection,
} from "@/lib/catalog.functions";
import { homeProductsQuery, type ProductCardData } from "@/lib/shop.functions";
import { ProductGrid } from "@/components/store/ProductCard";
import { useRecentlyViewed } from "@/lib/wishlist";
import { pickLocale, useI18n } from "@/lib/i18n";
import { dbErrorMessage } from "@/lib/format";
import heroImage from "@/assets/hero-flatlay.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maison Noura — Mode, Audio, Électroménager & Maison" },
      {
        name: "description",
        content:
          "Mode, audio, petit électroménager et objets pour la maison, livrés partout en Tunisie avec paiement à la réception.",
      },
      { property: "og:title", content: "Maison Noura — Mode, Audio, Électroménager & Maison" },
      {
        property: "og:description",
        content:
          "Découvrez nos sélections mode, audio, électroménager et déco, avec livraison partout en Tunisie.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(publicCategoriesQuery()),
      context.queryClient.ensureQueryData(storeSettingsQuery()),
      context.queryClient.ensureQueryData(homeProductsQuery()),
      context.queryClient.ensureQueryData(homepageSectionsQuery()),
    ]);
  },
  component: Index,
});

function Index() {
  const { t, tr, locale } = useI18n();
  const { data: categories } = useSuspenseQuery(publicCategoriesQuery());
  const { data: home } = useSuspenseQuery(homeProductsQuery());
  const { data: cmsSections } = useSuspenseQuery(homepageSectionsQuery());
  const recent = useRecentlyViewed();

  const roots = categories.filter((c) => !c.parent_id);
  const collections =
    roots.length === 1 ? categories.filter((c) => c.parent_id === roots[0]?.id) : roots;

  const sectionMap = new Map<string, PublicHomepageSection>(
    (cmsSections ?? []).map((s) => [s.section_key, s]),
  );
  const isSectionOn = (key: string) => sectionMap.get(key)?.is_enabled ?? true;
  const sectionTitle = (key: string, fallbackFr: string, fallbackAr: string) => {
    const s = sectionMap.get(key);
    return s ? pickLocale(s, "title", locale) : tr(fallbackFr, fallbackAr);
  };
  const sectionSub = (key: string, fallbackFr: string, fallbackAr: string) => {
    const s = sectionMap.get(key);
    const val = s ? (locale === "ar" ? s.subtitle_ar : s.subtitle_fr) : null;
    return val || tr(fallbackFr, fallbackAr);
  };

  // Discounted products for Special Offers
  const promoProducts = [...home.featured, ...home.newest, ...home.best.items]
    .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
    .filter((p) => p.promo_price != null && p.promo_price < p.price);

  const perks = [
    { icon: Banknote, title: t("home.perk.cod"), desc: t("home.perk.cod.desc") },
    { icon: Truck, title: t("home.perk.delivery"), desc: t("home.perk.delivery.desc") },
    { icon: RotateCcw, title: t("home.perk.returns"), desc: t("home.perk.returns.desc") },
  ];

  const orderedKeys =
    cmsSections && cmsSections.length > 0
      ? cmsSections.filter((s) => s.is_enabled).map((s) => s.section_key)
      : [
          "hero_banner",
          "featured_categories",
          "best_sellers",
          "special_offers",
          "new_arrivals",
          "recently_viewed",
          "testimonials",
          "newsletter",
        ];

  return (
    <StoreLayout>
      {isSectionOn("hero_banner") && (
        <>
          <section className="relative isolate overflow-hidden border-b bg-ink">
            <img
              src={heroImage}
              alt=""
              width={1600}
              height={1008}
              className="absolute inset-0 h-full w-full object-cover object-right opacity-90 rtl:-scale-x-100"
            />
            <div aria-hidden className="bg-hero-overlay absolute inset-0 rtl:-scale-x-100" />
            <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
              <div className="max-w-xl">
                <span className="label-stamp inline-flex items-center gap-2 rounded-full border border-brass/50 bg-ink/60 px-3 py-1 text-xs text-brass">
                  <ShoppingBag className="h-3.5 w-3.5" />{" "}
                  {tr("La nouvelle collection", "تشكيلة الموسم")}
                </span>
                <h1 className="mt-5 text-4xl font-bold leading-[1.05] text-ink-foreground md:text-6xl">
                  {sectionTitle(
                    "hero_banner",
                    t("home.hero.title"),
                    "أساسيات الأناقة والمنزل لكل يوم",
                  )}
                </h1>
                <p className="mt-5 max-w-md text-base text-ink-foreground/80 md:text-lg">
                  {sectionSub(
                    "hero_banner",
                    t("home.hero.subtitle"),
                    "أزياء، صوتيات، أجهزة منزلية وديكور بتوصيل إلى 24 ولاية",
                  )}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    asChild
                    size="lg"
                    className="bg-highlight text-highlight-foreground hover:bg-highlight/90"
                  >
                    <Link to="/shop">{tr("Voir la boutique", "تصفح المتجر")}</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-ink-foreground/50 bg-ink/30 text-ink-foreground hover:bg-ink/60"
                  >
                    <Link to="/categories">{t("home.hero.cta")}</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4">
            <div className="relative -mt-8 grid gap-3 rounded-2xl border bg-card p-4 shadow-card sm:grid-cols-3">
              {perks.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-3 rounded-xl p-2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {orderedKeys
        .filter((k) => k !== "hero_banner")
        .map((key) => {
          if (key === "featured_categories") {
            return (
              <section key={key} className="mx-auto max-w-7xl px-4 pt-16">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold md:text-3xl">
                      {sectionTitle("featured_categories", t("home.categories.title"), "أقسامنا")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {sectionSub("featured_categories", "Explorez nos univers", "اكتشف أقسامنا")}
                    </p>
                  </div>
                  {roots.length > 0 && (
                    <Link
                      to="/categories"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {t("categories.title")} →
                    </Link>
                  )}
                </div>
                {collections.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
                    {t("home.categories.empty")}
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {collections.map((c) => (
                      <CategoryTile key={c.id} category={c} />
                    ))}
                  </div>
                )}
              </section>
            );
          }

          if (key === "best_sellers") {
            return (
              <ProductSection
                key={key}
                title={sectionTitle("best_sellers", "Sélection phare", "الأكثر مبيعاً")}
                subtitle={sectionSub(
                  "best_sellers",
                  "Les pièces préférées de nos clients",
                  "المنتجات المفضلة لدى حرفائنا",
                )}
                products={home.featured.length ? home.featured : home.best.items}
                search={{ sort: "popular" }}
              />
            );
          }

          if (key === "special_offers") {
            return (
              <ProductSection
                key={key}
                title={sectionTitle("special_offers", "Offres spéciales", "عروض خاصة")}
                subtitle={sectionSub(
                  "special_offers",
                  "Profitez de nos remises du moment",
                  "استفد من تخفيضاتنا الحالية",
                )}
                products={promoProducts}
                search={{ sort: "price_asc" }}
              />
            );
          }

          if (key === "new_arrivals") {
            return (
              <ProductSection
                key={key}
                title={sectionTitle("new_arrivals", "Nouveautés", "وصل حديثاً")}
                subtitle={sectionSub(
                  "new_arrivals",
                  "Derniers arrivages prêts à expédier",
                  "أحدث المنتجات الجاهزة للشحن",
                )}
                products={home.newest}
                search={{ sort: "new" }}
              />
            );
          }

          if (key === "recently_viewed") {
            if (recent.length === 0) return null;
            return (
              <ProductSection
                key={key}
                title={sectionTitle("recently_viewed", "Récemment consultés", "شاهدتها مؤخراً")}
                subtitle={sectionSub(
                  "recently_viewed",
                  "Reprenez là où vous vous êtes arrêté",
                  "تابع التصفح من حيث توقفت",
                )}
                products={recent}
                search={{ sort: "relevance" }}
              />
            );
          }

          if (key === "testimonials") {
            return (
              <section key={key} className="mx-auto max-w-7xl px-4 pt-20">
                <div className="mb-6">
                  <p className="label-stamp text-xs text-primary">
                    {tr("Confiance vérifiée", "ثقة مضمونة")}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold md:text-3xl">
                    {sectionTitle("testimonials", "Avis de nos clients", "آراء حرفائنا")}
                  </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    {
                      name: "Amira B. — Tunis",
                      text: tr(
                        "Commande reçue en 24h à Tunis, emballage soigné et paiement à la livraison très rassurant.",
                        "وصلت الطلبية في 24 ساعة بتونس، تغليف ممتاز والدفع عند الاستلام مريح جداً.",
                      ),
                    },
                    {
                      name: "Mehdi K. — Sousse",
                      text: tr(
                        "Excellente qualité sur la machine espresso et suivi clair de la commande du début à la fin.",
                        "جودة رائعة لماكينة القهوة وتتبع واضح للطلبية من البداية إلى الاستلام.",
                      ),
                    },
                    {
                      name: "Ines M. — Sfax",
                      text: tr(
                        "Service client réactif et articles exactement conformes aux photos. Je recommande Maison Noura.",
                        "خدمة حرفاء سريعة ومنتجات مطابقة تماماً للصور. أنصح بدار نورة.",
                      ),
                    },
                  ].map((rev) => (
                    <div key={rev.name} className="rounded-2xl border bg-card p-5 shadow-card">
                      <div className="flex items-center justify-between">
                        <div className="flex gap-0.5 text-warning">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-current" />
                          ))}
                        </div>
                        <Quote className="h-5 w-5 text-primary/20" />
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        « {rev.text} »
                      </p>
                      <p className="mt-4 text-xs font-semibold">{rev.name}</p>
                    </div>
                  ))}
                </div>

                {/* How it works strip */}
                <ol className="mt-10 grid gap-4 md:grid-cols-3">
                  {[
                    {
                      icon: Ruler,
                      title: tr("Choisissez vos options", "اختر المواصفات"),
                      text: tr(
                        "Comparez les couleurs, tailles et caractéristiques disponibles.",
                        "قارن الألوان والمقاسات والمواصفات المتوفرة.",
                      ),
                    },
                    {
                      icon: ShoppingBag,
                      title: tr("Ajoutez vos articles", "أضف منتجاتك"),
                      text: tr(
                        "Sélectionnez la quantité souhaitée, à l'unité.",
                        "حدد الكمية التي تريدها بالقطعة.",
                      ),
                    },
                    {
                      icon: PackageCheck,
                      title: tr("Commandez sereinement", "أكمل طلبك بسهولة"),
                      text: tr(
                        "Payez à la livraison, partout en Tunisie.",
                        "ادفع عند الاستلام أينما كنت في تونس.",
                      ),
                    },
                  ].map(({ icon: Icon, title, text }, index) => (
                    <li key={title} className="rounded-2xl border bg-card p-5 shadow-card">
                      <div className="flex items-center justify-between">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="font-display text-4xl font-semibold text-primary/20">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <h3 className="mt-4 font-semibold">{title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            );
          }

          if (key === "newsletter") {
            return (
              <NewsletterSection
                key={key}
                title={sectionTitle(
                  "newsletter",
                  "Restez informé de nos arrivages",
                  "اشترك في نشرتنا البريدية",
                )}
                subtitle={sectionSub(
                  "newsletter",
                  "Recevez nos offres privées et nouveaux produits en avant-première",
                  "احصل على عروضنا الخاصة وأحدث المنتجات أولاً",
                )}
              />
            );
          }

          return null;
        })}
    </StoreLayout>
  );
}

function NewsletterSection({ title, subtitle }: { title: string; subtitle: string }) {
  const { tr, locale } = useI18n();
  const [email, setEmail] = useState("");
  const sub = useMutation({
    mutationFn: () => subscribeNewsletter({ data: { email, locale } }),
    onSuccess: () => {
      setEmail("");
      toast.success(
        tr("Inscription confirmée ! Merci de votre confiance.", "تم الاشتراك بنجاح! شكراً لثقتك."),
      );
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    sub.mutate();
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pt-20">
      <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border bg-primary-soft/60 p-8 md:flex-row md:items-center md:p-10">
        <div className="max-w-xl space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Mail className="h-4 w-4" />
            {tr("Newsletter Maison Noura", "النشرة البريدية لدار نورة")}
          </div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <form onSubmit={onSubmit} className="flex w-full max-w-md gap-2">
          <Input
            type="email"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.tn"
            className="bg-background"
          />
          <Button type="submit" disabled={sub.isPending}>
            {sub.isPending && <Loader2 className="animate-spin" />}
            {tr("S'inscrire", "اشترك")}
          </Button>
        </form>
      </div>
    </section>
  );
}

function ProductSection({
  title,
  subtitle,
  products,
  search,
}: {
  title: string;
  subtitle?: string;
  products: ProductCardData[];
  search: { sort: "relevance" | "new" | "popular" | "price_asc" };
}) {
  const { tr } = useI18n();
  if (!products.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Link
          to="/shop"
          search={search}
          className="text-sm font-medium text-primary hover:underline"
        >
          {tr("Tout voir", "عرض الكل")} →
        </Link>
      </div>
      <ProductGrid products={products.slice(0, 8)} />
    </section>
  );
}
