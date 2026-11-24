import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { createSupabaseFetch } from "@/integrations/supabase/fetch";

/** Read-only client with the publishable key; RLS limits it to public rows. */
const publicClient = createServerOnlyFn(() => {
  const key = supabasePublishableKey();
  return createClient<Database>(supabaseUrl(), key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { fetch: createSupabaseFetch(key) },
  });
});

export type PublicCategory = {
  id: string;
  parent_id: string | null;
  name_fr: string;
  name_ar: string | null;
  slug: string;
  description_fr: string | null;
  description_ar: string | null;
  image_url: string | null;
  display_order: number;
};

export const CLOTHING_CATEGORY_SLUGS = [
  "femme",
  "robes",
  "chemises-femme",
  "vestes-femme",
  "homme",
  "chemises-homme",
  "vestes-homme",
  "essentiels",
  "t-shirts-sweats",
] as const;
const clothingCategorySlugs = new Set<string>(CLOTHING_CATEGORY_SLUGS);

export const MOCK_CATEGORIES: PublicCategory[] = [
  {
    id: "cat-femme",
    parent_id: null,
    name_fr: "Femme",
    name_ar: "المرأة",
    slug: "femme",
    description_fr:
      "Des silhouettes lumineuses, des matières naturelles et des coupes faciles à vivre.",
    description_ar: "إطلالات مشرقة وخامات طبيعية وقصات مريحة لكل يوم.",
    image_url: "/demo/robe-ete-fleurie.jpg",
    display_order: 1,
  },
  {
    id: "cat-homme",
    parent_id: null,
    name_fr: "Homme",
    name_ar: "الرجل",
    slug: "homme",
    description_fr: "Des essentiels bien coupés pour une allure simple et affirmée.",
    description_ar: "قطع أساسية بقصات متقنة وأناقة بسيطة وواثقة.",
    image_url: "/demo/chemise-lin.jpg",
    display_order: 2,
  },
  {
    id: "cat-essentiels",
    parent_id: null,
    name_fr: "Essentiels",
    name_ar: "الأساسيات",
    slug: "essentiels",
    description_fr:
      "Les pièces indispensables du vestiaire, choisies pour leur confort et leur tenue.",
    description_ar: "قطع لا غنى عنها في خزانة الملابس، مختارة لراحتها وجودتها.",
    image_url: "/demo/tshirt-coton-bio.jpg",
    display_order: 3,
  },
  {
    id: "cat-robes",
    parent_id: "cat-femme",
    name_fr: "Robes",
    name_ar: "فساتين",
    slug: "robes",
    description_fr: "Robes fluides et féminines, pensées pour les journées ensoleillées.",
    description_ar: "فساتين انسيابية وأنثوية لأيام مشمسة.",
    image_url: "/demo/robe-ete-fleurie.jpg",
    display_order: 1,
  },
  {
    id: "cat-chemises-femme",
    parent_id: "cat-femme",
    name_fr: "Chemises & blouses",
    name_ar: "قمصان وبلوزات",
    slug: "chemises-femme",
    description_fr: "Des chemises légères et des blouses aux détails délicats.",
    description_ar: "قمصان خفيفة وبلوزات بتفاصيل أنيقة.",
    image_url: "/demo/chemise-lin.jpg",
    display_order: 2,
  },
  {
    id: "cat-vestes-femme",
    parent_id: "cat-femme",
    name_fr: "Vestes & superpositions",
    name_ar: "سترات وقطع متعددة الطبقات",
    slug: "vestes-femme",
    description_fr: "Des couches faciles à porter du matin au soir.",
    description_ar: "قطع عملية يمكن ارتداؤها طوال اليوم.",
    image_url: "/demo/sweat-capuche.jpg",
    display_order: 3,
  },
  {
    id: "cat-chemises-homme",
    parent_id: "cat-homme",
    name_fr: "Chemises",
    name_ar: "قمصان",
    slug: "chemises-homme",
    description_fr: "Des chemises respirantes aux lignes épurées.",
    description_ar: "قمصان خفيفة بتصاميم أنيقة.",
    image_url: "/demo/chemise-lin.jpg",
    display_order: 1,
  },
  {
    id: "cat-vestes-homme",
    parent_id: "cat-homme",
    name_fr: "Vestes & molleton",
    name_ar: "سترات وملابس قطنية",
    slug: "vestes-homme",
    description_fr: "Des pièces confortables pour les journées plus fraîches.",
    description_ar: "قطع مريحة للأيام الباردة.",
    image_url: "/demo/sweat-capuche.jpg",
    display_order: 2,
  },
  {
    id: "cat-tshirts",
    parent_id: "cat-essentiels",
    name_fr: "T-shirts & sweats",
    name_ar: "تي شيرت وسويت شيرت",
    slug: "t-shirts-sweats",
    description_fr: "Des essentiels en coton doux et des sweats confortables.",
    description_ar: "قطع قطنية أساسية وسويت شيرت مريح.",
    image_url: "/demo/tshirt-coton-bio.jpg",
    display_order: 1,
  },
];

