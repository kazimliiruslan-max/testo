import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface CartItem {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartCtx {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  add: (restaurantId: string, restaurantName: string, item: Omit<CartItem, 'quantity'>) => void;
  remove: (menu_item_id: string) => void;
  clear: () => void;
  total: number;
}

const Ctx = createContext<CartCtx | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);

  const add = useCallback((rid: string, rname: string, item: Omit<CartItem, 'quantity'>) => {
    setItems((prev) => {
      if (restaurantId && restaurantId !== rid) {
        setRestaurantId(rid);
        setRestaurantName(rname);
        return [{ ...item, quantity: 1 }];
      }
      if (!restaurantId) {
        setRestaurantId(rid);
        setRestaurantName(rname);
      }
      const existing = prev.find((i) => i.menu_item_id === item.menu_item_id);
      if (existing) {
        return prev.map((i) => i.menu_item_id === item.menu_item_id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, [restaurantId]);

  const remove = useCallback((mid: string) => {
    setItems((prev) => {
      const next = prev.map((i) => i.menu_item_id === mid ? { ...i, quantity: i.quantity - 1 } : i).filter((i) => i.quantity > 0);
      if (next.length === 0) {
        setRestaurantId(null);
        setRestaurantName(null);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setRestaurantId(null);
    setRestaurantName(null);
  }, []);

  const total = useMemo(() => items.reduce((s, i) => s + i.price * i.quantity, 0), [items]);

  return (
    <Ctx.Provider value={{ restaurantId, restaurantName, items, add, remove, clear, total }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be inside CartProvider');
  return c;
}
