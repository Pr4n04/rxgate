import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const CartContext = createContext(null);

const CART_KEY = 'rxgate_cart';

function loadCart() {
  try {
    const saved = localStorage.getItem(CART_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

function saveCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {}
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  // Persist to localStorage whenever items change
  useEffect(() => { saveCart(items); }, [items]);

  const addItem = useCallback((drug, quantity = 1) => {
    setItems(prev => {
      const existing = prev.find(i => i.drug?.id === drug.id);
      if (existing) {
        return prev.map(i =>
          i.drug?.id === drug.id
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...prev, { drug, quantity, addedAt: Date.now() }];
    });
    // Briefly open cart to show feedback
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((drugId) => {
    setItems(prev => prev.filter(i => i.drug?.id !== drugId));
  }, []);

  const updateQuantity = useCallback((drugId, quantity) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.drug?.id !== drugId));
      return;
    }
    setItems(prev =>
      prev.map(i =>
        i.drug?.id === drugId ? { ...i, quantity } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const total = items.reduce((sum, i) => sum + (i.drug?.price || 0) * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const hasItems = items.length > 0;

  // Get items grouped for prescription submission
  const getCartSummary = useCallback(() => {
    return items.map(i => ({
      drugId: i.drug?.id,
      drugName: i.drug?.name,
      quantity: i.quantity,
      price: i.drug?.price,
      requiresPrescription: i.drug?.requires_prescription,
      isControlledDrug: !!i.drug?.controlled_drug_schedule,
      cdSchedule: i.drug?.controlled_drug_schedule || null,
    }));
  }, [items]);

  // Send cart items to backend for OCR matching
  const matchDrugNamesFromOCR = useCallback(async (ocrText) => {
    try {
      const res = await api.post('/drugs/match-from-text', { text: ocrText });
      return res.data.matches || [];
    } catch {
      return [];
    }
  }, []);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      total, itemCount, hasItems,
      isOpen, openCart, closeCart,
      getCartSummary, matchDrugNamesFromOCR,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
