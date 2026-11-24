export const STATUS_LABELS: Record<string, [string, string]> = {
  draft: ["Brouillon", "مسودة"],
  published: ["Publié", "منشور"],
  archived: ["Archivé", "مؤرشف"],
};

export type VariantRow = {
  key: string;
  id?: string;
  options: Record<string, string>;
  sku: string;
  price: string;
  promo_price: string;
  cost: string;
  barcode: string;
  is_active: boolean;
  /** only for new variants */
  initial_stock: string;
  /** read-only, existing variants */
  current_stock?: number;
};

export type ImageRow = { key: string; id?: string; url: string; storage_path: string | null };

/** Cartesian product of the selected options of each variant attribute. */
export function combinations(
  axes: { id: string; optionIds: string[] }[],
): Record<string, string>[] {
  const used = axes.filter((a) => a.optionIds.length > 0);
  if (!used.length) return [];
  let out: Record<string, string>[] = [{}];
  for (const a of used) {
    const next: Record<string, string>[] = [];
    for (const base of out) for (const o of a.optionIds) next.push({ ...base, [a.id]: o });
    out = next;
  }
  return out;
}

export function comboKey(options: Record<string, string>) {
  return Object.keys(options)
    .sort()
    .map((k) => `${k}:${options[k]}`)
    .join("|");
}
