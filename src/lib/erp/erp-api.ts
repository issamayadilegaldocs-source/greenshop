import { supabase } from "@/integrations/supabase/client";
import { computeReplenishmentSuggestion, roundTnd } from "./landed-cost";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

export type CurrencyCode = "TND" | "CNY" | "USD" | "EUR";

export type ExchangeRateRow = {
  id: string;
  currency_code: CurrencyCode;
  rate_to_tnd: number;
  effective_date: string;
  notes: string | null;
  created_at: string;
};

export type SupplierRow = {
  id: string;
  name: string;
  company_name: string | null;
  country: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  payment_terms: string | null;
  currency: CurrencyCode;
  lead_time_days: number;
  rating: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type SupplierPaymentRow = {
  id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  amount_foreign: number;
  currency: CurrencyCode;
  exchange_rate: number;
  amount_tnd: number;
  payment_method: string;
  reference: string | null;
  paid_at: string;
  notes: string | null;
};

export type PurchaseOrderItemRow = {
  id: string;
  purchase_order_id: string;
  product_id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost_foreign: number;
  unit_weight_grams: number;
  unit_volume_cm3: number;
  landed_unit_cost_tnd: number | null;
};

export type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  status:
    "DRAFT" | "SENT" | "CONFIRMED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED";
  currency: CurrencyCode;
  exchange_rate: number;
  discount_foreign: number;
  subtotal_foreign: number;
  total_foreign: number;
  total_tnd: number;
  payment_status: "unpaid" | "partial" | "paid";
  expected_at: string | null;
  notes: string | null;
  created_at: string;
  suppliers?: { name: string; country: string } | null;
  purchase_order_items?: PurchaseOrderItemRow[];
};

export type ImportExpenseRow = {
  id: string;
  shipment_id: string;
  expense_type: "shipping" | "customs" | "insurance" | "taxes" | "handling" | "other";
  label: string;
  amount_foreign: number;
  currency: CurrencyCode;
  exchange_rate: number;
  amount_tnd: number;
  created_at: string;
};

export type ImportShipmentRow = {
  id: string;
  reference: string;
  supplier_id: string | null;
  purchase_order_id: string | null;
  shipping_company: string | null;
  origin_country: string;
  destination_city: string;
  transport_method: "sea" | "air" | "express" | "land";
  tracking_number: string | null;
  status: "PREPARING" | "SHIPPED" | "IN_TRANSIT" | "CUSTOMS_CLEARANCE" | "ARRIVED" | "COMPLETED";
  shipped_at: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  allocation_method: "quantity" | "weight" | "volume" | "value" | "manual";
  total_expenses_tnd: number;
  notes: string | null;
  created_at: string;
  suppliers?: { name: string } | null;
  purchase_orders?: {
    id: string;
    po_number: string;
    currency: CurrencyCode;
    exchange_rate: number;
    total_tnd: number;
    purchase_order_items?: PurchaseOrderItemRow[];
  } | null;
  import_expenses?: ImportExpenseRow[];
};

export async function fetchExchangeRates(): Promise<ExchangeRateRow[]> {
  const { data, error } = await sb()
    .from("exchange_rates")
    .select("*")
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ExchangeRateRow[];
}

export function latestRateMap(rates: ExchangeRateRow[]): Record<CurrencyCode, number> {
  const map: Record<CurrencyCode, number> = { TND: 1, CNY: 0.435, USD: 3.12, EUR: 3.36 };
  const seen = new Set<string>();
  for (const r of rates) {
    if (!seen.has(r.currency_code)) {
      seen.add(r.currency_code);
      map[r.currency_code] = Number(r.rate_to_tnd);
    }
  }
  return map;
}

export async function addExchangeRate(input: {
  currency_code: CurrencyCode;
  rate_to_tnd: number;
  effective_date: string;
  notes?: string;
}) {
  const { error } = await sb()
    .from("exchange_rates")
    .insert({
      currency_code: input.currency_code,
      rate_to_tnd: input.rate_to_tnd,
      effective_date: input.effective_date,
      notes: input.notes?.trim() || null,
    });
  if (error) throw error;
}

export async function fetchSuppliers(): Promise<SupplierRow[]> {
  const { data, error } = await sb()
    .from("suppliers")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as SupplierRow[];
}

