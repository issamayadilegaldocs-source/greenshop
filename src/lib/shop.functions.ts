import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { queryOptions } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { createSupabaseFetch } from "@/integrations/supabase/fetch";
import { MOCK_CATEGORIES, type PublicCategory } from "./catalog.functions";

/** Read-only client with the publishable key; RLS limits it to published catalog rows. */
const publicClient = createServerOnlyFn(() => {
  const key = supabasePublishableKey();
  return createClient<Database>(supabaseUrl(), key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { fetch: createSupabaseFetch(key) },
  });
});

/**
 * Optional-auth server client: forwards the signed-in user's Bearer JWT when present
 * (attached automatically by auth-attacher.ts), or falls back to anonymous for guests.
 */
const optionalAuthClient = createServerOnlyFn(() => {
  const key = supabasePublishableKey();
  const authHeader = getRequest()?.headers?.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const hasValidJwt = token.split(".").length === 3;
  return createClient<Database>(supabaseUrl(), key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: createSupabaseFetch(key),
      ...(hasValidJwt ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    },
  });
});

type Sb = ReturnType<typeof publicClient>;

export type ProductCardData = {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  brand: string | null;
  price: number;
  promo_price: number | null;
  image: string | null;
  rating_avg: number;
  rating_count: number;
  is_featured: boolean;
  in_stock: boolean;
  category_slug?: string;
};

export type FacetOption = {
  id: string;
  value: string;
  label_fr: string | null;
  label_ar: string | null;
  color_hex: string | null;
};
export type Facet = {
  id: string;
  name_fr: string;
  name_ar: string | null;
  type: string;
  options: FacetOption[];
};

const CARD_COLUMNS =
  "id, slug, name_fr, name_ar, brand, price, promo_price, rating_avg, rating_count, is_featured, product_images(url, position)";

const CATEGORY_COLUMNS =
  "id,parent_id,name_fr,name_ar,slug,description_fr,description_ar,image_url,display_order";

async function getActiveCategories(sb: Sb): Promise<PublicCategory[]> {
  const { data, error } = await sb
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("is_active", true)
    .order("display_order")
    .order("name_fr");
  if (error) {
    if (error.message?.includes("schema cache") || error.code === "PGRST205") return [];
    throw new Error(error.message);
  }
  const categories = data ?? [];
  const ids = new Set(categories.map((c) => c.id));
  return categories.filter((c) => !c.parent_id || ids.has(c.parent_id));
}

async function loadCards(sb: Sb, ids: string[], categoryIds: string[]): Promise<ProductCardData[]> {
  if (!ids.length) return [];
  if (!categoryIds.length) return [];
  const [{ data, error }, avail] = await Promise.all([
    sb
      .from("products")
      .select(CARD_COLUMNS)
      .in("id", ids)
      .in("category_id", categoryIds)
      .eq("status", "published"),
    sb.rpc("get_variant_availability", { _product_ids: ids }),
  ]);
  if (error) throw new Error(error.message);
  if (avail.error) throw new Error(avail.error.message);
  const stock = new Map<string, number>();
  for (const a of avail.data ?? [])
    stock.set(a.product_id, (stock.get(a.product_id) ?? 0) + Math.max(a.available, 0));
  const byId = new Map(
    (data ?? []).map((p) => {
      const imgs = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position);
      const card: ProductCardData = {
        id: p.id,
        slug: p.slug,
        name_fr: p.name_fr,
        name_ar: p.name_ar,
        brand: p.brand,
        price: Number(p.price),
        promo_price: p.promo_price == null ? null : Number(p.promo_price),
        image: imgs[0]?.url ?? null,
        rating_avg: Number(p.rating_avg),
        rating_count: p.rating_count,
        is_featured: p.is_featured,
        in_stock: (stock.get(p.id) ?? 0) > 0,
      };
      return [p.id, card] as const;
    }),
  );
  return ids.map((id) => byId.get(id)).filter((x): x is ProductCardData => !!x);
}

