import { useCart } from '../context/CartContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function CartSlideout() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, total, itemCount } = useCart();
  const navigate = useNavigate();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') closeCart(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeCart]);

  const handleCheckout = () => {
    closeCart();
    const token = localStorage.getItem('rxgate_token');
    navigate(token ? '/customer/dashboard' : '/login');
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={closeCart}
          aria-hidden="true"
        />
      )}

      {/* Slideout Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">
              Shopping Cart
              {itemCount > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </span>
              )}
            </h2>
            <button
              onClick={closeCart}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              aria-label="Close cart"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                <p className="text-lg font-medium mb-1">Your cart is empty</p>
                <p className="text-sm">Browse our formulary and add medications to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.drug?.id || Math.random()}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                  >
                    {/* Drug info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-gray-900 text-sm truncate">{item.drug?.name || 'Unknown'}</h3>
                        {item.drug?.requires_prescription === 1 && (
                          <span className="badge-pending text-[10px] px-1 shrink-0">Rx</span>
                        )}
                        {item.drug?.controlled_drug_schedule && (
                          <span className="badge-rejected text-[10px] px-1 shrink-0">{item.drug.controlled_drug_schedule}</span>
                        )}
                      </div>
                      {item.drug?.strength && (
                        <p className="text-xs text-gray-500">{item.drug.strength}</p>
                      )}
                      <p className="text-sm font-semibold text-rxgate-600 mt-1">
                        £{((item.drug?.price || 0) / 100 * item.quantity).toFixed(2)}
                      </p>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.drug?.id, item.quantity - 1)}
                        className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-gray-900">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.drug?.id, item.quantity + 1)}
                        className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-sm"
                      >
                        +
                      </button>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.drug?.id)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                      aria-label="Remove item"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer with total + checkout */}
          {items.length > 0 && (
            <div className="border-t border-gray-200 px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-lg font-bold text-gray-900">£{(total / 100).toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-400">
                Prescription medications require pharmacy approval before payment.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCheckout}
                  className="btn-primary flex-1 text-sm text-center"
                >
                  Upload Prescription & Checkout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
