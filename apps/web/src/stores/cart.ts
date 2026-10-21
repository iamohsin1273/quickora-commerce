import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartProduct = {
  id: string; slug: string; name: string; brand: string; image: string;
  unit: string; pricePaise: number; mrpPaise: number; available: number;
};
export type LocalCartLine = { product: CartProduct; quantity: number };
type CartStore = {
  lines: Record<string, LocalCartLine>;
  add: (product: CartProduct) => void;
  decrement: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
};
export const useCart = create<CartStore>()(persist((set) => ({
  lines: {},
  add: product => set(state => {
    const current = state.lines[product.id]?.quantity ?? 0;
    return current >= product.available || current >= 20 ? state : { lines: { ...state.lines, [product.id]: { product, quantity: current + 1 } } };
  }),
  decrement: id => set(state => {
    const current = state.lines[id];
    if (!current) return state;
    const lines = { ...state.lines };
    if (current.quantity <= 1) delete lines[id];
    else lines[id] = { ...current, quantity: current.quantity - 1 };
    return { lines };
  }),
  setQuantity: (id, quantity) => set(state => {
    const current = state.lines[id];
    if (!current) return state;
    const lines = { ...state.lines };
    if (quantity <= 0) delete lines[id];
    else lines[id] = { ...current, quantity: Math.min(quantity, 20, current.product.available) };
    return { lines };
  }),
  clear: () => set({ lines: {} })
}), { name: "quickora-guest-cart" }));
