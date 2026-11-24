import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoreLayout } from "@/components/store/StoreLayout";
import {
  checkPromoCode,
  createStoreOrder,
  getCartLines,
  type CartLineInfo,
} from "@/lib/shop.functions";
import { storeSettingsQuery } from "@/lib/catalog.functions";
import { MAX_LINE_QTY, useCart } from "@/lib/cart";
import { formatTND } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { computeCartTotals } from "@/lib/cart-totals";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Mon panier — Maison Noura" },
      {
        name: "description",
        content:
          "Vérifiez votre sélection Maison Noura avant de commander. Paiement à la livraison partout en Tunisie.",
      },
      { property: "og:title", content: "Mon panier — Maison Noura" },
      {
        property: "og:description",
        content: "Votre sélection Maison Noura, paiement à la livraison.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { tr, locale } = useI18n();
  const cart = useCart();
  const fetchLines = useServerFn(getCartLines);
  const ids = cart.items.map((i) => i.variantId);
  const lines = useQuery({
    queryKey: ["public", "cart-lines", ids.slice().sort().join(",")],
    queryFn: () => fetchLines({ data: { variantIds: ids } }),
    enabled: cart.ready && ids.length > 0,
    staleTime: 15_000,
  });
  const settings = useQuery(storeSettingsQuery());
  const checkPromo = useServerFn(checkPromoCode);
  const submitOrder = useServerFn(createStoreOrder);
  const info = new Map<string, CartLineInfo>((lines.data ?? []).map((l) => [l.variant_id, l]));

  // Checkout modal state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [checkoutForm, setCheckoutForm] = useState({
    name: "",
    phone: "",
    city: "Tunis",
    address: "",
    notes: "",
  });
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount: number;
    subtotal: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingPromo, setIsCheckingPromo] = useState(false);

  // keep each line's quantity within what's in stock
  useEffect(() => {
    if (!lines.data) return;
    for (const item of cart.items) {
      const l = info.get(item.variantId);
      if (l && l.available > 0 && item.qty > l.available) cart.setQty(item.variantId, l.available);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.data]);

  const priced = cart.items.map((item) => {
    const l = info.get(item.variantId);
    const unit = l ? (l.promo_price ?? l.price) : item.unitPrice;
    return {
      item,
      line: l,
      unit,
      missing: lines.isSuccess && !l,
      soldOut: !!l && l.available <= 0,
    };
  });
  const sellable = priced.filter((p) => !p.missing && !p.soldOut);
  const totals = computeCartTotals(
    sellable.map((p) => ({ unitPrice: p.unit, qty: p.item.qty })),
    settings.data
      ? {
          deliveryFee: Number(settings.data.delivery_fee),
          freeThreshold:
            settings.data.free_delivery_threshold == null
              ? null
              : Number(settings.data.free_delivery_threshold),
        }
      : null,
  );

  const discountValue = appliedPromo?.discount ?? 0;
  const finalTotal = Math.max(0, totals.total - discountValue);

  useEffect(() => {
    if (appliedPromo && appliedPromo.subtotal !== totals.subtotal) setAppliedPromo(null);
  }, [appliedPromo, totals.subtotal]);

  async function applyPromo() {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setIsCheckingPromo(true);
    try {
      const result = await checkPromo({ data: { code, subtotal: totals.subtotal } });
      if (!result.valid) {
        setAppliedPromo(null);
        toast.error(
          result.error === "promo_min_not_met"
            ? tr(
                "Le montant minimum de ce code n'est pas atteint.",
                "لم يتم بلوغ الحد الأدنى لهذا الرمز.",
              )
            : tr("Code promo invalide ou expiré.", "رمز الخصم غير صالح أو منتهي الصلاحية."),
        );
        return;
      }
      setAppliedPromo({ code: result.code, discount: result.discount, subtotal: totals.subtotal });
      toast.success(
        tr(
          `Code promo appliqué : -${formatTND(result.discount, "fr")}`,
          `تم تطبيق رمز الخصم: -${formatTND(result.discount, "ar")}`,
        ),
      );
    } catch {
      toast.error(tr("Impossible de vérifier ce code promo.", "تعذّر التحقق من رمز الخصم."));
    } finally {
      setIsCheckingPromo(false);
    }
  }

  async function handleOrderSubmit(e: FormEvent) {
    e.preventDefault();
    if (!checkoutForm.name.trim() || !checkoutForm.phone.trim() || !checkoutForm.address.trim()) {
      toast.error(
        tr("Veuillez remplir tous les champs obligatoires", "يرجى ملء جميع الحقول المطلوبة"),
      );
      return;
    }
    if (!lines.isSuccess || priced.some((p) => p.missing || p.soldOut)) {
      toast.error(
        tr(
          "Vérifiez la disponibilité de tous les articles avant de commander.",
          "تحقق من توفر جميع المنتجات قبل إتمام الطلب.",
        ),
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const order = await submitOrder({
        data: {
          customerName: checkoutForm.name,
          phone: checkoutForm.phone,
          city: checkoutForm.city,
          address: checkoutForm.address,
          instructions: checkoutForm.notes,
          email: "",
          items: cart.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.qty,
          })),
          promoCode: appliedPromo?.code ?? null,
        },
      });
      setOrderRef(order.reference);
      setOrderTotal(order.total);
      setIsCheckoutOpen(false);
      cart.clear();
      toast.success(
        tr(
          `Commande ${order.reference} enregistrée avec succès !`,
          `تم تسجيل طلبكم ${order.reference} بنجاح !`,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("insufficient_stock")) void lines.refetch();
      toast.error(
        message.includes("insufficient_stock")
          ? tr(
              "Le stock vient de changer. Vérifiez les quantités de votre panier.",
              "تغير المخزون. تحقق من كميات سلتك.",
            )
          : message.includes("variant_unavailable")
            ? tr("Un article n'est plus disponible.", "أحد المنتجات لم يعد متوفراً.")
            : message.includes("invalid_promo")
              ? tr("Ce code promo n'est plus valide.", "لم يعد رمز الخصم صالحاً.")
              : tr(
                  "La commande n'a pas pu être enregistrée. Réessayez.",
                  "تعذّر تسجيل الطلب. حاول مرة أخرى.",
                ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!cart.ready) {
    return (
      <StoreLayout>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </StoreLayout>
    );
  }

  if (cart.items.length === 0) {
    return (
      <StoreLayout>
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
            <ShoppingBag className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-semibold">{tr("Votre panier est vide", "سلتك فارغة")}</h1>
          <p className="text-muted-foreground">
            {tr(
              "Parcourez la boutique et ajoutez vos coups de cœur.",
              "تصفح المتجر وأضف ما يعجبك.",
            )}
          </p>
          <Button asChild>
            <Link to="/shop">{tr("Découvrir la boutique", "اكتشف المتجر")}</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold">{tr("Mon panier", "سلتي")}</h1>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ul className="divide-y rounded-2xl border bg-card shadow-card">
            {priced.map(({ item, line, unit, missing, soldOut }) => {
              const name =
                (locale === "ar" && (line?.name_ar ?? item.name_ar)) ||
                line?.name_fr ||
                item.name_fr;
              const label =
                locale === "ar"
                  ? (line?.label_ar ?? item.label_ar)
                  : (line?.label_fr ?? item.label_fr);
              const max = Math.min(line?.available ?? MAX_LINE_QTY, MAX_LINE_QTY);
              const priceChanged = line && Math.abs(unit - item.unitPrice) > 0.0005;
              return (
                <li key={item.variantId} className="flex gap-4 p-4">
                  <Link
                    to="/product/$slug"
                    params={{ slug: line?.slug ?? item.slug }}
                    className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-primary-soft"
                  >
                    {(line?.image ?? item.image) && (
                      <img
                        src={line?.image ?? item.image ?? ""}
                        alt={name}
                        width={96}
                        height={96}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link
                      to="/product/$slug"
                      params={{ slug: line?.slug ?? item.slug }}
                      className="line-clamp-2 font-medium hover:text-primary"
                    >
                      {name}
                    </Link>
                    {label && <p className="text-sm text-muted-foreground">{label}</p>}
                    {missing && (
                      <p className="flex items-center gap-1 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4" />{" "}
                        {tr("Ce produit n'est plus disponible.", "هذا المنتج لم يعد متوفراً.")}
                      </p>
                    )}
                    {soldOut && (
                      <p className="flex items-center gap-1 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4" />{" "}
                        {tr("Épuisé pour le moment.", "نفد المخزون حالياً.")}
                      </p>
                    )}
                    {priceChanged && !missing && (
                      <p className="text-xs text-highlight">
                        {tr("Le prix a été mis à jour.", "تم تحديث السعر.")}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div className="flex items-center rounded-lg border">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={item.qty <= 1 || missing || soldOut}
                          onClick={() => cart.setQty(item.variantId, item.qty - 1)}
                          aria-label={tr("Diminuer", "إنقاص")}
                        >
                          <Minus />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums">
                          {item.qty}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={item.qty >= max || missing || soldOut}
                          onClick={() => cart.setQty(item.variantId, item.qty + 1)}
                          aria-label={tr("Augmenter", "زيادة")}
                        >
                          <Plus />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => cart.remove(item.variantId)}
                      >
                        <Trash2 /> {tr("Retirer", "إزالة")}
                      </Button>
                    </div>
                  </div>
                  <p className="shrink-0 text-end font-display font-semibold">
                    {formatTND(unit * item.qty, locale)}
                  </p>
                </li>
              );
            })}
          </ul>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-card">
              <p className="font-semibold">{tr("Récapitulatif", "الملخص")}</p>
              <Row k={tr("Sous-total", "المجموع الفرعي")} v={formatTND(totals.subtotal, locale)} />
              <Row
                k={tr("Livraison", "التوصيل")}
                v={
                  totals.delivery === 0
                    ? tr("Offerte", "مجاني")
                    : formatTND(totals.delivery, locale)
                }
              />
              {totals.remainingForFree != null && totals.remainingForFree > 0 && (
                <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">
                  <Truck className="me-1 inline h-3.5 w-3.5" />
                  {tr(
                    `Plus que ${formatTND(totals.remainingForFree, "fr")} pour la livraison offerte.`,
                    `أضف ${formatTND(totals.remainingForFree, "ar")} للحصول على توصيل مجاني.`,
                  )}
                </p>
              )}
              {appliedPromo && discountValue > 0 && (
                <div className="flex items-center justify-between text-sm text-success">
                  <span>{tr(`Code ${appliedPromo.code}`, `الرمز ${appliedPromo.code}`)}</span>
                  <span className="font-medium">-{formatTND(discountValue, locale)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-semibold">
                  {tr("Total à payer à la livraison", "المبلغ عند الاستلام")}
                </span>
                <span className="font-display text-xl font-bold text-primary">
                  {formatTND(finalTotal, locale)}
                </span>
              </div>

              {/* Promo code box */}
              <div className="pt-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Tag className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={tr("Code promo", "رمز الخصم")}
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      className="h-9 ps-8 text-xs font-mono uppercase"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void applyPromo()}
                    disabled={isCheckingPromo || !promoCode.trim()}
                  >
                    {isCheckingPromo ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      tr("Appliquer", "تطبيق")
                    )}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {tr(
                    "Les codes valides sont appliqués au récapitulatif.",
                    "تُطبّق الرموز الصالحة على ملخص الطلب.",
                  )}
                </p>
              </div>

              <Button
                size="lg"
                className="w-full text-base font-semibold shadow-md"
                disabled={sellable.length === 0 || !lines.isSuccess || lines.isFetching}
                onClick={() => setIsCheckoutOpen(true)}
              >
                {lines.isFetching && <Loader2 className="animate-spin me-2" />}
                {tr("Commander maintenant", "إتمام الطلب الآن")} →
              </Button>
            </div>
            <p className="flex items-center gap-2 rounded-2xl border bg-muted/40 p-4 text-sm">
              <Banknote className="h-4 w-4 shrink-0 text-primary" />{" "}
              {tr(
                "Vous payez en espèces au livreur, à la réception.",
                "تدفع نقداً لعامل التوصيل عند الاستلام.",
              )}
            </p>
          </aside>
        </div>
      </div>

      {/* Modal Commander */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {tr("Validation de commande (COD)", "تأكيد الطلب (الدفع عند الاستلام)")}
            </DialogTitle>
            <DialogDescription>
              {tr(
                "Renseignez votre adresse de livraison. Le paiement se fait en espèces au livreur.",
                "أدخل عنوان التوصيل. الدفع نقداً عند استلام الطرد.",
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleOrderSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="checkout-name">{tr("Nom & Prénom *", "الاسم واللقب *")}</Label>
              <Input
                id="checkout-name"
                required
                value={checkoutForm.name}
                onChange={(e) => setCheckoutForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ex: Yassine Trabelsi"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-phone">{tr("Numéro de téléphone *", "رقم الهاتف *")}</Label>
              <Input
                id="checkout-phone"
                required
                type="tel"
                value={checkoutForm.phone}
                onChange={(e) => setCheckoutForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+216 98 123 456"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-city">
                {tr("Gouvernorat / Ville *", "الولاية / المدينة *")}
              </Label>
              <Select
                value={checkoutForm.city}
                onValueChange={(val) => setCheckoutForm((f) => ({ ...f, city: val }))}
              >
                <SelectTrigger id="checkout-city">
                  <SelectValue placeholder="Sélectionnez votre ville" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "Tunis",
                    "Ariana",
                    "Ben Arous",
                    "Manouba",
                    "Nabeul",
                    "Sousse",
                    "Monastir",
                    "Sfax",
                    "Bizerte",
                    "Kairouan",
                    "Gabès",
                    "Médenine",
                  ].map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-address">
                {tr("Adresse complète *", "العنوان بالتفصيل *")}
              </Label>
              <Input
                id="checkout-address"
                required
                value={checkoutForm.address}
                onChange={(e) => setCheckoutForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="ex: 12 Rue Ibn Khaldoun, Étage 2, Apt 4"
              />
            </div>
            <div className="rounded-xl border bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between font-medium">
                <span>{tr("Total de la commande", "إجمالي الطلب")}</span>
                <span className="font-bold text-primary">{formatTND(finalTotal, locale)}</span>
              </div>
              <p className="text-muted-foreground">
                ✓ {tr("Paiement à la réception en espèces", "الدفع عند الاستلام نقداً")}
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsCheckoutOpen(false)}>
                {tr("Annuler", "إلغاء")}
              </Button>
              <Button type="submit" disabled={isSubmitting} className="font-semibold">
                {isSubmitting ? (
                  <Loader2 className="animate-spin me-2" />
                ) : (
                  <CheckCircle2 className="me-2 h-4 w-4" />
                )}
                {tr("Confirmer la commande", "تأكيد الطلب")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Succès Commande */}
      <Dialog
        open={orderRef !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOrderRef(null);
            setOrderTotal(null);
          }
        }}
      >
        <DialogContent className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold">
              {tr("Commande confirmée !", "تم تأكيد طلبك بنجاح !")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {tr(
                "Merci pour votre confiance. Votre colis est en cours de préparation.",
                "شكراً لثقتكم. طلبكم قيد التحضير حالياً.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border bg-card p-4 text-start text-sm space-y-2">
            <div className="flex justify-between border-b pb-2 font-mono">
              <span className="text-muted-foreground">{tr("Référence", "المرجع")}</span>
              <span className="font-bold text-primary">{orderRef}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tr("Destinataire", "المستلم")}</span>
              <span className="font-medium">{checkoutForm.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tr("Téléphone", "الهاتف")}</span>
              <span className="font-medium">{checkoutForm.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tr("Ville", "المدينة")}</span>
              <span className="font-medium">{checkoutForm.city}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>{tr("Montant à payer au livreur", "المبلغ المستحق للدفع")}</span>
              <span className="text-primary font-bold">
                {formatTND(orderTotal ?? finalTotal, locale)}
              </span>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button asChild size="lg" className="w-full">
              <Link to="/track-order">{tr("Suivre ma commande", "تتبع طلبي")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link to="/shop">{tr("Continuer mes achats", "مواصلة التسوق")}</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StoreLayout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
