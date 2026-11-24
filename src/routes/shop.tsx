import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, SearchX, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoreLayout } from "@/components/store/StoreLayout";
import { ProductGrid } from "@/components/store/ProductCard";
import { publicCategoriesQuery, type PublicCategory } from "@/lib/catalog.functions";
import { shopQuery, type Facet, type ShopSort } from "@/lib/shop.functions";
import {
  encodeFilters,
  parseFilters,
  toShopInput,
  validateShopSearch,
  type ShopSearch,
} from "@/lib/shop-search";
import { pickLocale, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop")({
  validateSearch: validateShopSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const [res] = await Promise.all([
      context.queryClient.ensureQueryData(shopQuery(toShopInput(deps))),
      context.queryClient.ensureQueryData(publicCategoriesQuery()),
    ]);
    return {
      categoryName: res.category?.name_fr ?? null,
      categoryDescription: res.category?.description_fr ?? null,
      q: deps.q ?? null,
    };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.categoryName
      ? `${loaderData.categoryName} — Maison Noura`
      : loaderData?.q
        ? `Recherche « ${loaderData.q} » — Maison Noura`
        : "Boutique — Maison Noura";
    const description =
      loaderData?.categoryDescription ||
      "Toutes les pièces Maison Noura, livrées partout en Tunisie avec paiement à la livraison.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ShopPage,
});

const SORT_LABELS: Record<ShopSort, [string, string]> = {
  relevance: ["Pertinence", "الأكثر صلة"],
  new: ["Nouveautés", "الأحدث"],
  price_asc: ["Prix croissant", "السعر: من الأقل"],
  price_desc: ["Prix décroissant", "السعر: من الأعلى"],
  popular: ["Meilleures ventes", "الأكثر مبيعاً"],
  rating: ["Mieux notés", "الأعلى تقييماً"],
};

function ShopPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shop" });
  const { tr, locale } = useI18n();
  const { data } = useSuspenseQuery(shopQuery(toShopInput(search)));
  const { data: categories } = useSuspenseQuery(publicCategoriesQuery());
  const filters = parseFilters(search.f);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const go = (patch: { [K in keyof ShopSearch]?: ShopSearch[K] | undefined }, resetPage = true) => {
    const merged: Record<string, unknown> = { ...search, ...patch };
    if (resetPage) delete merged["page"];
    for (const k of Object.keys(merged))
      if (merged[k] === undefined || merged[k] === "") delete merged[k];
    navigate({ search: validateShopSearch(merged) });
  };

  const category = data.category;
  const children = category
    ? categories.filter((c) => c.parent_id === category.id)
    : categories.filter((c) => !c.parent_id);
  const parent = category?.parent_id
    ? categories.find((c) => c.id === category.parent_id)
    : undefined;
  const title = category
    ? pickLocale(category, "name", locale)
    : search.q
      ? tr(`Résultats pour « ${search.q} »`, `نتائج البحث عن «${search.q}»`)
      : tr("Boutique", "المتجر");
  const activeCount =
    Object.values(filters).reduce((n, v) => n + v.length, 0) +
    (search.min !== undefined ? 1 : 0) +
    (search.max !== undefined ? 1 : 0);

  const sidebar = (
    <FiltersPanel
      categories={categories}
      current={category}
      facets={data.facets}
      filters={filters}
      min={search.min}
      max={search.max}
      onCategory={(slug) => go({ c: slug, f: undefined })}
      onToggle={(attr, opt) => {
        const cur = new Set(filters[attr] ?? []);
        if (cur.has(opt)) cur.delete(opt);
        else cur.add(opt);
        go({ f: encodeFilters({ ...filters, [attr]: [...cur] }) });
      }}
      onPrice={(min, max) => go({ min, max })}
    />
  );

  return (
    <StoreLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <nav
          className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
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
              <span className="text-foreground">{pickLocale(category, "name", locale)}</span>
            </>
          )}
        </nav>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {category && pickLocale(category, "description", locale) && (
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {pickLocale(category, "description", locale)}
          </p>
        )}

        {children.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                to="/shop"
                search={{ c: c.slug }}
                className="rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium transition hover:border-primary hover:text-primary"
              >
                {pickLocale(c, "name", locale)}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">{sidebar}</aside>
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <SlidersHorizontal /> {tr("Filtres", "التصفية")}{" "}
                    {activeCount > 0 && `(${activeCount})`}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side={locale === "ar" ? "right" : "left"}
                  className="w-80 overflow-y-auto"
                >
                  <SheetHeader>
                    <SheetTitle className="text-start">{tr("Filtres", "التصفية")}</SheetTitle>
                  </SheetHeader>
                  <div className="px-4 pb-6">{sidebar}</div>
                </SheetContent>
              </Sheet>
              <p className="text-sm text-muted-foreground">
                {data.total} {data.total > 1 ? tr("produits", "منتجات") : tr("produit", "منتج")}
              </p>
              {(activeCount > 0 || search.q) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => go({ f: undefined, min: undefined, max: undefined, q: undefined })}
                >
                  <X /> {tr("Tout effacer", "مسح الكل")}
                </Button>
              )}
              <div className="ms-auto">
                <Select
                  value={search.sort ?? "relevance"}
                  onValueChange={(v) =>
                    go({ sort: v === "relevance" ? undefined : (v as ShopSort) })
                  }
                >
                  <SelectTrigger className="h-9 w-48" aria-label={tr("Trier", "ترتيب")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SORT_LABELS) as ShopSort[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {tr(SORT_LABELS[k][0], SORT_LABELS[k][1])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {data.items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-12 text-center">
                <SearchX className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">
                  {tr("Aucun produit ne correspond.", "لا توجد منتجات مطابقة.")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {tr(
                    "Essayez d'autres mots ou retirez des filtres.",
                    "جرّب كلمات أخرى أو أزل بعض عوامل التصفية.",
                  )}
                </p>
                <Button asChild variant="outline">
                  <Link to="/shop">{tr("Voir tous les produits", "عرض كل المنتجات")}</Link>
                </Button>
              </div>
            ) : (
              <ProductGrid products={data.items} />
            )}

            {pages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={data.page <= 1}
                  onClick={() => go({ page: data.page - 1 }, false)}
                  aria-label={tr("Page précédente", "الصفحة السابقة")}
                >
                  <ChevronLeft className="rtl:rotate-180" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {tr(`Page ${data.page} sur ${pages}`, `الصفحة ${data.page} من ${pages}`)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={data.page >= pages}
                  onClick={() => go({ page: data.page + 1 }, false)}
                  aria-label={tr("Page suivante", "الصفحة التالية")}
                >
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}

function FiltersPanel({
  categories,
  current,
  facets,
  filters,
  min,
  max,
  onCategory,
  onToggle,
  onPrice,
}: {
  categories: PublicCategory[];
  current: PublicCategory | null;
  facets: Facet[];
  filters: Record<string, string[]>;
  min: number | undefined;
  max: number | undefined;
  onCategory: (slug: string | undefined) => void;
  onToggle: (attr: string, opt: string) => void;
  onPrice: (min: number | undefined, max: number | undefined) => void;
}) {
  const { tr, locale } = useI18n();
  const [pmin, setPmin] = useState(min?.toString() ?? "");
  const [pmax, setPmax] = useState(max?.toString() ?? "");
  useEffect(() => {
    setPmin(min?.toString() ?? "");
    setPmax(max?.toString() ?? "");
  }, [min, max]);
  const roots = categories.filter((c) => !c.parent_id);

  function applyPrice(e: FormEvent) {
    e.preventDefault();
    const a = pmin.trim() === "" ? undefined : Number(pmin);
    const b = pmax.trim() === "" ? undefined : Number(pmax);
    onPrice(
      a !== undefined && Number.isFinite(a) && a >= 0 ? a : undefined,
      b !== undefined && Number.isFinite(b) && b >= 0 ? b : undefined,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold">{tr("Catégories", "الأقسام")}</p>
        <ul className="space-y-0.5 text-sm">
          <li>
            <button
              type="button"
              onClick={() => onCategory(undefined)}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-start hover:bg-muted",
                !current && "bg-primary-soft font-medium text-primary",
              )}
            >
              {tr("Tous les produits", "كل المنتجات")}
            </button>
          </li>
          {roots.map((r) => {
            const kids = categories.filter((c) => c.parent_id === r.id);
            const open = current && (current.id === r.id || current.parent_id === r.id);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onCategory(r.slug)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-start hover:bg-muted",
                    current?.id === r.id && "bg-primary-soft font-medium text-primary",
                  )}
                >
                  {pickLocale(r, "name", locale)}
                </button>
                {open && kids.length > 0 && (
                  <ul className="ms-3 border-s ps-2">
                    {kids.map((k) => (
                      <li key={k.id}>
                        <button
                          type="button"
                          onClick={() => onCategory(k.slug)}
                          className={cn(
                            "w-full rounded-md px-2 py-1 text-start text-muted-foreground hover:bg-muted",
                            current?.id === k.id && "font-medium text-primary",
                          )}
                        >
                          {pickLocale(k, "name", locale)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <form onSubmit={applyPrice}>
        <p className="mb-2 text-sm font-semibold">{tr("Prix (DT)", "السعر (د.ت)")}</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            placeholder={tr("Min", "من")}
            value={pmin}
            onChange={(e) => setPmin(e.target.value)}
            className="h-9"
            aria-label={tr("Prix minimum", "أدنى سعر")}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            placeholder={tr("Max", "إلى")}
            value={pmax}
            onChange={(e) => setPmax(e.target.value)}
            className="h-9"
            aria-label={tr("Prix maximum", "أعلى سعر")}
          />
        </div>
        <Button type="submit" variant="outline" size="sm" className="mt-2 w-full">
          {tr("Appliquer", "تطبيق")}
        </Button>
      </form>

      {facets.map((f) => (
        <div key={f.id}>
          <p className="mb-2 text-sm font-semibold">{pickLocale(f, "name", locale)}</p>
          <div className={cn(f.type === "color" ? "flex flex-wrap gap-2" : "space-y-1")}>
            {f.options.map((o) => {
              const on = (filters[f.id] ?? []).includes(o.id);
              const label = (locale === "ar" && o.label_ar) || o.label_fr || o.value;
              if (f.type === "color") {
                return (
                  <button
                    key={o.id}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={on}
                    onClick={() => onToggle(f.id, o.id)}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-full border-2 transition",
                      on ? "border-primary" : "border-border hover:border-primary/50",
                    )}
                  >
                    <span
                      className="h-6 w-6 rounded-full border"
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
                  onClick={() => onToggle(f.id, o.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-start text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 place-items-center rounded border",
                      on && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