export const MOCK_PRODUCTS: ProductCardData[] = [
  {
    id: "prod-tshirt-coton-bio",
    slug: "tshirt-coton-bio",
    name_fr: "T-shirt signature en coton peigné",
    name_ar: "تي شيرت أساسي من القطن الممشط",
    brand: "Maison Noura",
    price: 49.9,
    promo_price: null,
    image: "/demo/tshirt-coton-bio.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: true,
    in_stock: true,
    category_slug: "t-shirts-sweats",
  },
  {
    id: "prod-sweat-capuche-molleton",
    slug: "sweat-capuche-molleton",
    name_fr: "Sweat à capuche en molleton",
    name_ar: "سويت شيرت بقبعة من القطن المبطن",
    brand: "Maison Noura",
    price: 98.0,
    promo_price: null,
    image: "/demo/sweat-capuche.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: false,
    in_stock: true,
    category_slug: "vestes-homme",
  },
  {
    id: "prod-chemise-lin",
    slug: "chemise-lin",
    name_fr: "Chemise droite en lin lavé",
    name_ar: "قميص بقصة مستقيمة من الكتان المغسول",
    brand: "Maison Noura",
    price: 129.0,
    promo_price: null,
    image: "/demo/chemise-lin.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: false,
    in_stock: true,
    category_slug: "chemises-homme",
  },
  {
    id: "prod-robe-ete-fleurie",
    slug: "robe-ete-fleurie",
    name_fr: "Robe midi Jardin d’été",
    name_ar: "فستان جاردان ميدي للصيف",
    brand: "Maison Noura",
    price: 149.0,
    promo_price: 129.0,
    image: "/demo/robe-ete-fleurie.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: true,
    in_stock: true,
    category_slug: "robes",
  },
  {
    id: "prod-casque-aura-anc",
    slug: "casque-aura-anc",
    name_fr: "Casque sans fil Aura ANC",
    name_ar: "سماعة رأس لاسلكية أورا ANC",
    brand: "Maison Noura Audio",
    price: 249.0,
    promo_price: 219.0,
    image: "/demo/casque-audio.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: true,
    in_stock: true,
    category_slug: "casques-ecouteurs",
  },
  {
    id: "prod-ecouteurs-nuage-buds",
    slug: "ecouteurs-nuage-buds",
    name_fr: "Écouteurs sans fil Nuage Buds",
    name_ar: "سماعات أذن لاسلكية نواج بودز",
    brand: "Maison Noura Audio",
    price: 139.0,
    promo_price: null,
    image: "/demo/ecouteurs-sans-fil.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: true,
    in_stock: true,
    category_slug: "casques-ecouteurs",
  },
  {
    id: "prod-enceinte-brise-mini",
    slug: "enceinte-brise-mini",
    name_fr: "Enceinte nomade Brise Mini",
    name_ar: "مكبر صوت لاسلكي بريز ميني",
    brand: "Maison Noura Audio",
    price: 169.0,
    promo_price: null,
    image: "/demo/enceinte-bluetooth.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: false,
    in_stock: true,
    category_slug: "enceintes-sans-fil",
  },
  {
    id: "prod-machine-espresso-barista",
    slug: "machine-espresso-barista",
    name_fr: "Machine espresso Barista Compact",
    name_ar: "آلة قهوة إسبريسو باريستا المدمجة",
    brand: "Maison Noura Cuisine",
    price: 489.0,
    promo_price: 449.0,
    image: "/demo/machine-espresso.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: true,
    in_stock: true,
    category_slug: "cafe-petit-dejeuner",
  },
  {
    id: "prod-bouilloire-atelier",
    slug: "bouilloire-atelier",
    name_fr: "Bouilloire col de cygne Atelier",
    name_ar: "غلاية كهربائية بعنق منحني أتيليه",
    brand: "Maison Noura Cuisine",
    price: 145.0,
    promo_price: null,
    image: "/demo/bouilloire-electrique.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: false,
    in_stock: true,
    category_slug: "cafe-petit-dejeuner",
  },
  {
    id: "prod-friteuse-airpure",
    slug: "friteuse-airpure",
    name_fr: "Friteuse sans huile AirPure 4,5 L",
    name_ar: "قلاية هوائية بدون زيت إير بيور 4.5 لتر",
    brand: "Maison Noura Cuisine",
    price: 299.0,
    promo_price: 269.0,
    image: "/demo/air-fryer.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: true,
    in_stock: true,
    category_slug: "cuisine-preparation",
  },
  {
    id: "prod-lampe-table-halo",
    slug: "lampe-table-halo",
    name_fr: "Lampe de table Halo sans fil",
    name_ar: "مصباح طاولة لاسلكي هالو",
    brand: "Maison Noura Maison",
    price: 119.0,
    promo_price: null,
    image: "/demo/lampe-table.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: true,
    in_stock: true,
    category_slug: "luminaire-ambiance",
  },
  {
    id: "prod-duo-mugs-gres",
    slug: "duo-mugs-gres",
    name_fr: "Duo de mugs en grès mat",
    name_ar: "طقم كوبين من الخزف المطفي",
    brand: "Maison Noura Maison",
    price: 54.0,
    promo_price: null,
    image: "/demo/mugs-ceramique.jpg",
    rating_avg: 0,
    rating_count: 0,
    is_featured: false,
    in_stock: true,
    category_slug: "arts-de-la-table",
  },
];

/* ---------------- Home ---------------- */

export const getHomeProducts = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const activeCategories = await getActiveCategories(sb);
  const categoryIds = activeCategories.map((c) => c.id);
  if (!categoryIds.length) {
    return {
      featured: MOCK_PRODUCTS.filter((p) => p.is_featured).slice(0, 8),
      newest: MOCK_PRODUCTS.slice(0, 8),
      best: { kind: "deals" as const, items: MOCK_PRODUCTS.filter((p) => p.promo_price != null) },
    };
  }
  const [featured, newest, best, deals] = await Promise.all([
    sb
      .from("products")
      .select("id")
      .eq("status", "published")
      .eq("is_featured", true)
      .order("published_at", { ascending: false })
      .limit(8),
    sb
      .from("products")
      .select("id")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(8),
    sb.rpc("get_best_sellers", { _limit: 8 }),
    sb
      .from("products")
      .select("id")
      .eq("status", "published")
      .not("promo_price", "is", null)
      .order("published_at", { ascending: false })
      .limit(8),
  ]);
  const hasSchemaError = [featured, newest, best, deals].some(
    (r) =>
      r.error &&
      (r.error.message?.includes("schema cache") ||
        r.error.message?.includes("does not exist") ||
        r.error.code === "PGRST205"),
  );
  if (hasSchemaError) {
    return {
      featured: MOCK_PRODUCTS.filter((p) => p.is_featured),
      newest: MOCK_PRODUCTS.slice(0, 4),
      best: { kind: "best" as const, items: MOCK_PRODUCTS.slice(2, 6) },
    };
  }

  for (const r of [featured, newest, best, deals]) if (r.error) throw new Error(r.error.message);
  const bestIds = (best.data ?? []).map((b) => b.product_id);
  const [f, n, b] = await Promise.all([
    loadCards(
      sb,
      (featured.data ?? []).map((x) => x.id),
      categoryIds,
    ),
    loadCards(
      sb,
      (newest.data ?? []).map((x) => x.id),
      categoryIds,
    ),
    loadCards(sb, bestIds.length >= 4 ? bestIds : (deals.data ?? []).map((x) => x.id), categoryIds),
  ]);
  return {
    featured: f.length > 0 ? f : MOCK_PRODUCTS.filter((p) => p.is_featured),
    newest: n.length > 0 ? n : MOCK_PRODUCTS.slice(0, 4),
    best: {
      kind: bestIds.length >= 4 ? ("best" as const) : ("deals" as const),
      items: b.length > 0 ? b : MOCK_PRODUCTS.slice(2, 6),
    },
  };
});

