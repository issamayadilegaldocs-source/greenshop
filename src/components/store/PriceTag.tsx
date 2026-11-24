import { formatTND } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function discountPercent(price: number, promo: number | null) {
  if (promo == null || promo >= price || price <= 0) return 0;
  return Math.round(((price - promo) / price) * 100);
}

export function PriceTag({
  price,
  promo,
  size = "md",
  from = false,
}: {
  price: number;
  promo: number | null;
  size?: "sm" | "md" | "lg";
  from?: boolean;
}) {
  const { locale, tr } = useI18n();
  const onSale = promo != null && promo < price;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {from && (
        <span className="text-xs text-muted-foreground">{tr("à partir de", "ابتداءً من")}</span>
      )}
      <span
        className={cn(
          "font-display font-semibold",
          size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-base",
          onSale && "text-primary",
        )}
      >
        {formatTND(onSale ? promo : price, locale)}
      </span>
      {onSale && (
        <span
          className={cn(
            "text-muted-foreground line-through",
            size === "lg" ? "text-base" : "text-xs",
          )}
        >
          {formatTND(price, locale)}
        </span>
      )}
    </div>
  );
}
