import { describe, expect, it } from "vitest";
import {
  calculateLandedCost,
  computeReplenishmentSuggestion,
  roundTnd,
  type LandedCostLineInput,
} from "./landed-cost";

const SAMPLE_LINES: LandedCostLineInput[] = [
  {
    purchase_order_item_id: "i-1",
    product_id: "p-1",
    variant_id: "v-1",
    sku: "MN-AUDIO-01",
    product_name: "Casque Aura ANC",
    quantity: 50,
    unit_cost_foreign: 20, // 20 CNY (PRD §7.4 example)
    po_exchange_rate: 0.435, // -> 8.700 TND/unit -> 435.000 TND base
    unit_weight_grams: 300,
    unit_volume_cm3: 1500,
  },
  {
    purchase_order_item_id: "i-2",
    product_id: "p-2",
    variant_id: "v-2",
    sku: "MN-HOME-02",
    product_name: "Lampe Halo",
    quantity: 25,
    unit_cost_foreign: 40, // 40 CNY -> 17.400 TND/unit -> 435.000 TND base
    po_exchange_rate: 0.435,
    unit_weight_grams: 900,
    unit_volume_cm3: 4500,
  },
];

describe("Lot 2 — China Import Landed Cost & Replenishment Engine", () => {
  it("allocates import expenses by value and conserves exact TND millimes", () => {
    const res = calculateLandedCost(SAMPLE_LINES, 300, "value");
    expect(res).toHaveLength(2);
    // Equal purchase value (435 TND each) => 150 TND expenses each
    expect(res[0]?.base_purchase_tnd).toBe(435);
    expect(res[0]?.allocated_expenses_tnd).toBe(150);
    expect(res[0]?.unit_landed_cost_tnd).toBe(11.7); // (435 + 150) / 50
    expect(res[1]?.unit_landed_cost_tnd).toBe(23.4); // (435 + 150) / 25
    expect(roundTnd(res.reduce((s, r) => s + r.allocated_expenses_tnd, 0))).toBe(300);
  });

  it("allocates import expenses by quantity and handles 0.001 millime remainders", () => {
    const res = calculateLandedCost(SAMPLE_LINES, 100, "quantity");
    // 50 vs 25 => 2/3 (66.667) and 1/3 (33.333)
    expect(roundTnd(res[0]!.allocated_expenses_tnd + res[1]!.allocated_expenses_tnd)).toBe(100);
    expect(res[0]!.allocated_expenses_tnd).toBeCloseTo(66.667, 3);
    expect(res[1]!.allocated_expenses_tnd).toBeCloseTo(33.333, 3);
  });

  it("allocates import expenses by weight accurately", () => {
    const res = calculateLandedCost(SAMPLE_LINES, 375, "weight");
    // Line 1 total weight: 50*300 = 15,000g; Line 2: 25*900 = 22,500g => total 37,500g
    expect(res[0]?.allocated_expenses_tnd).toBe(150);
    expect(res[1]?.allocated_expenses_tnd).toBe(225);
  });

  it("supports manual expense allocation", () => {
    const manualLines = [
      { ...SAMPLE_LINES[0]!, manual_expense_tnd: 120.5 },
      { ...SAMPLE_LINES[1]!, manual_expense_tnd: 79.5 },
    ];
    const res = calculateLandedCost(manualLines, 200, "manual");
    expect(res[0]?.allocated_expenses_tnd).toBe(120.5);
    expect(res[1]?.allocated_expenses_tnd).toBe(79.5);
  });

  it("computes replenishment quantity when stock falls below reorder point", () => {
    const low = computeReplenishmentSuggestion({
      available: 4,
      reserved: 1,
      incoming: 0,
      lowStockThreshold: 5,
      avgDailySales: 1.5,
      leadTimeDays: 25,
      safetyDays: 10,
    });
    expect(low.suggestedQty).toBeGreaterThan(0);
    expect(low.daysOfCover).toBe(2.7);

    const healthy = computeReplenishmentSuggestion({
      available: 200,
      reserved: 0,
      incoming: 0,
      lowStockThreshold: 5,
      avgDailySales: 1,
      leadTimeDays: 20,
    });
    expect(healthy.suggestedQty).toBe(0);
  });
});