export const homeProductsQuery = () =>
  queryOptions({
    queryKey: ["public", "home-products"],
    queryFn: () => getHomeProducts(),
    staleTime: 60_000,
  });

/* ---------------- Shop listing ---------------- */

export const SHOP_SORTS = [
  "relevance",
  "new",
  "price_asc",
  "price_desc",
  "popular",
  "rating",
] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];
export const SHOP_PAGE_SIZE = 12;

const pgUuid = () =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const shopInput = z.object({
  c: z.string().max(120).optional(),
  q: z.string().max(120).optional(),
  sort: z.enum(SHOP_SORTS).optional(),
  page: z.number().int().min(1).max(500).optional(),
  min: z.number().min(0).max(1_000_000).optional(),
  max: z.number().min(0).max(1_000_000).optional(),
  f: z.record(pgUuid(), z.array(pgUuid()).max(30)).optional(),
});
export type ShopInput = z.input<typeof shopInput>;

function getMockShopResult(data: ShopInput, category: PublicCategory | null) {
  let filtered = [...MOCK_PRODUCTS];
  if (data.c) {
    const mockCategory = MOCK_CATEGORIES.find((c) => c.slug === data.c);
    if (mockCategory) {
      const slugs = mockCategory.parent_id
        ? [mockCategory.slug]
        : MOCK_CATEGORIES.filter((c) => c.parent_id === mockCategory.id).map((c) => c.slug);
      filtered = filtered.filter((p) => p.category_slug && slugs.includes(p.category_slug));
    } else {
      filtered = [];
    }
  }
  if (data.q?.trim()) {
    const needle = data.q.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name_fr.toLowerCase().includes(needle) ||
        (p.name_ar ?? "").includes(needle) ||
        (p.brand ?? "").toLowerCase().includes(needle),
    );
  }
  if (data.min != null) filtered = filtered.filter((p) => p.price >= data.min!);
  if (data.max != null) filtered = filtered.filter((p) => p.price <= data.max!);
  if (data.sort === "price_asc") filtered.sort((a, b) => a.price - b.price);
  if (data.sort === "price_desc") filtered.sort((a, b) => b.price - a.price);
  const page = data.page ?? 1;
  const total = filtered.length;
  const offset = (page - 1) * SHOP_PAGE_SIZE;
  return {
    items: filtered.slice(offset, offset + SHOP_PAGE_SIZE),
    total,
    page,
    pageSize: SHOP_PAGE_SIZE,
    category,
    facets: [] as Facet[],
  };
}

export const listShopProducts = createServerFn({ method: "GET" })
  .inputValidator((input: ShopInput) => shopInput.parse(input))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const activeCategories = await getActiveCategories(sb);
    if (!activeCategories.length) {
      return getMockShopResult(
        data,
        data.c ? (MOCK_CATEGORIES.find((c) => c.slug === data.c) ?? null) : null,
      );
    }
    let category: PublicCategory | null = null;
    if (data.c) {
      category = activeCategories.find((c) => c.slug === data.c) ?? null;
      if (!category) {
        return getMockShopResult(data, MOCK_CATEGORIES.find((c) => c.slug === data.c) ?? null);
      }
    }
    const page = data.page ?? 1;
    const args: Database["public"]["Functions"]["search_products"]["Args"] = {
      _filters: (data.f ?? {}) as Json,
      _sort: data.sort ?? "relevance",
      _limit: SHOP_PAGE_SIZE,
      _offset: (page - 1) * SHOP_PAGE_SIZE,
    };
    if (category) args._category_id = category.id;
    if (data.q?.trim()) args._q = data.q.trim();
    if (data.min != null) args._min_price = data.min;
    if (data.max != null) args._max_price = data.max;
    const { data: rows, error } = await sb.rpc("search_products", args);
    if (error) {
      if (
        error.message?.includes("schema cache") ||
        error.message?.includes("does not exist") ||
        error.code === "PGRST205"
      ) {
        return getMockShopResult(data, category);
      }
      throw new Error(error.message);
    }
    const items = await loadCards(
      sb,
      (rows ?? []).map((r) => r.product_id),
      activeCategories.map((c) => c.id),
    );
    if (
      !items.length &&
      page === 1 &&
      !data.q?.trim() &&
      data.min == null &&
      data.max == null &&
      !Object.keys(data.f ?? {}).length
    ) {
      return getMockShopResult(data, category);
    }
    const total = Number(rows?.[0]?.total ?? 0);

    let facets: Facet[] = [];
    if (category) {
      const { data: attrs, error: ae } = await sb.rpc("get_category_attributes", {
        _category_id: category.id,
      });
      if (ae) throw new Error(ae.message);
      const usable = (attrs ?? []).filter(
        (a) => a.is_filterable && ["dropdown", "multi_select", "color"].includes(a.type),
      );
      if (usable.length) {
        const { data: opts, error: oe } = await sb
          .from("category_attribute_options")
          .select("id, attribute_id, value, label_fr, label_ar, color_hex, display_order")
          .in(
            "attribute_id",
            usable.map((a) => a.id),
          )
          .order("display_order");
        if (oe) throw new Error(oe.message);
        facets = usable
          .sort((a, b) => b.depth - a.depth || a.display_order - b.display_order)
          .map((a) => ({
            id: a.id,
            name_fr: a.name_fr,
            name_ar: a.name_ar,
            type: a.type,
            options: (opts ?? [])
              .filter((o) => o.attribute_id === a.id)
              .map((o) => ({
                id: o.id,
                value: o.value,
                label_fr: o.label_fr,
                label_ar: o.label_ar,
                color_hex: o.color_hex,
              })),
          }))
          .filter((f) => f.options.length > 0);
      }
    }
    return { items, total, page, pageSize: SHOP_PAGE_SIZE, category, facets };
  });

