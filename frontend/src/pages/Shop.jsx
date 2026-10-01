import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useCart } from '../context/CartContext';

export default function Shop() {
  const { addItem, items, openCart } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [species, setSpecies] = useState('');
  const [rxFilter, setRxFilter] = useState('all');
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [addedFeedback, setAddedFeedback] = useState({});

  const showAdded = (drugId) => {
    setAddedFeedback(prev => ({ ...prev, [drugId]: true }));
    setTimeout(() => {
      setAddedFeedback(prev => ({ ...prev, [drugId]: false }));
    }, 1500);
  };

  useEffect(() => {
    loadDrugs();
  }, [species, rxFilter]);

  const loadDrugs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (species) params.species = species;
      if (rxFilter === 'required') params.prescription = 'required';
      else if (rxFilter === 'not_required') params.prescription = 'not_required';
      if (search) params.search = search;

      const res = await api.get('/drugs', { params });
      setDrugs(res.data.drugs);

      // Check if a specific drug was requested
      const drugId = searchParams.get('drug');
      if (drugId) {
        const found = res.data.drugs.find(d => d.id === drugId);
        if (found) setSelectedDrug(found);
      }
    } catch (err) {
      console.error('Failed to load drugs:', err);
    }
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadDrugs();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Medication Formulary</h1>
        <p className="text-gray-500 mt-1">Browse our complete range of veterinary medications</p>
      </div>

      {/* Filters */}
      <div className="card mb-8">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ingredient..."
              className="input-field pl-10"
            />
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select value={species} onChange={(e) => setSpecies(e.target.value)} className="input-field sm:w-40">
            <option value="">All Species</option>
            <option value="Dog">Dog</option>
            <option value="Cat">Cat</option>
            <option value="Dog & Cat">Dog & Cat</option>
          </select>
          <select value={rxFilter} onChange={(e) => setRxFilter(e.target.value)} className="input-field sm:w-44">
            <option value="all">All Medications</option>
            <option value="required">Prescription Required</option>
            <option value="not_required">No Prescription Needed</option>
          </select>
          <button type="submit" className="btn-primary">Search</button>
        </form>
      </div>

      {/* Selected Drug Detail */}
      {selectedDrug && (
        <div className="card mb-8 border-rxgate-200 bg-rxgate-50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedDrug.name}</h2>
              {selectedDrug.strength && <p className="text-gray-500">{selectedDrug.strength}</p>}
            </div>
            <button onClick={() => setSelectedDrug(null)} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-500">Active Ingredient</p>
              <p className="font-medium">{selectedDrug.active_ingredient || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Species</p>
              <p className="font-medium">{selectedDrug.species || 'Various'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Price</p>
              <p className="text-2xl font-bold text-rxgate-600">£{(selectedDrug.price / 100).toFixed(2)}</p>
            </div>
              <div>
                <p className="text-sm text-gray-500">Prescription</p>
                <p className="font-medium">{selectedDrug.requires_prescription ? 'Required' : 'Not Required'}</p>
              </div>
              {selectedDrug.controlled_drug_schedule && (
                <div className="sm:col-span-2">
                  <p className="text-sm text-gray-500">Controlled Drug Classification</p>
                  <p className="font-medium text-red-600">{selectedDrug.controlled_drug_schedule}</p>
                  <p className="text-xs text-gray-400 mt-1">Additional prescription validation and supply limits apply.</p>
                </div>
              )}
            </div>
          {selectedDrug.description && <p className="text-sm text-gray-600 mb-4">{selectedDrug.description}</p>}

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => { addItem(selectedDrug); showAdded(selectedDrug.id); }}
              className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
                addedFeedback[selectedDrug.id]
                  ? 'bg-green-500 text-white'
                  : 'bg-rxgate-600 text-white hover:bg-rxgate-700'
              }`}
            >
              {addedFeedback[selectedDrug.id] ? '✓ Added to Cart' : 'Add to Cart'}
            </button>
            <button
              onClick={() => {
                addItem(selectedDrug);
                const token = localStorage.getItem('rxgate_token');
                navigate(token ? '/customer/dashboard' : '/register');
              }}
              className="btn-secondary text-sm py-2.5"
            >
              Buy Now
            </button>
          </div>

          <div className="bg-white rounded-lg p-4 text-sm text-gray-600">
            <p className="font-medium text-rxgate-600 mb-1">📋 How to order prescription medications:</p>
            <p className="mb-2"><strong>Option 1:</strong> Ask your veterinary practice to upload your prescription to RxGate on your behalf.</p>
            <p><strong>Option 2:</strong> <Link to={localStorage.getItem('rxgate_token') ? '/customer/dashboard' : '/register'} className="text-rxgate-600 underline">Create an account</Link> and upload your paper prescription directly. Our pharmacy team will review it.</p>
          </div>
        </div>
      )}

      {/* Drug List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rxgate-600"></div>
        </div>
      ) : drugs.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <p className="text-lg font-medium">No medications found</p>
          <p className="text-sm">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {drugs.map((drug) => {
            const inCart = items.some(i => i.drug?.id === drug.id);
            return (
              <div key={drug.id} className="card hover:shadow-md transition-shadow">
                <div onClick={() => setSelectedDrug(drug)} className="cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 hover:text-rxgate-600">{drug.name}</h3>
                    <div className="flex gap-1">
                      {drug.requires_prescription === 1 && (
                        <span className="badge-pending text-[10px] px-1.5">Rx</span>
                      )}
                      {drug.controlled_drug_schedule && (
                        <span className="badge-rejected text-[10px] px-1.5">{drug.controlled_drug_schedule}</span>
                      )}
                    </div>
                  </div>
                  {drug.strength && <p className="text-sm text-gray-500">{drug.strength}</p>}
                  {drug.active_ingredient && <p className="text-xs text-gray-400 mt-1 truncate">{drug.active_ingredient}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-lg font-bold text-rxgate-600">£{(drug.price / 100).toFixed(2)}</span>
                    <span className="text-xs text-gray-400">{drug.species || 'Various'}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); addItem(drug); showAdded(drug.id); }}
                  className={`mt-3 w-full py-2 rounded-lg text-sm font-medium transition-all ${
                    addedFeedback[drug.id]
                      ? 'bg-green-500 text-white'
                      : inCart
                        ? 'bg-rxgate-50 text-rxgate-600 border border-rxgate-200 hover:bg-rxgate-100'
                        : 'bg-rxgate-600 text-white hover:bg-rxgate-700'
                  }`}
                >
                  {addedFeedback[drug.id] ? '✓ Added!' : inCart ? 'Add More' : 'Add to Cart'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
