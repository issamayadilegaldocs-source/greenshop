import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { PublicCategory } from "@/lib/catalog.functions";
import { pickLocale, useI18n } from "@/lib/i18n";

export function CategoryTile({ category, count }: { category: PublicCategory; count?: number }) {
  const { locale, tr } = useI18n();
  const name = pickLocale(category, "name", locale);
  return (
    <Link
      to="/shop"
      search={{ c: category.slug }}
      className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border bg-primary-soft shadow-card transition hover:-translate-y-0.5"
    >
      {category.image_url ? (
        <img
          src={category.image_url}
          alt={name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center font-display text-7xl font-bold text-primary/15">
          {name.charAt(0)}
        </span>
      )}
      <div className="relative m-3 flex items-center justify-between gap-2 rounded-xl bg-background/95 px-3 py-2.5 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold">{name}</p>
          {count !== undefined && count > 0 && (
            <p className="text-xs text-muted-foreground">
              {count} {tr("sous-catégories", "أقسام فرعية")}
            </p>
          )}
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5 rtl:-scale-x-100" />
      </div>
    </Link>
  );
}
