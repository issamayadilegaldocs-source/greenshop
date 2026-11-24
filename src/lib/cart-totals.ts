/** Display totals for the cart; the server recomputes everything when the order is placed. */
export function computeCartTotals(
  lines: { unitPrice: number; qty: number }[],
  settings: { deliveryFee: number; freeThreshold: number | null } | null,
) {
  const subtotal = Math.round(lines.reduce((n, l) => n + l.unitPrice * l.qty, 0) * 1000) / 1000;
  if (!settings || subtotal === 0)
    return { subtotal, delivery: 0, total: subtotal, remainingForFree: null as number | null };
  const free = settings.freeThreshold != null && subtotal >= settings.freeThreshold;
  const delivery = free ? 0 : settings.deliveryFee;
  const remainingForFree =
    settings.freeThreshold != null
      ? Math.max(0, Math.round((settings.freeThreshold - subtotal) * 1000) / 1000)
      : null;
  return {
    subtotal,
    delivery,
    total: Math.round((subtotal + delivery) * 1000) / 1000,
    remainingForFree,
  };
}
