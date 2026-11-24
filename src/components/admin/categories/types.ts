import type { Enums, Tables } from "@/integrations/supabase/types";

export type Category = Tables<"categories">;
export type Attribute = Tables<"category_attributes">;
export type AttributeOption = Tables<"category_attribute_options">;
export type AttributeType = Enums<"attribute_type">;
export type AttributeWithOptions = Attribute & { category_attribute_options: AttributeOption[] };

export const ATTRIBUTE_TYPES: {
  value: AttributeType;
  fr: string;
  ar: string;
  hasOptions: boolean;
}[] = [
  { value: "text", fr: "Texte", ar: "نص", hasOptions: false },
  { value: "number", fr: "Nombre", ar: "رقم", hasOptions: false },
  { value: "measurement", fr: "Mesure (avec unité)", ar: "قياس (مع وحدة)", hasOptions: false },
  { value: "boolean", fr: "Oui / Non", ar: "نعم / لا", hasOptions: false },
  { value: "date", fr: "Date", ar: "تاريخ", hasOptions: false },
  { value: "dropdown", fr: "Liste (choix unique)", ar: "قائمة (اختيار واحد)", hasOptions: true },
  {
    value: "multi_select",
    fr: "Liste (choix multiples)",
    ar: "قائمة (اختيارات متعددة)",
    hasOptions: true,
  },
  { value: "color", fr: "Couleur", ar: "لون", hasOptions: true },
];

export function typeHasOptions(t: AttributeType) {
  return ATTRIBUTE_TYPES.find((x) => x.value === t)?.hasOptions ?? false;
}

/** ids of a category and all its descendants */
export function descendantIds(all: Category[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all)
      if (c.parent_id && out.has(c.parent_id) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
  }
  return out;
}

export function categoryPath(all: Category[], id: string | null): Category[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const path: Category[] = [];
  let cur = id ? byId.get(id) : undefined;
  let guard = 0;
  while (cur && guard++ < 25) {
    path.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path;
}