export const shopQuery = (input: ShopInput) =>
  queryOptions({
    queryKey: ["public", "shop", input],
    queryFn: () => listShopProducts({ data: input }),
    staleTime: 30_000,
  });

/* ---------------- Product page ---------------- */

export type Review = {
  id: string;
  author_name: string | null;
  rating: number;
  comment: string | null;
  is_verified: boolean;
  created_at: string;
};

export type ProductImage = { id: string; url: string; alt: string | null };

export type ProductDetailProduct = {
  id: string;
  category_id: string;
  name_fr: string;
  name_ar: string | null;
  slug: string;
  sku: string;
  description_fr: string | null;
  description_ar: string | null;
  brand: string | null;
  model: string | null;
  warranty: string | null;
  price: number;
  promo_price: number | null;
  rating_avg: number;
  rating_count: number;
};

function getMockProductDetail(slug: string): {
  product: ProductDetailProduct;
  images: ProductImage[];
  specs: Spec[];
  axes: VariantAxis[];
  variants: PublicVariant[];
  reviews: Review[];
  related: ProductCardData[];
} | null {
  const card = MOCK_PRODUCTS.find((p) => p.slug === slug);
  if (!card) return null;

  type MockDetailEntry = {
    sizes?: readonly string[];
    stock: number;
    warranty?: string | null;
    colors: readonly { value: string; fr: string; ar: string; hex: string }[];
    specs: readonly Spec[];
  };
  const details: Record<string, MockDetailEntry> = {
    "tshirt-coton-bio": {
      sizes: ["S", "M", "L", "XL"],
      stock: 14,
      colors: [
        { value: "ecru", fr: "Écru", ar: "عاجي", hex: "#E9E0D2" },
        { value: "noir", fr: "Noir", ar: "أسود", hex: "#252321" },
      ],
      specs: [
        {
          name_fr: "Matière",
          name_ar: "الخامة",
          value_fr: "100 % coton peigné",
          value_ar: "قطن ممشط 100٪",
        },
        {
          name_fr: "Entretien",
          name_ar: "العناية",
          value_fr: "Lavage en machine à 30 °C",
          value_ar: "غسيل آلي عند 30 درجة",
        },
      ],
    },
    "sweat-capuche-molleton": {
      sizes: ["M", "L", "XL"],
      stock: 8,
      colors: [
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
        { value: "noir", fr: "Noir", ar: "أسود", hex: "#252321" },
      ],
      specs: [
        {
          name_fr: "Matière",
          name_ar: "الخامة",
          value_fr: "80 % coton, 20 % polyester recyclé",
          value_ar: "80٪ قطن و20٪ بوليستر معاد تدويره",
        },
        {
          name_fr: "Entretien",
          name_ar: "العناية",
          value_fr: "Lavage en machine à 30 °C, sur l’envers",
          value_ar: "غسيل آلي عند 30 درجة من الداخل",
        },
      ],
    },
    "chemise-lin": {
      sizes: ["S", "M", "L", "XL"],
      stock: 10,
      colors: [
        { value: "sable", fr: "Sable", ar: "رملي", hex: "#C9B89F" },
        { value: "bleu-ciel", fr: "Bleu ciel", ar: "أزرق سماوي", hex: "#A9C6D8" },
      ],
      specs: [
        {
          name_fr: "Matière",
          name_ar: "الخامة",
          value_fr: "100 % lin lavé",
          value_ar: "كتان مغسول 100٪",
        },
        {
          name_fr: "Entretien",
          name_ar: "العناية",
          value_fr: "Lavage délicat à 30 °C",
          value_ar: "غسيل لطيف عند 30 درجة",
        },
      ],
    },
    "robe-ete-fleurie": {
      sizes: ["XS", "S", "M", "L"],
      stock: 7,
      colors: [
        { value: "terracotta", fr: "Terracotta", ar: "طوبي", hex: "#B66B54" },
        { value: "olive", fr: "Olive", ar: "زيتوني", hex: "#737A55" },
      ],
      specs: [
        {
          name_fr: "Matière",
          name_ar: "الخامة",
          value_fr: "100 % viscose",
          value_ar: "فسكوز 100٪",
        },
        {
          name_fr: "Entretien",
          name_ar: "العناية",
          value_fr: "Lavage délicat à 30 °C",
          value_ar: "غسيل لطيف عند 30 درجة",
        },
      ],
    },
    "casque-aura-anc": {
      stock: 12,
      warranty: "2 ans",
      colors: [
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
        { value: "ecru", fr: "Écru", ar: "عاجي", hex: "#E9E0D2" },
        { value: "noir", fr: "Noir mat", ar: "أسود مطفي", hex: "#252321" },
      ],
      specs: [
        {
          name_fr: "Autonomie",
          name_ar: "عمر البطارية",
          value_fr: "Jusqu’à 40 h",
          value_ar: "حتى 40 ساعة",
        },
        {
          name_fr: "Connectivité",
          name_ar: "الاتصال",
          value_fr: "Bluetooth 5.3 & USB-C",
          value_ar: "بلوتوث 5.3 و USB-C",
        },
      ],
    },
    "ecouteurs-nuage-buds": {
      stock: 18,
      warranty: "2 ans",
      colors: [
        { value: "ecru", fr: "Écru", ar: "عاجي", hex: "#E9E0D2" },
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
        { value: "noir", fr: "Noir mat", ar: "أسود مطفي", hex: "#252321" },
      ],
      specs: [
        {
          name_fr: "Autonomie",
          name_ar: "عمر البطارية",
          value_fr: "30 h avec boîtier",
          value_ar: "30 ساعة مع العلبة",
        },
        {
          name_fr: "Connectivité",
          name_ar: "الاتصال",
          value_fr: "Bluetooth 5.3 & USB-C",
          value_ar: "بلوتوث 5.3 و USB-C",
        },
      ],
    },
    "enceinte-brise-mini": {
      stock: 10,
      warranty: "2 ans",
      colors: [
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
        { value: "sable", fr: "Sable", ar: "رملي", hex: "#C9B89F" },
      ],
      specs: [
        {
          name_fr: "Autonomie",
          name_ar: "عمر البطارية",
          value_fr: "18 heures",
          value_ar: "18 ساعة",
        },
        {
          name_fr: "Connectivité",
          name_ar: "الاتصال",
          value_fr: "Bluetooth 5.3, IP67",
          value_ar: "بلوتوث 5.3، IP67",
        },
      ],
    },
    "machine-espresso-barista": {
      stock: 6,
      warranty: "2 ans",
      colors: [
        { value: "ecru", fr: "Écru", ar: "عاجي", hex: "#E9E0D2" },
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
        { value: "noir", fr: "Noir mat", ar: "أسود مطفي", hex: "#252321" },
      ],
      specs: [
        {
          name_fr: "Puissance",
          name_ar: "القدرة",
          value_fr: "1350 W — 15 bars",
          value_ar: "1350 واط — 15 بار",
        },
        {
          name_fr: "Capacité",
          name_ar: "السعة",
          value_fr: "Réservoir 1,5 L",
          value_ar: "خزان 1.5 لتر",
        },
      ],
    },
    "bouilloire-atelier": {
      stock: 11,
      warranty: "2 ans",
      colors: [
        { value: "ecru", fr: "Écru", ar: "عاجي", hex: "#E9E0D2" },
        { value: "noir", fr: "Noir mat", ar: "أسود مطفي", hex: "#252321" },
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
      ],
      specs: [
        { name_fr: "Puissance", name_ar: "القدرة", value_fr: "1200 W", value_ar: "1200 واط" },
        {
          name_fr: "Capacité",
          name_ar: "السعة",
          value_fr: "0,9 L — Col de cygne",
          value_ar: "0.9 لتر",
        },
      ],
    },
    "friteuse-airpure": {
      stock: 9,
      warranty: "2 ans",
      colors: [
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
        { value: "ecru", fr: "Écru", ar: "عاجي", hex: "#E9E0D2" },
        { value: "noir", fr: "Noir mat", ar: "أسود مطفي", hex: "#252321" },
      ],
      specs: [
        { name_fr: "Puissance", name_ar: "القدرة", value_fr: "1500 W", value_ar: "1500 واط" },
        { name_fr: "Capacité", name_ar: "السعة", value_fr: "4,5 L", value_ar: "4.5 لتر" },
      ],
    },
    "lampe-table-halo": {
      stock: 14,
      warranty: "1 an",
      colors: [
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
        { value: "ecru", fr: "Écru", ar: "عاجي", hex: "#E9E0D2" },
        { value: "sable", fr: "Sable", ar: "رملي", hex: "#C9B89F" },
      ],
      specs: [
        {
          name_fr: "Matière",
          name_ar: "الخامة",
          value_fr: "Aluminium thermolaqué mat",
          value_ar: "ألمنيوم مطلي مطفي",
        },
        {
          name_fr: "Dimensions",
          name_ar: "الأبعاد",
          value_fr: "Ø 16 × H 28 cm",
          value_ar: "16 × 28 سم",
        },
      ],
    },
    "duo-mugs-gres": {
      stock: 20,
      colors: [
        { value: "sauge", fr: "Vert sauge", ar: "أخضر مريمي", hex: "#9BA58D" },
        { value: "ecru", fr: "Écru", ar: "عاجي", hex: "#E9E0D2" },
        { value: "terracotta", fr: "Terracotta", ar: "طوبي", hex: "#B66B54" },
      ],
      specs: [
        {
          name_fr: "Matière",
          name_ar: "الخامة",
          value_fr: "Grès émaillé mat",
          value_ar: "خزف مطفي",
        },
        {
          name_fr: "Dimensions",
          name_ar: "الأبعاد",
          value_fr: "Lot de 2 × 320 ml",
          value_ar: "قطعتان × 320 مل",
        },
      ],
    },
  };
  const detail = details[slug];
  if (!detail) return null;

  const colorOptions: FacetOption[] = detail.colors.map((color) => ({
    id: `opt-${color.value}`,
    value: color.value,
    label_fr: color.fr,
    label_ar: color.ar,
    color_hex: color.hex,
  }));
  const axes: VariantAxis[] = [];
  if (detail.sizes?.length) {
    axes.push({
      id: "axis-size",
      name_fr: "Taille",
      name_ar: "المقاس",
      type: "dropdown",
      options: detail.sizes.map((size) => ({
        id: `opt-${size.toLowerCase()}`,
        value: size,
        label_fr: size,
        label_ar: size,
        color_hex: null,
      })),
    });
  }
  axes.push({
    id: "axis-color",
    name_fr: "Couleur",
    name_ar: "اللون",
    type: "color",
    options: colorOptions,
  });

  const variants: PublicVariant[] = detail.sizes?.length
    ? detail.sizes.flatMap((size) =>
        detail.colors.map((color) => ({
          id: `var-${card.id}-${size.toLowerCase()}-${color.value}`,
          sku: `${card.slug.toUpperCase()}-${size}-${color.value.toUpperCase()}`,
          price: card.price,
          promo_price: card.promo_price,
          available: detail.stock,
          options: {
            "axis-size": `opt-${size.toLowerCase()}`,
            "axis-color": `opt-${color.value}`,
          },
          label_fr: `${size} / ${color.fr}`,
          label_ar: `${size} / ${color.ar}`,
        })),
      )
    : detail.colors.map((color) => ({
        id: `var-${card.id}-${color.value}`,
        sku: `${card.slug.toUpperCase()}-${color.value.toUpperCase()}`,
        price: card.price,
        promo_price: card.promo_price,
        available: detail.stock,
        options: { "axis-color": `opt-${color.value}` },
        label_fr: color.fr,
        label_ar: color.ar,
      }));
  const specs: Spec[] = [...detail.specs];

  return {
    product: {
      id: card.id,
      category_id:
        MOCK_CATEGORIES.find((c) => c.slug === card.category_slug)?.id ?? "cat-essentiels",
      name_fr: card.name_fr,
      name_ar: card.name_ar,
      slug: card.slug,
      sku: card.slug.toUpperCase(),
      description_fr: `${card.name_fr}, sélectionné par Maison Noura. Livraison partout en Tunisie, paiement à la livraison.`,
      description_ar: card.name_ar
        ? `${card.name_ar} من Maison Noura. توصيل إلى جميع أنحاء تونس والدفع عند الاستلام.`
        : null,
      brand: card.brand,
      model: null,
      warranty: detail.warranty ?? null,
      price: card.price,
      promo_price: card.promo_price,
      rating_avg: card.rating_avg,
      rating_count: card.rating_count,
    },
    images: card.image ? [{ id: `img-${card.id}`, url: card.image, alt: card.name_fr }] : [],
    specs,
    axes,
    variants,
    reviews: [],
    related: MOCK_PRODUCTS.filter((p) => p.id !== card.id).slice(0, 4),
  };
}

