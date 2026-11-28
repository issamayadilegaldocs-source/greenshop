export type AllocationMethod = "quantity" | "weight" | "volume" | "value" | "manual";

export type LandedCostLineInput = {
  purchase_order_item_id: string;
  product_id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_cost_foreign: number;
  po_exchange_rate: number;
  unit_weight_grams: number;
  unit_volume_cm3: number;
  manual_expense_tnd?: number;
};

export type LandedCostLineResult = {
  purchase_order_item_id: string;
  product_id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  base_unit_tnd: number;
  base_purchase_tnd: number;
  allocated_expenses_tnd: number;
  total_landed_tnd: number;
  unit_landed_cost_tnd: number;
  uplift_pct: number;
};

/** Round cleanly to Tunisian Dinar millimes (3 decimals). */
export function roundTnd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * Computes exact Landed Cost per PO item in TND millimes:
 * Landed Cost = Purchase Cost (converted at immutable PO FX snapshot) + Allocated Import Expenses.
 * Conserves the total allocated expenses to the exact 0.001 TND millime.
 */
export function calculateLandedCost(
  items: LandedCostLineInput[],
  totalExpensesTnd: number,
  method: AllocationMethod,
): LandedCostLineResult[] {
  if (items.length === 0) return [];
  const safeExpenses = Math.max(0, roundTnd(totalExpensesTnd));

  const bases = items.map((item) => {
    const qty = Math.max(1, Math.floor(item.quantity));
    const basePurchase = roundTnd(item.unit_cost_foreign * item.po_exchange_rate * qty);
    return { item, qty, basePurchase };
  });

  if (method === "manual") {
    return bases.map(({ item, qty, basePurchase }) => {
      const alloc = Math.max(0, roundTnd(item.manual_expense_tnd ?? 0));
      const totalLanded = roundTnd(basePurchase + alloc);
      const unitLanded = roundTnd(totalLanded / qty);
      const baseUnit = roundTnd(basePurchase / qty);
      const upliftPct = basePurchase > 0 ? Math.round((alloc / basePurchase) * 1000) / 10 : 0;
      return {
        purchase_order_item_id: item.purchase_order_item_id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        sku: item.sku,
        product_name: item.product_name,
        quantity: qty,
        base_unit_tnd: baseUnit,
        base_purchase_tnd: basePurchase,
        allocated_expenses_tnd: alloc,
        total_landed_tnd: totalLanded,
        unit_landed_cost_tnd: unitLanded,
        uplift_pct: upliftPct,
      };
    });
  }

  // Compute weights per selected driver; fall back to quantity if driver total is 0
  let drivers = bases.map(({ item, qty, basePurchase }) => {
    switch (method) {
      case "quantity":
        return qty;
      case "weight":
        return Math.max(0, item.unit_weight_grams) * qty;
      case "volume":
        return Math.max(0, item.unit_volume_cm3) * qty;
      case "value":
      default:
        return basePurchase;
    }
  });

  let driverTotal = drivers.reduce((sum, w) => sum + w, 0);
  if (driverTotal <= 0) {
    drivers = bases.map((b) => b.qty);
    driverTotal = drivers.reduce((sum, w) => sum + w, 0);
  }

  const rawAllocations = drivers.map((w) => roundTnd((safeExpenses * w) / driverTotal));
  const allocatedSum = roundTnd(rawAllocations.reduce((s, a) => s + a, 0));
  const remainder = roundTnd(safeExpenses - allocatedSum);

  // Assign any +/- 0.001 millime rounding remainder to the largest driver line
  if (remainder !== 0 && rawAllocations.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < drivers.length; i++) {
      if (drivers[i]! > drivers[maxIdx]!) maxIdx = i;
    }
    rawAllocations[maxIdx] = Math.max(0, roundTnd(rawAllocations[maxIdx]! + remainder));
  }

  return bases.map(({ item, qty, basePurchase }, i) => {
    const alloc = rawAllocations[i] ?? 0;
    const totalLanded = roundTnd(basePurchase + alloc);
    const unitLanded = roundTnd(totalLanded / qty);
    const baseUnit = roundTnd(basePurchase / qty);
    const upliftPct = basePurchase > 0 ? Math.round((alloc / basePurchase) * 1000) / 10 : 0;
    return {
      purchase_order_item_id: item.purchase_order_item_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      sku: item.sku,
      product_name: item.product_name,
      quantity: qty,
      base_unit_tnd: baseUnit,
      base_purchase_tnd: basePurchase,
      allocated_expenses_tnd: alloc,
      total_landed_tnd: totalLanded,
      unit_landed_cost_tnd: unitLanded,
      uplift_pct: upliftPct,
    };
  });
}

export type ReplenishmentInput = {
  available: number;
  reserved: number;
  incoming: number;
  lowStockThreshold: number;
  avgDailySales: number;
  leadTimeDays: number;
  safetyDays?: number;
};

/**
 * Suggests replenishment purchase quantity based on demand velocity, supplier lead time,
 * safety buffer, and current net stock position. Never auto-orders without human approval.
 */
export function computeReplenishmentSuggestion(input: ReplenishmentInput): {
  reorderPoint: number;
  targetStock: number;
  suggestedQty: number;
  daysOfCover: number | null;
} {
  const safety = input.safetyDays ?? 10;
  const effectiveDaily = Math.max(0, input.avgDailySales);
  const netPosition = Math.max(0, input.available) + Math.max(0, input.incoming);
  const reorderPoint = Math.max(
    input.lowStockThreshold,
    Math.ceil(effectiveDaily * (input.leadTimeDays + Math.round(safety / 2))),
  );
  const targetStock = Math.max(
    input.lowStockThreshold * 3,
    Math.ceil(effectiveDaily * (input.leadTimeDays + safety + 15)),
  );
  const suggestedQty = netPosition <= reorderPoint ? Math.max(0, targetStock - netPosition) : 0;
  const daysOfCover =
    effectiveDaily > 0
      ? Math.round((Math.max(0, input.available) / effectiveDaily) * 10) / 10
      : null;
  return { reorderPoint, targetStock, suggestedQty, daysOfCover };
}
