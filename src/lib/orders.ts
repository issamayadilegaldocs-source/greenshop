import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type ReturnStatus = Database["public"]["Enums"]["return_status"];
export type ReviewStatus = Database["public"]["Enums"]["review_status"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, [string, string]> = {
  pending: ["En attente", "قيد الانتظار"],
  confirmed: ["Confirmée", "مؤكدة"],
  preparing: ["En préparation", "قيد التحضير"],
  shipped: ["Expédiée", "تم الشحن"],
  out_for_delivery: ["En cours de livraison", "قيد التوصيل"],
  delivered: ["Livrée", "تم التسليم"],
  cancelled: ["Annulée", "ملغاة"],
  returned: ["Retournée", "مرتجعة"],
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, [string, string]> = {
  unpaid: ["Non encaissé", "غير محصّل"],
  paid: ["Encaissé", "محصّل"],
  refunded: ["Remboursé", "مسترد"],
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, [string, string]> = {
  requested: ["Demandé", "مطلوب"],
  approved: ["Approuvé", "موافق عليه"],
  rejected: ["Refusé", "مرفوض"],
  received: ["Reçu", "مستلم"],
  processed: ["Traité", "تمت المعالجة"],
};

/** Next statuses staff can apply from the current one (mirrors `_apply_order_status`). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

export const ORDER_ACTION_LABELS: Partial<Record<OrderStatus, [string, string]>> = {
  confirmed: ["Confirmer", "تأكيد"],
  preparing: ["Préparer", "تحضير"],
  shipped: ["Expédier", "شحن"],
  out_for_delivery: ["En livraison", "قيد التوصيل"],
  delivered: ["Marquer livrée", "تم التسليم"],
  cancelled: ["Annuler", "إلغاء"],
  returned: ["Marquer retournée", "إرجاع"],
};

export const ORDER_ACTION_HELP: Partial<Record<OrderStatus, [string, string]>> = {
  confirmed: [
    "Confirmez après avoir joint le client. Le stock reste réservé jusqu'à l'expédition.",
    "أكد بعد الاتصال بالحريف. يبقى المخزون محجوزاً حتى الشحن.",
  ],
  preparing: ["Les articles sont en cours de préparation.", "المنتجات قيد التحضير."],
  shipped: [
    "Le colis a quitté l'entrepôt — le stock réservé est consommé.",
    "غادر الطرد المستودع — يُستهلك المخزون المحجوز.",
  ],
  out_for_delivery: ["Le livreur est en route.", "الموصل في الطريق."],
  delivered: [
    "Le client a reçu la commande. La vente est comptabilisée.",
    "استلم الحريف الطلب. تُسجّل عملية البيع.",
  ],
  cancelled: [
    "Le stock sera libéré ou remis en vente automatiquement.",
    "يُحرَّر المخزون أو يُعاد للبيع تلقائياً.",
  ],
  returned: ["Commande marquée comme retournée.", "تم تعليم الطلب كمرتجع."],
};

export function orderStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-900 hover:bg-amber-100";
    case "confirmed":
    case "preparing":
      return "bg-sky-100 text-sky-900 hover:bg-sky-100";
    case "shipped":
    case "out_for_delivery":
      return "bg-indigo-100 text-indigo-900 hover:bg-indigo-100";
    case "delivered":
      return "bg-emerald-100 text-emerald-900 hover:bg-emerald-100";
    case "cancelled":
      return "bg-rose-100 text-rose-900 hover:bg-rose-100";
    case "returned":
      return "bg-orange-100 text-orange-900 hover:bg-orange-100";
    default:
      return "";
  }
}

export function paymentStatusBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-900 hover:bg-emerald-100";
    case "refunded":
      return "bg-orange-100 text-orange-900 hover:bg-orange-100";
    default:
      return "bg-muted text-muted-foreground hover:bg-muted";
  }
}

export const TIMELINE_STEPS: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "out_for_delivery",
  "delivered",
];