export async function saveSupplier(input: Partial<SupplierRow> & { name: string }) {
  const payload = {
    name: input.name.trim(),
    company_name: input.company_name?.trim() || null,
    country: input.country?.trim() || "China",
    contact_person: input.contact_person?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    website: input.website?.trim() || null,
    payment_terms: input.payment_terms?.trim() || null,
    currency: input.currency ?? "CNY",
    lead_time_days: Number(input.lead_time_days ?? 25),
    rating: Number(input.rating ?? 4.5),
    notes: input.notes?.trim() || null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await sb().from("suppliers").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await sb().from("suppliers").insert(payload).select("id").single();
  if (error) throw error;
  return String(data.id);
}

export async function fetchSupplierPayments(): Promise<SupplierPaymentRow[]> {
  const { data, error } = await sb()
    .from("supplier_payments")
    .select("*")
    .order("paid_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as SupplierPaymentRow[];
}

export async function recordSupplierPayment(input: {
  supplier_id: string;
  purchase_order_id?: string | null;
  amount_foreign: number;
  currency: CurrencyCode;
  exchange_rate: number;
  payment_method: string;
  reference?: string;
  notes?: string;
}) {
  const amount_tnd = roundTnd(input.amount_foreign * input.exchange_rate);
  const { error } = await sb()
    .from("supplier_payments")
    .insert({
      supplier_id: input.supplier_id,
      purchase_order_id: input.purchase_order_id || null,
      amount_foreign: input.amount_foreign,
      currency: input.currency,
      exchange_rate: input.exchange_rate,
      amount_tnd,
      payment_method: input.payment_method,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
    });
  if (error) throw error;
}

export async function fetchPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  const { data, error } = await sb()
    .from("purchase_orders")
    .select("*, suppliers(name, country), purchase_order_items(*)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as PurchaseOrderRow[];
}

export async function fetchCatalogVariantsForPo() {
  const { data, error } = await sb()
    .from("product_variants")
    .select(
      "id, sku, price, is_active, product_id, products(id, name_fr, weight_grams), inventory(available, reserved, incoming, low_stock_threshold)",
    )
    .eq("is_active", true)
    .order("sku")
    .limit(200);
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    sku: string;
    price: number;
    product_id: string;
    products: { id: string; name_fr: string; weight_grams: number | null } | null;
    inventory:
      | { available: number; reserved: number; incoming: number; low_stock_threshold: number }
      | { available: number; reserved: number; incoming: number; low_stock_threshold: number }[]
      | null;
  }[];
}

export async function createPurchaseOrder(input: {
  supplier_id: string;
  currency: CurrencyCode;
  exchange_rate: number;
  discount_foreign?: number;
  expected_at?: string | null;
  notes?: string;
  items: {
    product_id: string;
    variant_id: string;
    sku: string;
    product_name: string;
    quantity_ordered: number;
    unit_cost_foreign: number;
    unit_weight_grams?: number;
    unit_volume_cm3?: number;
  }[];
}) {
  if (!input.items.length) throw new Error("Ajoutez au moins un article au bon de commande.");
  const subtotal = input.items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost_foreign, 0);
  const discount = Math.max(0, input.discount_foreign ?? 0);
  const totalForeign = Math.max(0, subtotal - discount);
  const totalTnd = roundTnd(totalForeign * input.exchange_rate);
  const poNumber = `PO-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

  const { data: po, error } = await sb()
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      supplier_id: input.supplier_id,
      status: "DRAFT",
      currency: input.currency,
      exchange_rate: input.exchange_rate,
      discount_foreign: discount,
      subtotal_foreign: subtotal,
      total_foreign: totalForeign,
      total_tnd: totalTnd,
      expected_at: input.expected_at || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: itemErr } = await sb()
    .from("purchase_order_items")
    .insert(
      input.items.map((i) => ({
        purchase_order_id: po.id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        sku: i.sku,
        product_name: i.product_name,
        quantity_ordered: i.quantity_ordered,
        unit_cost_foreign: i.unit_cost_foreign,
        unit_weight_grams: i.unit_weight_grams ?? 0,
        unit_volume_cm3: i.unit_volume_cm3 ?? 0,
      })),
    );
  if (itemErr) throw itemErr;

  await sb().rpc("log_audit_event", {
    _module: "erp",
    _action: "purchases.po_created",
    _summary: `Bon de commande ${poNumber} créé (${totalForeign.toFixed(2)} ${input.currency} ≈ ${totalTnd.toFixed(3)} DT)`,
    _entity_type: "purchase_order",
    _entity_id: String(po.id),
    _metadata: { po_number: poNumber, currency: input.currency, total_tnd: totalTnd },
  });

  return String(po.id);
}

export async function updatePurchaseOrderStatus(poId: string, status: PurchaseOrderRow["status"]) {
  const { error } = await sb()
    .from("purchase_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", poId);
  if (error) throw error;
}

export async function receivePoItem(poItemId: string, qty: number, shipmentId?: string | null) {
  const { data, error } = await sb().rpc("receive_purchase_order_item", {
    _po_item_id: poItemId,
    _qty: qty,
    _shipment_id: shipmentId || null,
  });
  if (error) throw error;
  return data;
}

export async function fetchImportShipments(): Promise<ImportShipmentRow[]> {
  const { data, error } = await sb()
    .from("import_shipments")
    .select(
      "*, suppliers(name), purchase_orders(id, po_number, currency, exchange_rate, total_tnd, purchase_order_items(*)), import_expenses(*)",
    )
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as ImportShipmentRow[];
}

export async function createImportShipment(input: {
  purchase_order_id?: string | null;
  supplier_id?: string | null;
  shipping_company?: string;
  origin_country?: string;
  destination_city?: string;
  transport_method: ImportShipmentRow["transport_method"];
  tracking_number?: string;
  estimated_arrival?: string | null;
  notes?: string;
}) {
  const reference = `IMP-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
  const { data, error } = await sb()
    .from("import_shipments")
    .insert({
      reference,
      purchase_order_id: input.purchase_order_id || null,
      supplier_id: input.supplier_id || null,
      shipping_company: input.shipping_company?.trim() || null,
      origin_country: input.origin_country?.trim() || "China",
      destination_city: input.destination_city?.trim() || "Tunis",
      transport_method: input.transport_method,
      tracking_number: input.tracking_number?.trim() || null,
      estimated_arrival: input.estimated_arrival || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function updateShipmentStatus(
  shipmentId: string,
  status: ImportShipmentRow["status"],
) {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "ARRIVED") patch["actual_arrival"] = new Date().toISOString().slice(0, 10);
  const { error } = await sb().from("import_shipments").update(patch).eq("id", shipmentId);
  if (error) throw error;
}

export async function addImportExpense(input: {
  shipment_id: string;
  expense_type: ImportExpenseRow["expense_type"];
  label: string;
  amount_foreign: number;
  currency: CurrencyCode;
  exchange_rate: number;
}) {
  const amount_tnd = roundTnd(input.amount_foreign * input.exchange_rate);
  const { error } = await sb().from("import_expenses").insert({
    shipment_id: input.shipment_id,
    expense_type: input.expense_type,
    label: input.label.trim(),
    amount_foreign: input.amount_foreign,
    currency: input.currency,
    exchange_rate: input.exchange_rate,
    amount_tnd,
  });
  if (error) throw error;
}

export async function deleteImportExpense(expenseId: string) {
  const { error } = await sb().from("import_expenses").delete().eq("id", expenseId);
  if (error) throw error;
}

export async function applyShipmentLandedCostRpc(
  shipmentId: string,
  method: string,
  allocations: unknown[],
) {
  const { data, error } = await sb().rpc("apply_shipment_landed_cost", {
    _shipment_id: shipmentId,
    _allocation_method: method,
    _allocations: allocations,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type ReplenishmentSuggestionRow = {
  variant_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  available: number;
  reserved: number;
  incoming: number;
  low_stock_threshold: number;
  sold_30d: number;
  avg_daily_sales: number;
  reorder_point: number;
  suggested_qty: number;
  days_of_cover: number | null;
  weight_grams: number;
};

export async function fetchReplenishmentSuggestions(
  leadTimeDays = 25,
): Promise<ReplenishmentSuggestionRow[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [variants, orderItemsRes] = await Promise.all([
    fetchCatalogVariantsForPo(),
    sb()
      .from("order_items")
      .select("variant_id, quantity, orders!inner(status, created_at)")
      .gte("orders.created_at", since)
      .not("orders.status", "in", "(cancelled,returned)"),
  ]);

  const sold30dByVariant = new Map<string, number>();
  for (const row of (orderItemsRes.data ?? []) as { variant_id: string; quantity: number }[]) {
    sold30dByVariant.set(
      row.variant_id,
      (sold30dByVariant.get(row.variant_id) ?? 0) + Number(row.quantity ?? 0),
    );
  }

  return variants
    .map((v) => {
      const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
      const available = inv?.available ?? 0;
      const reserved = inv?.reserved ?? 0;
      const incoming = inv?.incoming ?? 0;
      const threshold = inv?.low_stock_threshold ?? 5;
      const sold30 = sold30dByVariant.get(v.id) ?? 0;
      const avgDaily = Math.round((sold30 / 30) * 100) / 100;
      const calc = computeReplenishmentSuggestion({
        available,
        reserved,
        incoming,
        lowStockThreshold: threshold,
        avgDailySales: avgDaily,
        leadTimeDays,
      });
      return {
        variant_id: v.id,
        product_id: v.product_id,
        sku: v.sku,
        product_name: v.products?.name_fr ?? v.sku,
        available,
        reserved,
        incoming,
        low_stock_threshold: threshold,
        sold_30d: sold30,
        avg_daily_sales: avgDaily,
        reorder_point: calc.reorderPoint,
        suggested_qty: calc.suggestedQty,
        days_of_cover: calc.daysOfCover,
        weight_grams: v.products?.weight_grams ?? 0,
      };
    })
    .sort((a, b) => b.suggested_qty - a.suggested_qty || a.available - b.available);
}
