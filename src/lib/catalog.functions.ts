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
      "Les pièces indispensables du quotidien, choisies pour leur confort et leur tenue.",
    description_ar: "قطع لا غنى عنها لكل يوم، مختارة لراحتها وجودتها.",
    image_url: "/demo/tshirt-coton-bio.jpg",
    display_order: 3,
  },
  {
    id: "cat-audio-son",
    parent_id: null,
    name_fr: "Audio & Son",
    name_ar: "الصوت والسماعات",
    slug: "audio-son",
    description_fr:
      "Casques sans fil, écouteurs et enceintes nomades au son pur et au design épuré.",
    description_ar: "سماعات رأس وأذن ومكبرات صوت لاسلكية بصوت نقي وتصميم أنيق.",
    image_url: "/demo/casque-audio.jpg",
    display_order: 4,
  },
  {
    id: "cat-electromenager",
    parent_id: null,
    name_fr: "Électroménager",
    name_ar: "الأجهزة المنزلية",
    slug: "electromenager",
    description_fr:
      "Petit électroménager de cuisine et café, pensé pour allier performance et esthétique.",
    description_ar: "أجهزة مطبخ وقهوة صغيرة تجمع بين الأداء العالي والتصميم الهادئ.",
    image_url: "/demo/machine-espresso.jpg",
    display_order: 5,
  },
  {
    id: "cat-maison-deco",
    parent_id: null,
    name_fr: "Maison & Déco",
    name_ar: "المنزل والديكور",
    slug: "maison-deco",
    description_fr:
      "Luminaires sans fil et arts de la table aux teintes douces pour un intérieur apaisant.",
    description_ar: "إضاءة لاسلكية وأدوات مائدة بألوان هادئة لمنزل مريح وأنيق.",
    image_url: "/demo/lampe-table.jpg",
    display_order: 6,
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
  {
    id: "cat-casques-ecouteurs",
    parent_id: "cat-audio-son",
    name_fr: "Casques & Écouteurs",
    name_ar: "سماعات الرأس والأذن",
    slug: "casques-ecouteurs",
    description_fr: "Réduction de bruit active, confort longue durée et autonomie étendue.",
    description_ar: "عزل نشط للضوضاء وراحة طوال اليوم وبطارية تدوم طويلاً.",
    image_url: "/demo/casque-audio.jpg",
    display_order: 1,
  },
  {
    id: "cat-enceintes-sans-fil",
    parent_id: "cat-audio-son",
    name_fr: "Enceintes sans fil",
    name_ar: "مكبرات صوت لاسلكية",
    slug: "enceintes-sans-fil",
    description_fr: "Enceintes compactes en tissu acoustique pour la maison et vos déplacements.",
    description_ar: "مكبرات صوت مدمجة بقماش صوتي أنيق للمنزل والتنقل.",
    image_url: "/demo/enceinte-bluetooth.jpg",
    display_order: 2,
  },
  {
    id: "cat-cafe-petit-dejeuner",
    parent_id: "cat-electromenager",
    name_fr: "Café & Petit-déjeuner",
    name_ar: "القهوة والفطور",
    slug: "cafe-petit-dejeuner",
    description_fr: "Machines espresso compactes et bouilloires de précision pour vos matins.",
    description_ar: "آلات إسبريسو مدمجة وغلايات دقيقة لصباح مثالي.",
    image_url: "/demo/machine-espresso.jpg",
    display_order: 1,
  },
  {
    id: "cat-cuisine-preparation",
    parent_id: "cat-electromenager",
    name_fr: "Cuisine & Préparation",
    name_ar: "المطبخ والتحضير",
    slug: "cuisine-preparation",
    description_fr: "Appareils malins et cuisson saine au quotidien.",
    description_ar: "أجهزة ذكية لطهي صحي وسريع كل يوم.",
    image_url: "/demo/air-fryer.jpg",
    display_order: 2,
  },
  {
    id: "cat-luminaire-ambiance",
    parent_id: "cat-maison-deco",
    name_fr: "Luminaire & Ambiance",
    name_ar: "الإضاءة والأجواء",
    slug: "luminaire-ambiance",
    description_fr: "Lampes rechargeables à lumière chaude pour le salon ou la table de chevet.",
    description_ar: "مصابيح قابلة للشحن بإضاءة دافئة لغرفة الجلوس أو النوم.",
    image_url: "/demo/lampe-table.jpg",
    display_order: 1,
  },
  {
    id: "cat-arts-de-la-table",
    parent_id: "cat-maison-deco",
    name_fr: "Arts de la table",
    name_ar: "أدوات المائدة",
    slug: "arts-de-la-table",
    description_fr: "Céramiques et grès émaillés façonnés dans des teintes naturelles.",
    description_ar: "أكواب وخزف بألوان طبيعية وملمس أنيق.",
    image_url: "/demo/mugs-ceramique.jpg",
    display_order: 2,
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
    const rows = data ?? [];
    if (rows.length === 0) return MOCK_CATEGORIES;
    // Hide children whose parent is inactive (not returned)
    const ids = new Set(rows.map((c) => c.id));
    return rows.filter((c) => !c.parent_id || ids.has(c.parent_id));
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
