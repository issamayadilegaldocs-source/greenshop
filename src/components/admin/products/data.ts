import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CategoryAttribute = {
  id: string;
  name_fr: string;
  name_ar: string | null;
  type: Tables<"category_attributes">["type"];
  unit: string | null;
  is_required: boolean;
  is_variant: boolean;
  inherited: boolean;
  options: Tables<"category_attribute_options">[];
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function fetchCategoryAttributes(categoryId: string): Promise<CategoryAttribute[]> {
  const { data, error } = await supabase.rpc("get_category_attributes", {
    _category_id: categoryId,
  });
  if (error) throw error;
  const ids = (data ?? []).map((a) => a.id);
  const { data: options, error: oErr } = ids.length
    ? await supabase
        .from("category_attribute_options")
        .select("*")
        .in("attribute_id", ids)
        .order("display_order")
        .order("value")
    : { data: [], error: null };
  if (oErr) throw oErr;
  return (data ?? []).map((a) => ({
    id: a.id,
    name_fr: a.name_fr,
    name_ar: a.name_ar,
    type: a.type,
    unit: a.unit,
    is_required: a.is_required,
    is_variant: a.is_variant,
    inherited: a.inherited,
    options: (options ?? []).filter((o) => o.attribute_id === a.id),
  }));
}

export async function fetchProductForEdit(id: string) {
  const { data, error } = await supabase
    .from("products")
    .select(
      "*, product_private(purchase_price), product_attribute_values(*), product_images(*), product_variants(*, variant_costs(cost), inventory(available, reserved), variant_attribute_values(attribute_id, option_id))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    product: data,
    purchasePrice: one(data.product_private)?.purchase_price ?? 0,
    values: data.product_attribute_values ?? [],
    images: [...(data.product_images ?? [])].sort((a, b) => a.position - b.position),
    variants: [...(data.product_variants ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({
        ...v,
        cost: one(v.variant_costs)?.cost ?? 0,
        stock: one(v.inventory)?.available ?? 0,
        options: Object.fromEntries(
          (v.variant_attribute_values ?? []).map((x) => [x.attribute_id, x.option_id]),
        ) as Record<string, string>,
      })),
  };
}

export type ProductForEdit = NonNullable<Awaited<ReturnType<typeof fetchProductForEdit>>>;
