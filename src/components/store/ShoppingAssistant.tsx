import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Bot,
  ExternalLink,
  Loader2,
  Package,
  RotateCcw,
  Send,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getAssistantStatus, sendAssistantMessage } from "@/lib/ai-assistant.functions";
import type { AssistantOrderCard, AssistantProductCard } from "@/lib/ai-assistant.schema";
import { useCart } from "@/lib/cart";
import { formatTND } from "@/lib/format";
import { pickLocale, useI18n } from "@/lib/i18n";
import { OrderStatusBadge } from "@/components/store/OrderStatus";
import type { OrderStatus } from "@/lib/orders";
import { cn } from "@/lib/utils";

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: AssistantProductCard[];
  orders?: AssistantOrderCard[];
  quickReplies?: string[];
};

const STARTERS_FR = [
  "Idée cadeau moins de 150 DT",
  "Meilleures promos",
  "Frais de livraison & COD",
  "Suivre ma commande",
];

const STARTERS_AR = [
  "فكرة هدية أقل من 150 د.ت",
  "أفضل العروض",
  "رسوم التوصيل والدفع",
  "تتبع طلبيتي",
];

export function ShoppingAssistant() {
  const { tr, locale } = useI18n();
  const cart = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const statusQuery = useQuery({
    queryKey: ["public", "assistant-status"],
    queryFn: () => getAssistantStatus(),
    staleTime: 5 * 60_000,
  });

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, sending, open]);

  if (statusQuery.data && !statusQuery.data.enabled) return null;

  const welcomeText = tr(
    "Bonjour ! Je suis le conseiller IA de Maison Noura. Demandez-moi un produit, une idée cadeau selon votre budget, les frais de livraison ou le suivi de votre commande.",
    "مرحباً! أنا مستشار التسوق الذكي في دار نورة. اسألني عن أي منتج، فكرة هدية حسب ميزانيتك، رسوم التوصيل أو تتبع طلبيتك.",
  );

  const starters = locale === "ar" ? STARTERS_AR : STARTERS_FR;

  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text || sending) return;

    const userMsg: ChatEntry = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const nextHistory = [...entries, userMsg];
    setEntries(nextHistory);
    setInput("");
    setSending(true);

    try {
      const res = await sendAssistantMessage({
        data: {
          locale,
          currentPath: pathname,
          messages: nextHistory.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        },
      });

      if (!res.ok) {
        setEntries((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: res.error,
          },
        ]);
        return;
      }

      setEntries((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.reply,
          products: res.products,
          orders: res.orders,
          quickReplies: res.quickReplies,
        },
      ]);
    } catch {
      setEntries((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: tr(
            "Désolé, une erreur momentanée s'est produite. Réessayez dans un instant.",
            "عذراً، حدث خطأ مؤقت. حاول مجدداً بعد لحظة.",
          ),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendText(input);
  }

  function handleAddToCart(p: AssistantProductCard) {
    if (!p.defaultVariantId || !p.in_stock) return;
    const unitPrice = p.promo_price != null && p.promo_price < p.price ? p.promo_price : p.price;
    cart.add(
      {
        variantId: p.defaultVariantId,
        productId: p.id,
        slug: p.slug,
        name_fr: p.name_fr,
        name_ar: p.name_ar,
        label_fr: p.variantLabelFr,
        label_ar: p.variantLabelAr,
        image: p.image,
        unitPrice,
      },
      1,
    );
    toast.success(
      tr(`${p.name_fr} ajouté au panier`, `تمت إضافة ${p.name_ar || p.name_fr} إلى السلة`),
    );
  }

  return (
    <div className="fixed bottom-5 end-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label={tr("Assistant Shopping IA", "مساعد التسوق الذكي")}
          className="flex h-[min(560px,calc(100vh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {tr("Assistant Maison Noura", "مساعد دار نورة")}
                </p>
                <p className="text-[11px] opacity-85">
                  {tr("Catalogue en direct & suivi COD", "الكتالوج المباشر وتتبع الطلبات")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEntries([])}
                  aria-label={tr("Nouvelle conversation", "محادثة جديدة")}
                  className="rounded-lg p-1.5 opacity-80 transition hover:bg-primary-foreground/15 hover:opacity-100"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tr("Fermer", "إغلاق")}
                className="rounded-lg p-1.5 opacity-80 transition hover:bg-primary-foreground/15 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3.5 text-sm">
            {/* Initial greeting */}
            <div className="flex items-start gap-2">
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="space-y-2.5 rounded-2xl rounded-ts-sm bg-muted/70 px-3.5 py-2.5 text-foreground">
                <p className="leading-relaxed">{welcomeText}</p>
                {entries.length === 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {starters.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendText(s)}
                        className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {entries.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-2",
                  msg.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 leading-relaxed",
                    msg.role === "user"
                      ? "rounded-te-sm bg-primary text-primary-foreground"
                      : "rounded-ts-sm bg-muted/70 text-foreground",
                  )}
                >
                  {msg.content}
                </div>

                {/* Live Product Cards */}
                {msg.products && msg.products.length > 0 && (
                  <div className="w-full space-y-2">
                    {msg.products.map((p) => {
                      const title = pickLocale(p, "name", locale);
                      const hasPromo = p.promo_price != null && p.promo_price < p.price;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-2.5 rounded-xl border bg-background p-2 shadow-xs"
                        >
                          <Link
                            to="/product/$slug"
                            params={{ slug: p.slug }}
                            onClick={() => setOpen(false)}
                            className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted"
                          >
                            {p.image ? (
                              <img
                                src={p.image}
                                alt={title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-muted-foreground">
                                <ShoppingBag className="h-5 w-5" />
                              </div>
                            )}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link
                              to="/product/$slug"
                              params={{ slug: p.slug }}
                              onClick={() => setOpen(false)}
                              className="line-clamp-1 text-xs font-semibold hover:text-primary"
                            >
                              {title}
                            </Link>
                            <div className="mt-0.5 flex items-baseline gap-1.5">
                              <span className="text-xs font-bold text-primary">
                                {formatTND(hasPromo ? p.promo_price! : p.price)}
                              </span>
                              {hasPromo && (
                                <span className="text-[11px] text-muted-foreground line-through">
                                  {formatTND(p.price)}
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                disabled={!p.in_stock || !p.defaultVariantId}
                                onClick={() => handleAddToCart(p)}
                              >
                                <ShoppingBag className="h-3 w-3" />
                                {p.in_stock ? tr("+ Panier", "+ للسلة") : tr("Épuisé", "نفد")}
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px]"
                              >
                                <Link
                                  to="/product/$slug"
                                  params={{ slug: p.slug }}
                                  onClick={() => setOpen(false)}
                                >
                                  {tr("Voir", "عرض")}
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Live Order Status Cards */}
                {msg.orders && msg.orders.length > 0 && (
                  <div className="w-full space-y-2">
                    {msg.orders.map((o) => (
                      <div
                        key={o.order_number}
                        className="rounded-xl border bg-background p-2.5 text-xs shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-mono font-semibold">
                            <Package className="h-3.5 w-3.5 text-primary" />
                            {o.order_number}
                          </span>
                          <OrderStatusBadge status={o.status as OrderStatus} />
                        </div>
                        {o.items_summary && (
                          <p className="mt-1 line-clamp-1 text-muted-foreground">
                            {o.items_summary}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="font-semibold text-primary">
                            {formatTND(o.total)}
                            {o.city ? ` · ${o.city}` : ""}
                          </span>
                          <Link
                            to={o.source === "my_orders" ? "/my-orders" : "/track-order"}
                            onClick={() => setOpen(false)}
                            className="font-medium text-primary hover:underline"
                          >
                            {tr("Voir le détail →", "عرض التفاصيل ←")}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Follow-up suggestions */}
                {msg.quickReplies && msg.quickReplies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.quickReplies.map((qr) => (
                      <button
                        key={qr}
                        type="button"
                        disabled={sending}
                        onClick={() => sendText(qr)}
                        className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
                      >
                        {qr}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                {tr("L'assistant consulte le catalogue…", "المساعد يبحث في الكتالوج…")}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t bg-background p-2.5"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              maxLength={600}
              placeholder={tr("Posez votre question (FR / AR)…", "اطرح سؤالك هنا…")}
              className="h-9 text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !input.trim()}
              aria-label={tr("Envoyer", "إرسال")}
              className="h-9 w-9 shrink-0"
            >
              <Send className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </form>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        onClick={() => setOpen((v) => !v)}
        className="h-12 gap-2 rounded-full px-4 shadow-lg"
        aria-label={tr("Ouvrir l'assistant shopping IA", "فتح مساعد التسوق الذكي")}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold">{tr("Assistant IA", "المساعد الذكي")}</span>
            <Badge
              variant="secondary"
              className="hidden bg-primary-foreground/20 text-[10px] text-primary-foreground sm:inline-flex"
            >
              FR/AR
            </Badge>
          </>
        )}
      </Button>
    </div>
  );
}
