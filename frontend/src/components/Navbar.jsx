import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useState } from 'react';

export default function Navbar() {
  const { isLoggedIn, user, isVet, isAdmin, isCustomer, logout } = useAuth();
  const { itemCount, openCart } = useCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-rxgate-600 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <span className="text-rxgate-600 font-extrabold text-lg">SP</span>
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-lg tracking-tight">RxGate</span>
              <span className="block text-xs text-white/70 -mt-1">Veterinary Pharmacy</span>
            </div>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-1">
            <Link to="/" className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">Home</Link>
            <Link to="/shop" className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">Shop</Link>

            {isLoggedIn ? (
              <>
                {isCustomer && <Link to="/customer/dashboard" className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">My Dashboard</Link>}
                {isVet && <Link to="/vet/dashboard" className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">Vet Dashboard</Link>}
                {isAdmin && <Link to="/admin/dashboard" className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">Admin</Link>}
                <Link to="/my-orders" className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">Orders</Link>

                <div className="ml-3 flex items-center space-x-3">
                  <span className="text-sm text-white/80">
                    {user?.name?.split(' ')[0]}
                    {isAdmin && <span className="text-amber-300 ml-1">(Admin)</span>}
                  </span>
                  <button onClick={handleLogout} className="bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/login" className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">Login</Link>
                <Link to="/register" className="bg-white text-rxgate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rxgate-50 transition-colors">Register</Link>
              </div>
            )}

            {/* Cart Icon */}
            <button onClick={openCart} className="relative p-2 rounded-lg hover:bg-white/10 transition-colors ml-2" aria-label="Open cart">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-lg">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>
          </div>

          {/* Mobile menu button */}
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 space-y-1">
            <Link to="/" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">Home</Link>
            <Link to="/shop" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">Shop</Link>

            {isLoggedIn ? (
              <>
                {isCustomer && <Link to="/customer/dashboard" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">My Dashboard</Link>}
                {isVet && <Link to="/vet/dashboard" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">Vet Dashboard</Link>}
                {isAdmin && <Link to="/admin/dashboard" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">Admin</Link>}
                <Link to="/my-orders" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">Orders</Link>
                <button onClick={() => { handleLogout(); setMenuOpen(false); }} className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">Login</Link>
                <Link to="/register" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10">Register</Link>
              </>
            )}

            {/* Footer links in mobile menu */}
            <div className="border-t border-white/10 pt-2 mt-2">
              <Link to="/privacy" onClick={() => setMenuOpen(false)} className="block px-3 py-1.5 text-xs text-white/60 hover:text-white/80">Privacy Policy</Link>
              <Link to="/terms" onClick={() => setMenuOpen(false)} className="block px-3 py-1.5 text-xs text-white/60 hover:text-white/80">Terms of Service</Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
