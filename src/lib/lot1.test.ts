import { describe, expect, it } from "vitest";
import { clampQty, mergeCartItem, type CartItem } from "./cart";

function computeBulkPrice(price: number, mode: "percent" | "fixed", delta: number): number {
  const raw = mode === "percent" ? price * (1 + delta / 100) : price + delta;
  return Math.max(1, Math.round(raw * 1000) / 1000);
}

describe("Lot 1 — Cart, Pricing & RBAC helpers", () => {
  it("clamps quantities safely between 1 and max", () => {
    expect(clampQty(0)).toBe(1);
    expect(clampQty(-5)).toBe(1);
    expect(clampQty(3.9)).toBe(3);
    expect(clampQty(99, 20)).toBe(20);
  });

  it("merges duplicate cart variants without exceeding max qty", () => {
    const base: Omit<CartItem, "qty"> = {
      variantId: "v-1",
      productId: "p-1",
      slug: "robe-ete",
      name_fr: "Robe d'été",
      name_ar: "فستان صيفي",
      label_fr: "M",
      label_ar: "M",
      image: null,
      unitPrice: 129,
    };
    const first = mergeCartItem([], base, 2);
    expect(first).toHaveLength(1);
    expect(first[0]?.qty).toBe(2);

    const second = mergeCartItem(first, base, 3);
    expect(second).toHaveLength(1);
    expect(second[0]?.qty).toBe(5);
  });

  it("computes bulk price adjustments in TND millimes with floor at 1 DT", () => {
    expect(computeBulkPrice(100, "percent", 10)).toBe(110);
    expect(computeBulkPrice(149, "percent", -10)).toBe(134.1);
    expect(computeBulkPrice(50, "fixed", 7.5)).toBe(57.5);
    expect(computeBulkPrice(5, "fixed", -20)).toBe(1);
  });
});
