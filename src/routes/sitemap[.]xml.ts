import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { createSupabaseFetch } from "@/integrations/supabase/fetch";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const key = supabasePublishableKey();
        const sb = createClient<Database>(supabaseUrl(), key, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          global: { fetch: createSupabaseFetch(key) },
        });

        const [catsRes, prodsRes] = await Promise.all([
          sb.from("categories").select("slug, updated_at").eq("is_active", true).limit(200),
          sb
            .from("products")
            .select("slug, updated_at")
            .eq("status", "published")
            .order("updated_at", { ascending: false })
            .limit(1000),
        ]);

        const urls: { loc: string; lastmod?: string; priority: string }[] = [
          { loc: `${origin}/`, priority: "1.0" },
          { loc: `${origin}/shop`, priority: "0.9" },
          { loc: `${origin}/categories`, priority: "0.8" },
          { loc: `${origin}/track-order`, priority: "0.6" },
        ];

        for (const c of catsRes.data ?? []) {
          urls.push({
            loc: `${origin}/shop?c=${encodeURIComponent(c.slug)}`,
            lastmod: c.updated_at?.slice(0, 10),
            priority: "0.8",
          });
        }

        for (const p of prodsRes.data ?? []) {
          urls.push({
            loc: `${origin}/product/${encodeURIComponent(p.slug)}`,
            lastmod: p.updated_at?.slice(0, 10),
            priority: "0.85",
          });
        }

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls.map(
            (u) =>
              `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`,
          ),
          "</urlset>",
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
