import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  variantId: string;
  productId: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  label_fr: string;
  label_ar: string;
  image: string | null;
  /** price the shopper saw when adding; the server recomputes at checkout */
  unitPrice: number;
  qty: number;
};

export const MAX_LINE_QTY = 20;
const STORAGE_KEY = "maison-noura.cart.v1";

type CartCtx = {
  items: CartItem[];
  ready: boolean;
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, "qty">, qty: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);

export function clampQty(qty: number, max = MAX_LINE_QTY) {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(Math.floor(qty), max));
}

/** Adds qty to an existing line or appends a new one, never above MAX_LINE_QTY. */
export function mergeCartItem(
  items: CartItem[],
  item: Omit<CartItem, "qty">,
  qty: number,
): CartItem[] {
  const existing = items.find((i) => i.variantId === item.variantId);
  if (existing)
    return items.map((i) =>
      i.variantId === item.variantId ? { ...i, ...item, qty: clampQty(i.qty + qty) } : i,
    );
  return [...items, { ...item, qty: clampQty(qty) }];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed))
          setItems(
            parsed.filter((i) => i && typeof i.variantId === "string" && i.qty > 0).slice(0, 50),
          );
      }
    } catch {
      /* ignore corrupted cart */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        setItems(e.newValue ? (JSON.parse(e.newValue) as CartItem[]) : []);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback(
    (item: Omit<CartItem, "qty">, qty: number) =>
      setItems((prev) => mergeCartItem(prev, item, qty)),
    [],
  );
  const setQty = useCallback(
    (variantId: string, qty: number) =>
      setItems((prev) =>
        prev.map((i) => (i.variantId === variantId ? { ...i, qty: clampQty(qty) } : i)),
      ),
    [],
  );
  const remove = useCallback(
    (variantId: string) => setItems((prev) => prev.filter((i) => i.variantId !== variantId)),
    [],
  );
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartCtx>(
    () => ({
      items,
      ready,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotal: items.reduce((n, i) => n + i.qty * i.unitPrice, 0),
      add,
      setQty,
      remove,
      clear,
    }),
    [items, ready, add, setQty, remove, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
