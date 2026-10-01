import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';
import api from '../api/axios';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const { items: cartItems, total: cartTotal, itemCount, removeItem, updateQuantity, clearCart, openCart, matchDrugNamesFromOCR, addItem } = useCart();
  const [activeTab, setActiveTab] = useState('cart');
  const [prescriptions, setPrescriptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [drugs, setDrugs] = useState([]);
  const fileInputRef = useRef(null);

  // Upload form state
  const [form, setForm] = useState({
    drugId: '',
    drugName: '',
    dosageInstructions: '',
    vetNameOnRx: '',
    vetRegNumberOnRx: '',
    prescriptionDate: '',
  });

  // OCR match results
  const [ocrMatches, setOcrMatches] = useState([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Consent management
  const [showConsentManager, setShowConsentManager] = useState(false);
  const [consentStatus, setConsentStatus] = useState({ gdprConsent: true, marketingConsent: false });

  // Deletion request
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteStatus, setDeleteStatus] = useState('');

  useEffect(() => {
    loadPrescriptions();
    loadStats();
    loadConsentStatus();
    api.get('/drugs').then(res => setDrugs(res.data.drugs)).catch(() => {});
  }, []);

  // Auto-fill medication from cart when switching to upload tab
  useEffect(() => {
    if (activeTab === 'upload' && cartItems.length > 0) {
      setForm(prev => {
        if (prev.drugId) return prev; // Don't overwrite user's manual selection
        const firstItem = cartItems[0];
        if (firstItem.drug?.id) {
          return { ...prev, drugId: firstItem.drug.id, drugName: firstItem.drug.name };
        }
        return prev;
      });
    }
  }, [activeTab, cartItems]);

  const loadPrescriptions = async () => {
    try {
      const res = await api.get('/customer/prescriptions');
      setPrescriptions(res.data.prescriptions);
    } catch (err) {
      console.error('Failed to load:', err);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const res = await api.get('/customer/stats');
      setStats(res.data.stats);
    } catch (err) { console.error(err); }
  };

  const loadConsentStatus = async () => {
    try {
      const res = await api.get('/gdpr/consent-status');
      setConsentStatus(res.data);
    } catch (err) { console.error(err); }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleDrugSelect = (e) => {
    const drugId = e.target.value;
    if (drugId) {
      const drug = drugs.find(d => d.id === drugId);
      if (drug) {
        setForm(prev => ({ ...prev, drugId, drugName: drug.name }));
        return;
      }
    }
    setForm(prev => ({ ...prev, drugId, drugName: '' }));
  };

  // Run OCR on the selected file before submitting
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setOcrDone(false);
    setOcrMatches([]);
    setOcrLoading(true);
    setUploadError('');

    // Create FormData to send to a temporary OCR endpoint
    const fd = new FormData();
    fd.append('prescriptionImage', file);

    try {
      // We use a special endpoint that just does OCR without saving
      const res = await api.post('/customer/preview-ocr', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, // OCR can be slow
      });
      const { ocrText, parsedInfo } = res.data;
      setOcrDone(true);

      // Match extracted text against drug DB
      if (ocrText && ocrText !== '[OCR failed]') {
        const matches = await matchDrugNamesFromOCR(ocrText);
        setOcrMatches(matches || []);
      }
    } catch (err) {
      console.error('OCR preview failed:', err);
      setOcrDone(true);
      setUploadError('OCR processing failed. You can still submit your prescription manually.');
    }
    setOcrLoading(false);
  };

  const addAllOcrMatchesToCart = () => {
    ocrMatches.forEach(m => {
      if (m.drug) {
        // Only add if not already in cart
        const alreadyInCart = cartItems.some(i => i.drug?.id === m.drug.id);
        if (!alreadyInCart) addItem(m.drug);
      }
    });
    // Auto-fill form with the first OCR match drug
    if (ocrMatches.length > 0 && ocrMatches[0].drug) {
      setForm(prev => ({ ...prev, drugId: ocrMatches[0].drug.id, drugName: ocrMatches[0].drug.name }));
    }
  };

  // Submit the prescription with cart items
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fileInputRef.current?.files[0]) {
      setUploadError('Please select a prescription image to upload.');
      return;
    }

    setSubmitting(true);
    setUploadSuccess('');
    setUploadError('');

    const formData = new FormData();
    formData.append('drugId', form.drugId);
    formData.append('drugName', form.drugName);
    formData.append('dosageInstructions', form.dosageInstructions);
    formData.append('vetNameOnRx', form.vetNameOnRx);
    formData.append('vetRegNumberOnRx', form.vetRegNumberOnRx);
    formData.append('prescriptionDate', form.prescriptionDate);

    // Include cart items if any
    if (cartItems.length > 0) {
      const items = cartItems.map(i => ({
        drugId: i.drug?.id,
        drugName: i.drug?.name,
        quantity: i.quantity,
        price: i.drug?.price,
        requiresPrescription: i.drug?.requires_prescription,
        isControlledDrug: !!i.drug?.controlled_drug_schedule,
        cdSchedule: i.drug?.controlled_drug_schedule || null,
      }));
      formData.append('cartItems', JSON.stringify(items));
    }

    formData.append('prescriptionImage', fileInputRef.current.files[0]);

    try {
      const res = await api.post('/customer/prescriptions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // OCR can be slow
      });
      setUploadSuccess(`✅ Prescription uploaded! Reference: #${res.data.prescription.id.substring(0, 8)}. Our pharmacy team will review your ${cartItems.length > 0 ? cartItems.length + ' item(s)' : 'prescription'} shortly.`);
      setForm({ drugId: '', drugName: '', dosageInstructions: '', vetNameOnRx: '', vetRegNumberOnRx: '', prescriptionDate: '' });
      setOcrMatches([]);
      setOcrDone(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      clearCart();
      loadPrescriptions();
      loadStats();
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed.');
    }
    setSubmitting(false);
  };

  const handleConsentUpdate = async (field, value) => {
    try {
      const body = field === 'gdprConsent'
        ? { gdprConsent: value }
        : { marketingConsent: value };
      await api.post('/gdpr/consent', body);
      setConsentStatus(prev => ({ ...prev, [field]: value }));
    } catch (err) {
      alert('Failed to update consent.');
    }
  };

  const handleDeleteRequest = async () => {
    if (deleteConfirm !== 'DELETE') {
      setDeleteStatus('Please type DELETE to confirm.');
      return;
    }
    try {
      const res = await api.post('/gdpr/request-deletion', { confirmation: 'DELETE' });
      setDeleteStatus(`✅ ${res.data.message}`);
      setDeleteConfirm('');
    } catch (err) {
      setDeleteStatus(`❌ ${err.response?.data?.error || 'Request failed.'}`);
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected',
      payment_sent: 'badge-approved', paid: 'badge-paid', fulfilled: 'badge-fulfilled',
    };
    const labels = {
      pending: 'Pending Review', approved: 'Approved', rejected: 'Rejected',
      payment_sent: 'Payment Sent', paid: 'Paid', fulfilled: 'Fulfilled',
    };
    return <span className={map[status] || 'badge-pending'}>{labels[status] || status}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
          <p className="text-gray-500">{user?.email}</p>
        </div>
        <button onClick={() => setShowConsentManager(!showConsentManager)} className="text-sm text-rxgate-600 hover:text-rxgate-700 border border-rxgate-200 px-3 py-1.5 rounded-lg">
          {showConsentManager ? 'Close' : 'Privacy Settings'}
        </button>
      </div>

      {/* GDPR Consent Manager */}
      {showConsentManager && (
        <div className="card mb-6 border-rxgate-200 bg-rxgate-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🔐 Privacy & Consent Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-white rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Data Processing Consent</p>
                <p className="text-sm text-gray-500">Allow RxGate to process your personal data for prescription processing.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={consentStatus.gdprConsent} onChange={e => handleConsentUpdate('gdprConsent', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rxgate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rxgate-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-3 bg-white rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Marketing Communications</p>
                <p className="text-sm text-gray-500">Receive occasional emails about new medications and health tips.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={consentStatus.marketingConsent} onChange={e => handleConsentUpdate('marketingConsent', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rxgate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rxgate-600"></div>
              </label>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-2">
              <Link to="/privacy" className="text-sm text-rxgate-600 hover:text-rxgate-700 block">📄 View Privacy Policy →</Link>
              <Link to="/terms" className="text-sm text-rxgate-600 hover:text-rxgate-700 block">📄 View Terms of Service →</Link>
              <button onClick={async () => { try { const res = await api.get('/gdpr/data'); const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'my-rxgate-data.json'; a.click(); } catch (e) { alert('Failed to export data.'); } }} className="text-sm text-rxgate-600 hover:text-rxgate-700 block">
                📥 Export My Data (Subject Access Request)
              </button>

              <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="font-medium text-red-700 text-sm mb-2">⚠️ Right to Erasure (Delete Account)</p>
                <p className="text-xs text-red-600 mb-2">This will anonymise all your personal data. Prescription records may be retained in redacted form for regulatory compliance.</p>
                <div className="flex gap-2">
                  <input type="text" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder='Type "DELETE" to confirm' className="input-field text-sm flex-1" />
                  <button onClick={handleDeleteRequest} className="btn-danger text-sm py-1.5 px-3">Request Deletion</button>
                </div>
                {deleteStatus && <p className={`text-xs mt-1 ${deleteStatus.includes('❌') ? 'text-red-600' : 'text-green-600'}`}>{deleteStatus}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900' },
            { label: 'Pending', value: stats.pending, color: 'text-amber-600' },
            { label: 'Approved', value: stats.approved, color: 'text-green-600' },
            { label: 'Paid', value: stats.paid, color: 'text-blue-600' },
            { label: 'Fulfilled', value: stats.fulfilled, color: 'text-emerald-600' },
          ].map((s) => (
            <div key={s.label} className="card text-center py-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { id: 'cart', label: `Cart (${itemCount})` },
          { id: 'upload', label: 'Upload Rx' },
          { id: 'history', label: 'My Prescriptions' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setUploadError(''); }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white shadow-sm text-rxgate-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== CART TAB ===== */}
      {activeTab === 'cart' && (
        <div className="card max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Your Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})</h2>
            <div className="flex gap-2">
              {cartItems.length > 0 && (
                <button onClick={clearCart} className="text-sm text-red-500 hover:text-red-600 px-3 py-1 rounded border border-red-200 hover:bg-red-50">
                  Clear Cart
                </button>
              )}
              <button onClick={openCart} className="text-sm text-rxgate-600 hover:text-rxgate-700 border border-rxgate-200 px-3 py-1 rounded-lg">
                View Slideout
              </button>
            </div>
          </div>

          {cartItems.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              <p className="text-lg font-medium mb-1">Your cart is empty</p>
              <p className="text-sm mb-4">Browse our medication formulary and add items to your cart.</p>
              <Link to="/shop" className="btn-primary text-sm">Browse Medications</Link>
            </div>
          ) : (
            <>
              {/* Cart Items List */}
              <div className="space-y-3 mb-6">
                {cartItems.map((item) => (
                  <div key={item.drug?.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-gray-900 text-sm">{item.drug?.name}</h3>
                        {item.drug?.requires_prescription === 1 && (
                          <span className="badge-pending text-[10px] px-1">Rx</span>
                        )}
                        {item.drug?.controlled_drug_schedule && (
                          <span className="badge-rejected text-[10px] px-1">{item.drug.controlled_drug_schedule}</span>
                        )}
                      </div>
                      {item.drug?.strength && <p className="text-xs text-gray-500">{item.drug.strength}</p>}
                      <p className="text-sm text-gray-500">£{(item.drug?.price / 100).toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.drug?.id, item.quantity - 1)} className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-100 text-sm">−</button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.drug?.id, item.quantity + 1)} className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-100 text-sm">+</button>
                    </div>
                    <p className="text-sm font-semibold text-rxgate-600 w-20 text-right">£{((item.drug?.price || 0) * item.quantity / 100).toFixed(2)}</p>
                    <button onClick={() => removeItem(item.drug?.id)} className="text-gray-300 hover:text-red-500 p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Cart Summary */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-base text-gray-700">Estimated Total</span>
                  <span className="text-2xl font-bold text-rxgate-600">£{(cartTotal / 100).toFixed(2)}</span>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
                  <strong>🛒 Prescription Required:</strong> Items marked with <span className="badge-pending text-[10px] px-1">Rx</span> require a valid prescription.
                  Upload your prescription and our pharmacy team will review it before processing payment.
                </div>

                <button
                  onClick={() => setActiveTab('upload')}
                  className="btn-primary w-full text-center"
                >
                  Upload Prescription & Checkout
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== UPLOAD PRESCRIPTION TAB ===== */}
      {activeTab === 'upload' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Upload Prescription</h2>
          <p className="text-sm text-gray-500 mb-6">
            Upload your vet's prescription. Our OCR will attempt to identify the medications, and we'll link them with your cart items.
          </p>

          {/* Cart Summary (if items in cart) */}
          {cartItems.length > 0 && (
            <div className="bg-rxgate-50 border border-rxgate-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-rxgate-700 mb-1">
                📋 Your Cart: {itemCount} item{itemCount !== 1 ? 's' : ''} — £{(cartTotal / 100).toFixed(2)}
              </p>
              <ul className="text-xs text-rxgate-600 space-y-0.5">
                {cartItems.map(i => (
                  <li key={i.drug?.id}>
                    • {i.drug?.name} × {i.quantity}
                    {form.drugId === i.drug?.id && (
                      <span className="text-green-600 ml-1">← auto-selected in dropdown</span>
                    )}
                  </li>
                ))}
              </ul>
              {!form.drugId && cartItems.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  The first cart item has been pre-selected in the dropdown below.
                </p>
              )}
            </div>
          )}

          {/* GDPR Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-xs text-blue-700">
            <strong>🔒 Your Data:</strong> Your prescription image and personal data are processed securely in compliance with UK GDPR.
            Data is encrypted, access is logged, and we retain it only as long as required by UK veterinary pharmaceutical regulations.
            See our <Link to="/privacy" className="underline">Privacy Policy</Link> for details.
          </div>

          {uploadSuccess && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200 mb-4">{uploadSuccess}</div>}
          {uploadError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200 mb-4">{uploadError}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* File Upload with OCR Preview */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prescription Image * <span className="text-gray-400 font-normal">(photo or scan)</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-rxgate-400 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    required
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-rxgate-50 file:text-rxgate-600 hover:file:bg-rxgate-100"
                  />
                  <p className="text-xs text-gray-400 mt-2">JPEG, PNG, WebP, or PDF (max 10MB)</p>
                </div>

                {/* OCR Loading */}
                {ocrLoading && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-rxgate-600 bg-rxgate-50 rounded-lg p-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rxgate-600"></div>
                    Processing prescription with OCR...
                  </div>
                )}

                {/* OCR Matches */}
                {ocrDone && ocrMatches.length > 0 && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-green-700">
                        🔍 OCR detected {ocrMatches.length} medication{ocrMatches.length > 1 ? 's' : ''} in your prescription:
                      </p>
                      <button
                        type="button"
                        onClick={addAllOcrMatchesToCart}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 font-medium"
                      >
                        + Add All to Cart
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {ocrMatches.map((match, idx) => {
                        const alreadyInCart = cartItems.some(i => i.drug?.id === match.drug?.id);
                        return (
                          <div key={idx} className="flex items-center justify-between bg-white rounded p-2 text-sm">
                            <div>
                              <span className="font-medium text-gray-900">{match.drug?.name}</span>
                              {match.drug?.strength && <span className="text-gray-500 ml-1">({match.drug.strength})</span>}
                              <span className="text-xs text-gray-400 ml-2">{(match.confidence)}% match</span>
                              {alreadyInCart && <span className="text-xs text-green-600 ml-2">✓ In cart</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (match.drug) {
                                  if (!alreadyInCart) addItem(match.drug);
                                  // Auto-select the drug in the form
                                  if (match.drug?.id) {
                                    setForm(prev => ({ ...prev, drugId: match.drug.id, drugName: match.drug.name }));
                                  }
                                }
                              }}
                              className={`text-xs px-2 py-1 rounded font-medium ${
                                alreadyInCart
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-rxgate-600 text-white hover:bg-rxgate-700'
                              }`}
                            >
                              {alreadyInCart ? '✓ In Cart (select)' : 'Add to Cart'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-green-600 mt-2">
                      {cartItems.length > 0
                        ? `Your cart (${itemCount} item${itemCount !== 1 ? 's' : ''}) will be submitted alongside the prescription.`
                        : 'Click "Add to Cart" to link a detected medication, or they\'ll be noted for manual review.'}
                    </p>
                  </div>
                )}

                {/* OCR No Matches */}
                {ocrDone && ocrMatches.length === 0 && !ocrLoading && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                    No medications were automatically detected in your prescription image. You can still submit it and our pharmacy team will review it manually.
                  </div>
                )}
              </div>

              {/* Medication Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Select Medication</label>
                  {form.drugId && (
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, drugId: '', drugName: '' }))}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
                <select name="drugId" value={form.drugId} onChange={handleDrugSelect} className="input-field">
                  <option value="">-- Select from our list --</option>
                  {drugs.map((drug) => (
                    <option key={drug.id} value={drug.id}>
                      {drug.name} — £{(drug.price / 100).toFixed(2)}
                      {drug.controlled_drug_schedule ? ` [${drug.controlled_drug_schedule}]` : ''}
                      {cartItems.some(i => i.drug?.id === drug.id) ? ' ★ In cart' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Or type drug name</label>
                <input type="text" name="drugName" value={form.drugName} onChange={handleChange} className="input-field" placeholder="If not in our list" />
              </div>

              {/* Prescriber Information */}
              <div className="sm:col-span-2 border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Prescriber Information <span className="text-gray-400 font-normal">(from your prescription paper)</span></p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vet/Practice Name</label>
                <input type="text" name="vetNameOnRx" value={form.vetNameOnRx} onChange={handleChange} className="input-field" placeholder="e.g., Riverside Veterinary Practice" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vet Registration Number</label>
                <input type="text" name="vetRegNumberOnRx" value={form.vetRegNumberOnRx} onChange={handleChange} className="input-field" placeholder="e.g., NI-12345" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prescription Date</label>
                <input type="date" name="prescriptionDate" value={form.prescriptionDate} onChange={handleChange} className="input-field" />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dosage Instructions <span className="text-gray-400 font-normal">(as written on the prescription)</span></label>
                <textarea name="dosageInstructions" value={form.dosageInstructions} onChange={handleChange} className="input-field" rows={2} placeholder="e.g., 1 tablet twice daily with food for 7 days" />
              </div>
            </div>

            {/* GDPR Consent */}
            <div className="bg-gray-50 rounded-lg p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="mt-1" required />
                <span className="text-xs text-gray-600">
                  I confirm that this is my own prescription and I consent to RxGate processing my personal data and prescription information
                  in accordance with the <Link to="/privacy" className="text-rxgate-600 underline">Privacy Policy</Link>.
                  I understand my data will be retained for the period required by UK/NI veterinary pharmaceutical regulations.
                </span>
              </label>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {ocrLoading ? 'Processing OCR...' : 'Uploading & Processing...'}
                </span>
              ) : (
                <span>
                  {cartItems.length > 0
                    ? `Upload Prescription & Submit ${itemCount} Item${itemCount > 1 ? 's' : ''} for Review`
                    : 'Upload Prescription for Review'
                  }
                </span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ===== HISTORY TAB ===== */}
      {activeTab === 'history' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">My Prescriptions</h2>
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rxgate-600"></div></div>
          ) : prescriptions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="font-medium mb-1">No prescriptions yet</p>
              <p className="text-sm">Upload your first prescription to get started.</p>
              <button onClick={() => setActiveTab('upload')} className="btn-primary mt-4 text-sm">Upload Prescription</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Reference</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Drug</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Items</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Uploaded</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((p) => {
                    const cartItems_ = (() => { try { return JSON.parse(p.cart_items || '[]'); } catch { return []; } })();
                    return (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <span className="font-mono text-xs">#{p.id.substring(0, 8)}</span>
                          {p.is_controlled_drug === 1 && <span className="badge-rejected text-[10px] ml-1">CD</span>}
                        </td>
                        <td className="py-3 px-2">
                          <p className="font-medium">{p.drug_name || p.drug_display_name || '—'}</p>
                          {p.dosage_instructions && <p className="text-xs text-gray-400">{p.dosage_instructions}</p>}
                        </td>
                        <td className="py-3 px-2">{statusBadge(p.status)}</td>
                        <td className="py-3 px-2 text-xs text-gray-500">
                          {cartItems_.length > 0 ? `${cartItems_.length} item${cartItems_.length > 1 ? 's' : ''}` : '—'}
                        </td>
                        <td className="py-3 px-2 text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                        <td className="py-3 px-2">
                          {p.status === 'payment_sent' && p.payment_link && (
                            <a href={p.payment_link} className="btn-primary text-xs py-1 px-2">Pay Now</a>
                          )}
                          {p.status === 'paid' && (
                            <span className="text-xs text-gray-500">Processing</span>
                          )}
                          {(p.status === 'pending' || p.status === 'approved') && (
                            <Link to={`/prescription/${p.id}`} className="text-rxgate-600 text-xs hover:underline">View</Link>
                          )}
                          {p.status === 'fulfilled' && (
                            <span className="text-xs text-green-600">Delivered</span>
                          )}
                          {p.status === 'rejected' && (
                            <Link to={`/prescription/${p.id}`} className="text-red-600 text-xs hover:underline">Details</Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
