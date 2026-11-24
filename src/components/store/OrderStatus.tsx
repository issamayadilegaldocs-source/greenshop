import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  TIMELINE_STEPS,
  orderStatusBadgeClass,
  paymentStatusBadgeClass,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/orders";
import { cn } from "@/lib/utils";

export function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const { tr } = useI18n();
  const key = status as OrderStatus;
  const label = ORDER_STATUS_LABELS[key] ?? [status, status];
  return (
    <Badge className={cn("border-0 font-medium", orderStatusBadgeClass(key))}>
      {tr(label[0], label[1])}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus | string }) {
  const { tr } = useI18n();
  const key = status as PaymentStatus;
  const label = PAYMENT_STATUS_LABELS[key] ?? [status, status];
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", paymentStatusBadgeClass(key))}>
      {tr(label[0], label[1])}
    </Badge>
  );
}

export function OrderTimeline({
  status,
  history,
}: {
  status: OrderStatus | string;
  history?: { to_status: string; created_at: string }[];
}) {
  const { tr, locale } = useI18n();
  const current = status as OrderStatus;
  const byStatus = new Map((history ?? []).map((h) => [h.to_status, h.created_at]));

  if (current === "cancelled" || current === "returned") {
    return (
      <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">
        <OrderStatusBadge status={current} />
        {byStatus.get(current) && (
          <p className="mt-1 text-muted-foreground">{formatDate(byStatus.get(current), locale, true)}</p>
        )}
      </div>
    );
  }

  const activeIdx = Math.max(
    0,
    TIMELINE_STEPS.findIndex((s) => s === current),
  );

  return (
    <ol className="space-y-3">
      {TIMELINE_STEPS.map((step, i) => {
        const done = i <= activeIdx;
        const at = byStatus.get(step);
        const [fr, ar] = ORDER_STATUS_LABELS[step];
        return (
          <li key={step} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", !done && "text-muted-foreground")}>
                {tr(fr, ar)}
              </p>
              {at && (
                <p className="text-xs text-muted-foreground">{formatDate(at, locale, true)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