export type VariantAxis = {
  id: string;
  name_fr: string;
  name_ar: string | null;
  type: string;
  options: FacetOption[];
};
export type PublicVariant = {
  id: string;
  sku: string;
  price: number;
  promo_price: number | null;
  available: number;
  options: Record<string, string>;
  label_fr: string;
  label_ar: string;
};
export type Spec = { name_fr: string; name_ar: string | null; value_fr: string; value_ar: string };

export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const activeCategories = await getActiveCategories(sb);
    const activeCategoryIds = activeCategories.map((c) => c.id);
    if (!activeCategoryIds.length) return getMockProductDetail(data.slug);
    const { data: p, error } = await sb
      .from("products")
      .select(
        "id, category_id, name_fr, name_ar, slug, sku, description_fr, description_ar, brand, model, price, promo_price, warranty, has_variants, rating_avg, rating_count, published_at, product_images(id, url, alt, position)",
      )
      .in("category_id", activeCategoryIds)
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) {
      if (
        error.message?.includes("schema cache") ||
        error.message?.includes("does not exist") ||
        error.code === "PGRST205"
      ) {
        return getMockProductDetail(data.slug);
      }
      throw new Error(error.message);
    }
    if (!p) return getMockProductDetail(data.slug);

    const [attrsRes, valuesRes, variantsRes, availRes, reviewsRes, relatedRes] = await Promise.all([
      sb.rpc("get_category_attributes", { _category_id: p.category_id }),
      sb
        .from("product_attribute_values")
        .select("attribute_id, option_id, value_text, value_number, value_boolean, value_date")
        .eq("product_id", p.id),
      sb
        .from("product_variants")
        .select(
          "id, sku, price, promo_price, position, is_active, variant_attribute_values(attribute_id, option_id)",
        )
        .eq("product_id", p.id)
        .eq("is_active", true)
        .order("position"),
      sb.rpc("get_variant_availability", { _product_ids: [p.id] }),
      sb
        .from("reviews")
        .select("id, author_name, rating, comment, is_verified, created_at")
        .eq("product_id", p.id)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("products")
        .select("id")
        .eq("status", "published")
        .eq("category_id", p.category_id)
        .neq("id", p.id)
        .order("published_at", { ascending: false })
        .limit(4),
    ]);
    for (const r of [attrsRes, valuesRes, variantsRes, availRes, reviewsRes, relatedRes])
      if (r.error) {
        if (
          r.error.message?.includes("schema cache") ||
          r.error.message?.includes("does not exist") ||
          r.error.code === "PGRST205"
        ) {
          return getMockProductDetail(data.slug);
        }
        throw new Error(r.error.message);
      }
    const attrs = attrsRes.data ?? [];
    const optionIds = new Set<string>();
    for (const v of valuesRes.data ?? []) if (v.option_id) optionIds.add(v.option_id);
    for (const v of variantsRes.data ?? [])
      for (const o of v.variant_attribute_values ?? []) optionIds.add(o.option_id);
    const optsRes = optionIds.size
      ? await sb
          .from("category_attribute_options")
          .select("id, attribute_id, value, label_fr, label_ar, color_hex, display_order")
          .in("id", [...optionIds])
          .order("display_order")
      : { data: [], error: null };
    if (optsRes.error) throw new Error(optsRes.error.message);
    const optById = new Map((optsRes.data ?? []).map((o) => [o.id, o]));
    const label = (id: string, ar: boolean) => {
      const o = optById.get(id);
      return (ar ? o?.label_ar : null) || o?.label_fr || o?.value || "";
    };

    const specs: Spec[] = [];
    for (const a of [...attrs].sort(
      (x, y) => y.depth - x.depth || x.display_order - y.display_order,
    )) {
      if (a.is_variant) continue;
      // Avoid duplicating "Garantie" when products.warranty is already rendered on the product page
      if (p.warranty && a.code.toLowerCase() === "garantie") continue;
      const vals = (valuesRes.data ?? []).filter((v) => v.attribute_id === a.id);
      if (!vals.length) continue;
      const fmt = (ar: boolean) =>
        vals
          .map((v) => {
            if (v.option_id) return label(v.option_id, ar);
            if (v.value_boolean != null)
              return v.value_boolean ? (ar ? "نعم" : "Oui") : ar ? "لا" : "Non";
            if (v.value_number != null)
              return `${Number(v.value_number).toLocaleString(ar ? "ar-TN" : "fr-TN")}${a.unit ? ` ${a.unit}` : ""}`;
            if (v.value_date) return v.value_date;
            return v.value_text ?? "";
          })
          .filter(Boolean)
          .join(", ");
      specs.push({
        name_fr: a.name_fr,
        name_ar: a.name_ar,
        value_fr: fmt(false),
        value_ar: fmt(true),
      });
    }

    const avail = new Map((availRes.data ?? []).map((a) => [a.variant_id, a.available]));
    const variantAttrs = attrs
      .filter((a) => a.is_variant)
      .sort((x, y) => y.depth - x.depth || x.display_order - y.display_order);
    const variants: PublicVariant[] = (variantsRes.data ?? []).map((v) => {
      const options: Record<string, string> = {};
      for (const o of v.variant_attribute_values ?? []) options[o.attribute_id] = o.option_id;
      const ordered = variantAttrs.filter((a) => options[a.id]).map((a) => options[a.id]!);
      return {
        id: v.id,
        sku: v.sku,
        price: Number(v.price),
        promo_price: v.promo_price == null ? null : Number(v.promo_price),
        available: Math.max(avail.get(v.id) ?? 0, 0),
        options,
        label_fr: ordered.map((id) => label(id, false)).join(" / "),
        label_ar: ordered.map((id) => label(id, true)).join(" / "),
      };
    });
    const axes: VariantAxis[] = variantAttrs
      .map((a) => {
        const used = new Set(variants.map((v) => v.options[a.id]).filter(Boolean));
        const options = (optsRes.data ?? [])
          .filter((o) => o.attribute_id === a.id && used.has(o.id))
          .map((o) => ({
            id: o.id,
            value: o.value,
            label_fr: o.label_fr,
            label_ar: o.label_ar,
            color_hex: o.color_hex,
          }));
        return { id: a.id, name_fr: a.name_fr, name_ar: a.name_ar, type: a.type, options };
      })
      .filter((a) => a.options.length > 0);

    const relatedIds = (relatedRes.data ?? []).map((r) => r.id);
    if (relatedIds.length < 4) {
      const { data: extraRelated } = await sb
        .from("products")
        .select("id")
        .eq("status", "published")
        .neq("id", p.id)
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(8);
      for (const r of extraRelated ?? []) {
        if (relatedIds.length >= 4) break;
        if (!relatedIds.includes(r.id)) relatedIds.push(r.id);
      }
    }
    const related = await loadCards(sb, relatedIds, activeCategoryIds);
    const images = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position);
    return {
      product: {
        id: p.id,
        category_id: p.category_id,
        name_fr: p.name_fr,
        name_ar: p.name_ar,
        slug: p.slug,
        sku: p.sku,
        description_fr: p.description_fr,
        description_ar: p.description_ar,
        brand: p.brand,
        model: p.model,
        warranty: p.warranty,
        price: Number(p.price),
        promo_price: p.promo_price == null ? null : Number(p.promo_price),
        rating_avg: Number(p.rating_avg),
        rating_count: p.rating_count,
      },
      images: images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
      specs,
      axes,
      variants,
      reviews: reviewsRes.data ?? [],
      related,
    };
  });

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public", "product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
    staleTime: 30_000,
  });