export const getPublicCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicCategory[]> => {
    const sb = publicClient();
    const { data, error } = await sb
      .from("categories")
      .select(
        "id,parent_id,name_fr,name_ar,slug,description_fr,description_ar,image_url,display_order",
      )
      .eq("is_active", true)
      .order("display_order")
      .order("name_fr");
    if (error) {
      if (error.message?.includes("schema cache") || error.code === "PGRST205") {
        return MOCK_CATEGORIES;
      }
      throw new Error(error.message);
    }
    // hide children whose parent is inactive (not returned)
    const clothing = (data ?? []).filter((c) => clothingCategorySlugs.has(c.slug));
    const ids = new Set(clothing.map((c) => c.id));
    const active = clothing.filter((c) => !c.parent_id || ids.has(c.parent_id));

    // Merge database categories with enriched catalog categories
    const existingSlugs = new Set(active.map((c) => c.slug));
    const missing = MOCK_CATEGORIES.filter((m) => !existingSlugs.has(m.slug));
    const merged = [...active, ...missing].sort(
      (a, b) => a.display_order - b.display_order || a.name_fr.localeCompare(b.name_fr),
    );
    return merged.length > 0 ? merged : MOCK_CATEGORIES;
  },
);

const FALLBACK_SETTINGS: Database["public"]["Tables"]["store_settings"]["Row"] = {
  id: true,
  store_name: "Maison Noura",
  currency: "TND",
  support_email: "bonjour@maisonnoura.tn",
  support_phone: "+216 70 000 021",
  delivery_fee: 8,
  free_delivery_threshold: 220,
  delivery_cities: [
    "Tunis",
    "Ariana",
    "Ben Arous",
    "Manouba",
    "Nabeul",
    "Zaghouan",
    "Bizerte",
    "Béja",
    "Jendouba",
    "Le Kef",
    "Siliana",
    "Sousse",
    "Monastir",
    "Mahdia",
    "Sfax",
    "Kairouan",
    "Kasserine",
    "Sidi Bouzid",
    "Gabès",
    "Médenine",
    "Tataouine",
    "Gafsa",
    "Tozeur",
    "Kébili",
  ],
  announcement_fr: "Livraison offerte dès 220 DT — paiement à la livraison",
  announcement_ar: "توصيل مجاني ابتداءً من 220 د.ت — الدفع عند الاستلام",
  default_low_stock_threshold: 5,
  return_window_days: 14,
  updated_at: new Date().toISOString(),
};

export const getStoreSettings = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb.from("store_settings").select("*").maybeSingle();
  if (error) {
    if (error.message?.includes("schema cache") || error.code === "PGRST205") {
      return FALLBACK_SETTINGS;
    }
    throw new Error(error.message);
  }
  return data ?? FALLBACK_SETTINGS;
});

export const publicCategoriesQuery = () =>
  queryOptions({
    queryKey: ["public", "categories"],
    queryFn: () => getPublicCategories(),
    staleTime: 60_000,
  });

export const storeSettingsQuery = () =>
  queryOptions({
    queryKey: ["public", "settings"],
    queryFn: () => getStoreSettings(),
    staleTime: 60_000,
  });
