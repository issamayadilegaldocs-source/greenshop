import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatDate, formatTND } from "@/lib/format";
import { RETURN_STATUS_LABELS, type ReturnStatus } from "@/lib/orders";

export const Route = createFileRoute("/_authenticated/admin/returns")({
  head: () => ({
    meta: [
      { title: "Retours — Maison Noura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminReturnsPage,
});

const ALL = "__all__";

type ReturnRow = {
  id: string;
  reference: string;
  order_id: string;
  reason: string;
  description: string | null;
  status: ReturnStatus;
  refund_amount: number;
  created_at: string;
  orders: { reference: string; customer_name: string } | null;
  return_items: {
    id: string;
    quantity: number;
    condition: string | null;
    processed_at: string | null;
    order_items: { product_name: string; variant_label: string | null } | null;
  }[];
};

const NEXT: Partial<Record<ReturnStatus, ReturnStatus[]>> = {
  requested: ["approved", "rejected"],
  approved: ["received", "rejected"],
  received: [],
  rejected: [],
  processed: [],
};

function AdminReturnsPage() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState(ALL);
  const [active, setActive] = useState<ReturnRow | null>(null);
  const [target, setTarget] = useState<ReturnStatus | null>(null);
  const [note, setNote] = useState("");
  const [processOpen, setProcessOpen] = useState(false);
  const [conditions, setConditions] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ["admin", "returns", { status }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("returns")
        .select(
          `id, reference, order_id, reason, description, status, refund_amount, created_at,
           orders(reference, customer_name),
           return_items(id, quantity, condition, processed_at, order_items(product_name, variant_label))`,
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (status !== ALL) query = query.eq("status", status as ReturnStatus);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ReturnRow[];
    },
  });

  const filtered = (list.data ?? []).filter((r) => {
    if (!debounced) return true;
    const hay = `${r.reference} ${r.orders?.reference ?? ""} ${r.orders?.customer_name ?? ""} ${r.reason}`.toLowerCase();
    return hay.includes(debounced.toLowerCase());
  });

  const updateStatus = useMutation({
    mutationFn: async () => {
      if (!active || !target) return;
      const trimmed = note.trim();
      const { error } = await supabase.rpc("update_return_status", {
        _return_id: active.id,
        _status: target,
        ...(trimmed ? { _note: trimmed } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Statut du retour mis à jour", "تم تحديث حالة الإرجاع"));
      setTarget(null);
      setNote("");
      setActive(null);
      qc.invalidateQueries({ queryKey: ["admin", "returns"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const processReturn = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const items = active.return_items
        .filter((i) => !i.processed_at)
        .map((i) => ({
          return_item_id: i.id,
          condition: conditions[i.id] || "resalable",
        }));
      const trimmed = note.trim();
      const { error } = await supabase.rpc("process_return", {
        _return_id: active.id,
        _items: items,
        ...(trimmed ? { _note: trimmed } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Retour traité", "تمت معالجة الإرجاع"));
      setProcessOpen(false);
      setActive(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "returns"] });
      qc.invalidateQueries({ queryKey: ["admin", "finances"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        icon={RotateCcw}
        title={tr("Retours", "الإرجاع")}
        description={tr(
          "Approuvez, recevez et retraitez les demandes de retour.",
          "وافقوا واستلموا وعالجوا طلبات الإرجاع.",
        )}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("Réf. retour / commande…", "مرجع الإرجاع / الطلب…")}
            className="ps-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr("Tous", "الكل")}</SelectItem>
            {(Object.keys(RETURN_STATUS_LABELS) as ReturnStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {tr(RETURN_STATUS_LABELS[s][0], RETURN_STATUS_LABELS[s][1])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !filtered.length ? (
        <EmptyState
          icon={RotateCcw}
          title={tr("Aucun retour", "لا توجد إرجاعات")}
          description={tr(
            "Les demandes de retour clients apparaîtront ici.",
            "ستظهر هنا طلبات إرجاع الحرفاء.",
          )}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono font-semibold text-primary">{r.reference}</p>
                  <p className="mt-1 text-sm">
                    {r.orders?.customer_name} ·{" "}
                    <Link
                      to="/admin/orders/$orderId"
                      params={{ orderId: r.order_id }}
                      className="text-primary hover:underline"
                    >
                      {r.orders?.reference}
                    </Link>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.created_at, locale, true)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="secondary">
                    {tr(RETURN_STATUS_LABELS[r.status][0], RETURN_STATUS_LABELS[r.status][1])}
                  </Badge>
                  {r.refund_amount > 0 && (
                    <span className="text-sm font-medium">
                      {formatTND(r.refund_amount, locale)}
                    </span>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    {(NEXT[r.status] ?? []).map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={s === "rejected" ? "destructive" : "default"}
                        onClick={() => {
                          setActive(r);
                          setTarget(s);
                          setNote("");
                        }}
                      >
                        {tr(RETURN_STATUS_LABELS[s][0], RETURN_STATUS_LABELS[s][1])}
                      </Button>
                    ))}
                    {(r.status === "approved" || r.status === "received") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setActive(r);
                          setConditions(
                            Object.fromEntries(
                              r.return_items
                                .filter((i) => !i.processed_at)
                                .map((i) => [i.id, "resalable"]),
                            ),
                          );
                          setProcessOpen(true);
                        }}
                      >
                        {tr("Traiter / restocker", "معالجة / إعادة تخزين")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <ul className="mt-3 space-y-1 border-t pt-3 text-sm text-muted-foreground">
                {r.return_items.map((i) => (
                  <li key={i.id}>
                    ×{i.quantity} {i.order_items?.product_name}
                    {i.order_items?.variant_label ? ` (${i.order_items.variant_label})` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setActive(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target
                ? tr(RETURN_STATUS_LABELS[target][0], RETURN_STATUS_LABELS[target][1])
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{tr("Note", "ملاحظة")}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTarget(null);
                setActive(null);
              }}
            >
              {tr("Annuler", "إلغاء")}
            </Button>
            <Button disabled={updateStatus.isPending} onClick={() => updateStatus.mutate()}>
              {updateStatus.isPending ? <Loader2 className="animate-spin" /> : null}
              {tr("Valider", "تأكيد")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={processOpen} onOpenChange={setProcessOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("Traiter le retour", "معالجة الإرجاع")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {active?.return_items
              .filter((i) => !i.processed_at)
              .map((i) => (
                <div key={i.id} className="rounded-xl border p-3">
                  <p className="text-sm font-medium">
                    ×{i.quantity} {i.order_items?.product_name}
                  </p>
                  <Select
                    value={conditions[i.id] ?? "resalable"}
                    onValueChange={(v) => setConditions((c) => ({ ...c, [i.id]: v }))}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="resalable">
                        {tr("Remettre en stock", "إعادة للمخزون")}
                      </SelectItem>
                      <SelectItem value="damaged">{tr("Endommagé", "تالف")}</SelectItem>
                      <SelectItem value="unsellable">{tr("Invendable", "غير قابل للبيع")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr("Note (facultatif)", "ملاحظة (اختياري)")}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessOpen(false)}>
              {tr("Annuler", "إلغاء")}
            </Button>
            <Button disabled={processReturn.isPending} onClick={() => processReturn.mutate()}>
              {processReturn.isPending ? <Loader2 className="animate-spin" /> : null}
              {tr("Traiter", "معالجة")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
