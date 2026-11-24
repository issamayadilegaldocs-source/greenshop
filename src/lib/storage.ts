import { supabase } from "@/integrations/supabase/client";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload an image to the catalog store and return a long-lived link.
 * The store is private (workspace policy), so we keep the path to re-sign later if needed.
 */
export async function uploadCatalogImage(
  file: File,
  folder: "categories" | "products",
): Promise<{ path: string; url: string }> {
  if (!ALLOWED.includes(file.type)) throw new Error("Format accepté : JPG, PNG, WEBP ou AVIF.");
  if (file.size > MAX_BYTES) throw new Error("Image trop lourde (5 Mo maximum).");
  const ext =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("catalog")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data, error: signError } = await supabase.storage
    .from("catalog")
    .createSignedUrl(path, TEN_YEARS);
  if (signError || !data) throw signError ?? new Error("Lien d'image indisponible");
  return { path, url: data.signedUrl };
}