/* ---------------- Cart revalidation ---------------- */

export type CartLineInfo = {
  variant_id: string;
  product_id: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  image: string | null;
  price: number;
  promo_price: number | null;
  available: number;
  label_fr: string;
  label_ar: string;
};

export const getCartLines = createServerFn({ method: "POST" })
  .inputValidator((input: { variantIds: string[] }) =>
    z.object({ variantIds: z.array(z.string().min(1).max(100)).max(50) }).parse(input),
  )
  .handler(async ({ data }): Promise<CartLineInfo[]> => {
    if (!data.variantIds.length) return [];
    try {
      const sb = publicClient();
      const { data: vars, error } = await sb
        .from("product_variants")
        .select(
          "id, product_id, price, promo_price, is_active, variant_attribute_values(attribute_id, option_id), products!inner(slug, name_fr, name_ar, status, product_images(url, position))",
        )
        .in("id", data.variantIds)
        .eq("is_active", true);

      if (!error && vars && vars.length > 0) {
        const productIds = [...new Set(vars.map((v) => v.product_id))];
        const optionIds = [
          ...new Set(
            vars.flatMap((v) => (v.variant_attribute_values ?? []).map((o) => o.option_id)),
          ),
        ];
        const [avail, opts] = await Promise.all([
          productIds.length
            ? sb.rpc("get_variant_availability", { _product_ids: productIds })
            : Promise.resolve({ data: [], error: null }),
          optionIds.length
            ? sb
                .from("category_attribute_options")
                .select("id, value, label_fr, label_ar")
                .in("id", optionIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        const a = new Map((avail.data ?? []).map((x) => [x.variant_id, x.available]));
        const o = new Map((opts.data ?? []).map((x) => [x.id, x]));
        return vars.map((v) => {
          const prod = v.products as unknown as {
            slug: string;
            name_fr: string;
            name_ar: string | null;
            product_images: { url: string; position: number }[];
          };
          const imgs = [...(prod.product_images ?? [])].sort((x, y) => x.position - y.position);
          const ids = (v.variant_attribute_values ?? []).map((x) => x.option_id);
          return {
            variant_id: v.id,
            product_id: v.product_id,
            slug: prod.slug,
            name_fr: prod.name_fr,
            name_ar: prod.name_ar,
            image: imgs[0]?.url ?? null,
            price: Number(v.price),
            promo_price: v.promo_price == null ? null : Number(v.promo_price),
            available: Math.max(a.get(v.id) ?? 0, 0),
            label_fr: ids.map((id) => o.get(id)?.label_fr || o.get(id)?.value || "").join(" / "),
            label_ar: ids
              .map((id) => o.get(id)?.label_ar || o.get(id)?.label_fr || o.get(id)?.value || "")
              .join(" / "),
          };
        });
      }
    } catch {
      // Fall through to mock lines if database is not available
    }

    // Graceful fallback for mock items or offline database
    return data.variantIds.map((vid) => {
      const match =
        MOCK_PRODUCTS.find((p) => vid.includes(p.slug) || vid.includes(p.id)) ?? MOCK_PRODUCTS[0]!;
      const variant = getMockProductDetail(match.slug)?.variants.find((item) => item.id === vid);

      return {
        variant_id: vid,
        product_id: match.id,
        slug: match.slug,
        name_fr: match.name_fr,
        name_ar: match.name_ar,
        image: match.image,
        price: match.price,
        promo_price: match.promo_price,
        available: variant?.available ?? 15,
        label_fr: variant?.label_fr ?? "Standard",
        label_ar: variant?.label_ar ?? "افتراضي",
      };
    });
  });

const checkPromoInput = z.object({
  code: z.string().trim().min(1).max(80),
  subtotal: z.number().min(0).max(1_000_000),
});

const promoResult = z.union([
  z.object({ valid: z.literal(true), code: z.string(), discount: z.number() }),
  z.object({ valid: z.literal(false), error: z.string(), min: z.number().optional() }),
]);

export const checkPromoCode = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof checkPromoInput>) => checkPromoInput.parse(input))
  .handler(async ({ data }) => {
    const { data: result, error } = await publicClient().rpc("check_promo", {
      _code: data.code,
      _subtotal: data.subtotal,
    });
    if (error) throw new Error(error.message);
    return promoResult.parse(result);
  });

const createOrderInput = z.object({
  customerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(1).max(40),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(500),
  instructions: z.string().max(500).default(""),
  email: z.string().email().or(z.literal("")).default(""),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(50),
  promoCode: z.string().trim().max(80).nullable().default(null),
});

const createOrderResult = z.object({
  order_id: pgUuid(),
  reference: z.string().min(1),
  total: z.number(),
  has_seller_items: z.boolean().optional(),
});

export const createStoreOrder = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof createOrderInput>) => createOrderInput.parse(input))
  .handler(async ({ data }) => {
    const sb = optionalAuthClient();
    const { data: result, error } = await sb.rpc("create_order", {
      _customer_name: data.customerName,
      _phone: data.phone,
      _city: data.city,
      _address: data.address,
      _instructions: data.instructions,
      _email: data.email,
      _items: data.items.map(({ variantId, quantity }) => ({
        variant_id: variantId,
        quantity,
      })),
      ...(data.promoCode ? { _promo_code: data.promoCode } : {}),
      _save_address: false,
    });
    if (error) throw new Error(error.message);
    return createOrderResult.parse(result);
  });

