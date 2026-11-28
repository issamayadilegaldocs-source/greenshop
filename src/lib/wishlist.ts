import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { ProductCardData } from "@/lib/shop.functions";

const WISHLIST_LS_KEY = "maison-noura.wishlist.v1";
const RECENT_LS_KEY = "maison-noura.recent.v1";

function readLocalIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLocalIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WISHLIST_LS_KEY, JSON.stringify([...new Set(ids)].slice(0, 100)));
  window.dispatchEvent(new Event("maison-noura-wishlist"));
}

export function useWishlist() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [localIds, setLocalIds] = useState<string[]>([]);

  useEffect(() => {
    setLocalIds(readLocalIds());
    const sync = () => setLocalIds(readLocalIds());
    window.addEventListener("maison-noura-wishlist", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("maison-noura-wishlist", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const dbQuery = useQuery({
    queryKey: ["wishlist", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wishlists")
        .select("product_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as { product_id: string }[]).map((r) => r.product_id);
    },
  });

  const ids = user?.id ? (dbQuery.data ?? localIds) : localIds;

  const toggleMutation = useMutation({
    mutationFn: async (productId: string) => {
      const exists = ids.includes(productId);
      if (user?.id) {
        if (exists) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from("wishlists")
            .delete()
            .eq("user_id", user.id)
            .eq("product_id", productId);
          if (error) throw error;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from("wishlists")
            .upsert(
              { user_id: user.id, product_id: productId },
              { onConflict: "user_id,product_id" },
            );
          if (error) throw error;
        }
        return !exists;
      }
      const next = exists ? localIds.filter((id) => id !== productId) : [productId, ...localIds];
      writeLocalIds(next);
      setLocalIds(next);
      return !exists;
    },
    onSuccess: () => {
      if (user?.id) qc.invalidateQueries({ queryKey: ["wishlist", user.id] });
    },
  });

  const has = useCallback((productId: string) => ids.includes(productId), [ids]);
  const toggle = useCallback(
    (productId: string) => toggleMutation.mutateAsync(productId),
    [toggleMutation],
  );

  return { ids, count: ids.length, has, toggle, isPending: toggleMutation.isPending };
}

export function recordRecentlyViewed(product: ProductCardData) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RECENT_LS_KEY);
    const list: ProductCardData[] = raw ? JSON.parse(raw) : [];
    const next = [product, ...list.filter((p) => p && p.id !== product.id)].slice(0, 8);
    window.localStorage.setItem(RECENT_LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function useRecentlyViewed(): ProductCardData[] {
  const [items, setItems] = useState<ProductCardData[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_LS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setItems(parsed.slice(0, 8));
    } catch {
      /* ignore */
    }
  }, []);
  return items;
}
