import { SHOP_SORTS, type ShopInput, type ShopSort } from "./shop.functions";

export type ShopSearch = {
  c?: string;
  q?: string;
  sort?: ShopSort;
  page?: number;
  min?: number;
  max?: number;
  /** filters encoded as "attrId:opt,opt;attrId:opt" */
  f?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFilters(f: string | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!f) return out;
  for (const part of f.split(";")) {
    const [attr, opts] = part.split(":");
    if (!attr || !opts || !UUID.test(attr)) continue;
    const ids = opts
      .split(",")
      .filter((o) => UUID.test(o))
      .slice(0, 30);
    if (ids.length) out[attr] = ids;
  }
  return out;
}

export function encodeFilters(filters: Record<string, string[]>): string | undefined {
  const parts = Object.entries(filters)
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `${k}:${v.join(",")}`);
  return parts.length ? parts.join(";") : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function validateShopSearch(s: Record<string, unknown>): ShopSearch {
  const out: ShopSearch = {};
  if (typeof s["c"] === "string" && s["c"]) out.c = s["c"].slice(0, 120);
  if (typeof s["q"] === "string" && s["q"].trim()) out.q = s["q"].slice(0, 120);
  if (typeof s["sort"] === "string" && (SHOP_SORTS as readonly string[]).includes(s["sort"]))
    out.sort = s["sort"] as ShopSort;
  const page = num(s["page"]);
  if (page && page >= 1) out.page = Math.min(Math.floor(page), 500);
  const min = num(s["min"]);
  if (min !== undefined) out.min = min;
  const max = num(s["max"]);
  if (max !== undefined) out.max = max;
  if (typeof s["f"] === "string") {
    const enc = encodeFilters(parseFilters(s["f"]));
    if (enc) out.f = enc;
  }
  return out;
}

export function toShopInput(s: ShopSearch): ShopInput {
  const input: ShopInput = {};
  if (s.c) input.c = s.c;
  if (s.q) input.q = s.q;
  if (s.sort) input.sort = s.sort;
  if (s.page) input.page = s.page;
  if (s.min !== undefined) input.min = s.min;
  if (s.max !== undefined) input.max = s.max;
  const f = parseFilters(s.f);
  if (Object.keys(f).length) input.f = f;
  return input;
}