const trackOrderInput = z.object({
  reference: z.string().trim().min(4).max(40),
  phone: z.string().trim().min(1).max(40),
});

const trackedOrderSchema = z.object({
  id: pgUuid(),
  reference: z.string(),
  status: z.string(),
  payment_status: z.string(),
  created_at: z.string(),
  customer_name: z.string(),
  city: z.string(),
  address: z.string(),
  subtotal: z.number(),
  discount_total: z.number(),
  delivery_fee: z.number(),
  total: z.number(),
  items: z.array(
    z.object({
      product_name: z.string(),
      variant_label: z.string().nullable().optional(),
      quantity: z.number(),
      unit_price: z.number(),
      line_total: z.number(),
      image_url: z.string().nullable().optional(),
    }),
  ),
  history: z.array(
    z.object({
      to_status: z.string(),
      created_at: z.string(),
    }),
  ),
});

export type TrackedOrder = z.infer<typeof trackedOrderSchema>;

export const trackStoreOrder = createServerFn({ method: "POST" })
  .inputValidator((input: z.input<typeof trackOrderInput>) => trackOrderInput.parse(input))
  .handler(async ({ data }) => {
    const { data: result, error } = await publicClient().rpc("track_order", {
      _reference: data.reference,
      _phone: data.phone,
    });
    if (error) throw new Error(error.message);
    if (result == null) return null;
    return trackedOrderSchema.parse(result);
  });
