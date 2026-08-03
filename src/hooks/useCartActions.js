import { useCallback } from 'react';
import { pickCartSnapshot, getCartLineKey, isCartFull } from '../lib/cartUtils';
import { isCartEligibleOffer } from '../lib/catalogUtils';

export function useCartActions({
  cart,
  user,
  games,
  navigate,
  showToast,
  showNotification,
  t,
  cartIconRef,
  setCart,
  setCartPriceUpdated,
  setFlyingItems,
}) {
  const addToCart = useCallback((product, e = null) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user?.role === 'admin') {
      showToast(t.adminCannotPurchase, 'error');
      return;
    }
    if (!isCartEligibleOffer(product, games)) {
      showToast(t.cartUidCheckoutBlocked, 'error');
      return;
    }
    if (isCartFull(cart)) {
      showToast(t.cartMaxItems || t.cartEmptyOrUnavailable, 'error');
      return;
    }
    setCart((prev) => {
      if (isCartFull(prev)) return prev;
      return [...prev, pickCartSnapshot(product)];
    });
    setCartPriceUpdated(false);
    showNotification(t.addMsg);

    if (cartIconRef.current) {
      cartIconRef.current.classList.add('cart-bump');
      setTimeout(() => {
        if (cartIconRef.current) {
          cartIconRef.current.classList.remove('cart-bump');
        }
      }, 450);
    }

    if (e && e.currentTarget) {
      const startRect = e.currentTarget.getBoundingClientRect();
      const endRect = cartIconRef.current ? cartIconRef.current.getBoundingClientRect() : null;

      if (endRect) {
        const flyId = Date.now() + Math.random();
        setFlyingItems((prev) => [...prev, {
          id: flyId,
          product,
          startRect,
          endRect,
        }]);

        setTimeout(() => {
          setFlyingItems((prev) => prev.filter((item) => item.id !== flyId));
        }, 800);
      }
    }
  }, [
    cart,
    user,
    games,
    navigate,
    showToast,
    showNotification,
    t,
    cartIconRef,
    setCart,
    setCartPriceUpdated,
    setFlyingItems,
  ]);

  const getCartTotal = useCallback(
    () => cart.reduce((total, item) => total + parseFloat(item.price), 0).toFixed(2),
    [cart],
  );

  const removeCartItem = useCallback((lineId) => {
    setCart((prev) => prev.filter((item) => getCartLineKey(item) !== lineId));
  }, [setCart]);

  return { addToCart, getCartTotal, removeCartItem };
}
