import { useEffect, useState } from 'react';
import {
  cartsAreEquivalent,
  loadCartFromStorage,
  saveCartToStorage,
  syncCartWithOffers,
} from '../lib/cartUtils';

/** Owns browser-local cart hydration, persistence, and catalog reconciliation. */
export function useCartState({ offers = [], loadingCatalog = true, onItemsRemoved, removedMessage }) {
  const [cart, setCart] = useState(() => loadCartFromStorage());
  const [cartPriceUpdated, setCartPriceUpdated] = useState(false);

  useEffect(() => {
    saveCartToStorage(cart);
  }, [cart]);

  useEffect(() => {
    if (loadingCatalog || !offers.length || cart.length === 0) return;

    const { items, removedCount, priceUpdated } = syncCartWithOffers(cart, offers);
    if (!cartsAreEquivalent(cart, items)) {
      setCart(items);
      if (removedCount > 0) {
        onItemsRemoved?.(removedMessage);
      }
    }
    if (priceUpdated) setCartPriceUpdated(true);
  }, [offers, cart, loadingCatalog, onItemsRemoved, removedMessage]);

  return {
    cart,
    setCart,
    cartPriceUpdated,
    setCartPriceUpdated,
  };
}
