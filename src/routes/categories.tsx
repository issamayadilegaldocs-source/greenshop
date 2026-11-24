import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { StoreLayout } from "@/components/store/StoreLayout";
import { publicCategoriesQuery, type PublicCategory } from "@/lib/catalog.functions";
import { pickLocale, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Collections — Maison Noura" },
      {
        name: "description",
        content: "Parcourez les collections de vêtements Maison Noura.",
      },
      { property: "og:title", content: "Collections — Maison Noura" },
      { property: "og:description", content: "Toutes les collections de vêtements Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicCategoriesQuery()),
  component: CategoriesPage,
});

function Children({
  all,
  parentId,
  depth,
}: {
  all: PublicCategory[];
  parentId: string;
  depth: number;
}) {
  const { locale } = useI18n();
  const kids = all.filter((c) => c.parent_id === parentId);
  if (!kids.length) return null;
  return (
    <ul
      className={
        depth === 0
          ? "mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2"
          : "ms-4 mt-1 space-y-1 border-s ps-3"
      }
    >
      {kids.map((k) => (
        <li key={k.id}>
          <Link
            to="/shop"
            search={{ c: k.slug }}
            className={
              depth === 0
                ? "text-sm font-medium hover:text-primary"
                : "text-sm text-muted-foreground hover:text-primary"
            }
          >
            {pickLocale(k, "name", locale)}
          </Link>
          <Children all={all} parentId={k.id} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

function CategoriesPage() {
  const { t, locale } = useI18n();
  const { data: categories } = useSuspenseQuery(publicCategoriesQuery());
  const roots = categories.filter((c) => !c.parent_id);

  return (
    <StoreLayout>
      <div className="mx-auto max-w-7xl px-4 py-12">
        <h1 className="text-3xl font-bold md:text-4xl">{t("categories.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("categories.subtitle")}</p>
        {roots.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
            {t("home.categories.empty")}
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {roots.map((c) => (
              <section
                key={c.id}
                id={c.slug}
                className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card shadow-card"
              >
                <div className="flex gap-4 p-5">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-primary-soft">
                    {c.image_url ? (
                      <img
                        src={c.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center font-display text-3xl font-bold text-primary/30">
                        {pickLocale(c, "name", locale).charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold">
                      <Link to="/shop" search={{ c: c.slug }} className="hover:text-primary">
                        {pickLocale(c, "name", locale)}
                      </Link>
                    </h2>
                    {pickLocale(c, "description", locale) && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {pickLocale(c, "description", locale)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="border-t px-5 pb-5">
                  <Children all={categories} parentId={c.id} depth={0} />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
