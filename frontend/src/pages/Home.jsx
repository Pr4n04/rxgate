import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useCart } from '../context/CartContext';

export default function Home() {
  const { addItem } = useCart();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [popular, setPopular] = useState([]);
  const [addedFeedback, setAddedFeedback] = useState({});
  const navigate = useNavigate();

  const showAdded = (drugId) => {
    setAddedFeedback(prev => ({ ...prev, [drugId]: true }));
    setTimeout(() => {
      setAddedFeedback(prev => ({ ...prev, [drugId]: false }));
    }, 1500);
  };

  useEffect(() => {
    // Load popular drugs on mount
    api.get('/drugs?limit=6')
      .then(res => setPopular(res.data.drugs.slice(0, 6)))
      .catch(() => {});
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get(`/drugs?search=${encodeURIComponent(search)}`);
      setResults(res.data.drugs);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  const handleQuickSearch = async (term) => {
    setSearch(term);
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get(`/drugs?search=${encodeURIComponent(term)}`);
      setResults(res.data.drugs);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <div>
      {/* Hero / Search Section */}
      <section className="bg-rxgate-600">
        <div className="max-w-4xl mx-auto px-4 py-20 sm:py-28 text-center">
          {/* Logo Placeholder Area */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-white/10 rounded-full mb-4">
              <span className="text-white text-4xl font-extrabold tracking-wide">SP</span>
            </div>
            <p className="text-white/60 text-sm uppercase tracking-widest mt-2">
              Logo Placeholder — Add RxGate Logo Here
            </p>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-4">
            Your Pet's Pharmacy
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-10">
            Search our formulary of veterinary medications. All prescriptions reviewed by our pharmacy team before dispensing.
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search medications, active ingredients..."
                className="w-full pl-12 pr-6 py-4 rounded-xl border-0 text-gray-900 bg-white shadow-lg text-lg focus:outline-none focus:ring-2 focus:ring-white/50"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-rxgate-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-rxgate-700 transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Quick Search Tags */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {['Flea Treatment', 'Pain Relief', 'Antibiotics', 'Dewormer', 'Joint Care'].map((term) => (
              <button
                key={term}
                onClick={() => handleQuickSearch(term)}
                className="px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-sm hover:bg-white/20 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Search Results */}
      {searched && (
        <section className="max-w-4xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {loading ? 'Searching...' : `${results.length} result${results.length !== 1 ? 's' : ''} for "${search}"`}
            </h2>
            <button onClick={() => { setSearched(false); setSearch(''); }} className="text-sm text-rxgate-600 hover:text-rxgate-700">
              Clear search
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rxgate-600"></div>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <p className="text-lg font-medium mb-1">No medications found</p>
              <p className="text-sm">Try a different search term or browse our categories above.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((drug) => (
                <div key={drug.id} className="card hover:shadow-md transition-shadow">
                  <Link to={`/shop?drug=${drug.id}`} className="group block">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 group-hover:text-rxgate-600 transition-colors">{drug.name}</h3>
                      {drug.requires_prescription === 1 && (
                        <span className="badge-pending text-[10px] px-1.5">Rx</span>
                      )}
                    </div>
                    {drug.strength && <p className="text-sm text-gray-500">{drug.strength}</p>}
                    {drug.active_ingredient && <p className="text-xs text-gray-400 mt-1">{drug.active_ingredient}</p>}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <span className="text-lg font-bold text-rxgate-600">£{(drug.price / 100).toFixed(2)}</span>
                      <span className="text-xs text-gray-400">{drug.species}</span>
                    </div>
                  </Link>
                  <button
                    onClick={() => { addItem(drug); showAdded(drug.id); }}
                    className={`mt-2 w-full py-2 rounded-lg text-sm font-medium transition-all ${
                      addedFeedback[drug.id]
                        ? 'bg-green-500 text-white'
                        : 'bg-rxgate-50 text-rxgate-600 border border-rxgate-200 hover:bg-rxgate-100'
                    }`}
                  >
                    {addedFeedback[drug.id] ? '✓ Added to Cart' : 'Add to Cart'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Popular Medications (shown when no search) */}
      {!searched && (
        <section className="max-w-7xl mx-auto px-4 py-14">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900">Popular Medications</h2>
            <p className="text-gray-500 mt-2">Commonly prescribed veterinary pharmaceuticals</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((drug) => (
              <div key={drug.id} className="card hover:shadow-md transition-shadow">
                <Link to={`/shop?drug=${drug.id}`} className="group block">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 group-hover:text-rxgate-600">{drug.name}</h3>
                    {drug.requires_prescription === 1 && (
                      <span className="badge-pending text-[10px] px-1.5">Rx</span>
                    )}
                  </div>
                  {drug.strength && <p className="text-sm text-gray-500">{drug.strength}</p>}
                  <p className="text-xs text-gray-400 mt-1">{drug.active_ingredient}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-lg font-bold text-rxgate-600">£{(drug.price / 100).toFixed(2)}</span>
                    <span className="text-sm text-rxgate-600 opacity-0 group-hover:opacity-100 transition-opacity">View Details →</span>
                  </div>
                </Link>
                <button
                  onClick={() => { addItem(drug); showAdded(drug.id); }}
                  className={`mt-2 w-full py-2 rounded-lg text-sm font-medium transition-all ${
                    addedFeedback[drug.id]
                      ? 'bg-green-500 text-white'
                      : 'bg-rxgate-50 text-rxgate-600 border border-rxgate-200 hover:bg-rxgate-100'
                  }`}
                >
                  {addedFeedback[drug.id] ? '✓ Added to Cart' : 'Add to Cart'}
                </button>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/shop" className="btn-primary inline-block">Browse All Medications</Link>
          </div>
        </section>
      )}

      {/* How It Works */}
      {!searched && (
        <section className="bg-white py-16 border-t border-gray-100">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold text-gray-900">How It Works</h2>
              <p className="text-gray-500 mt-2">Simple, safe, and fully regulated</p>
            </div>
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { step: '01', title: 'Vet Uploads Prescription', desc: 'Your vet uploads your prescription to our secure platform.' },
                { step: '02', title: 'Pharmacy Review', desc: 'Our team reviews and approves the prescription within hours.' },
                { step: '03', title: 'Pay Online', desc: 'Receive a payment link via email. Pay securely with Stripe.' },
                { step: '04', title: 'Dispensed & Delivered', desc: 'We dispense and deliver your pet\'s medication promptly.' },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="w-14 h-14 bg-rxgate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-rxgate-600 font-bold text-xl">{item.step}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
