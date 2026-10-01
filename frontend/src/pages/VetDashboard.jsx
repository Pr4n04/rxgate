import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import api from '../api/axios';

export default function VetDashboard() {
  const { user } = useAuth();
  // `total` is aliased here because this page also has an unrelated `stats.total`.
  const { items: cartItems, itemCount, total: cartTotal, addItem, removeItem, updateQuantity, clearCart } = useCart();
  const [activeTab, setActiveTab] = useState('upload');
  const [prescriptions, setPrescriptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [drugs, setDrugs] = useState([]);
  const fileInputRef = useRef(null);
  const [addedFeedback, setAddedFeedback] = useState({});

  // Form state
  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    drugId: '',
    drugName: '',
    dosageInstructions: '',
  });

  useEffect(() => {
    loadPrescriptions();
    loadStats();
    api.get('/drugs').then(res => setDrugs(res.data.drugs)).catch(() => {});
  }, []);

  const loadPrescriptions = async () => {
    try {
      const res = await api.get('/vet/prescriptions');
      setPrescriptions(res.data.prescriptions);
    } catch (err) {
      console.error('Failed to load prescriptions:', err);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const res = await api.get('/vet/stats');
      setStats(res.data.stats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleDrugSelect = (e) => {
    const drugId = e.target.value;
    setForm({ ...form, drugId, drugName: '' });
    if (drugId) {
      const drug = drugs.find(d => d.id === drugId);
      if (drug) {
        setForm(prev => ({ ...prev, drugId, drugName: drug.name }));
        // Auto-add to cart
        addItem(drug);
        setAddedFeedback(prev => ({ ...prev, [drug.id]: true }));
        setTimeout(() => setAddedFeedback(p => ({ ...p, [drug.id]: false })), 1500);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setUploadSuccess('');
    setUploadError('');

    const formData = new FormData();
    formData.append('customerName', form.customerName);
    formData.append('customerEmail', form.customerEmail);
    formData.append('customerPhone', form.customerPhone);
    formData.append('drugId', form.drugId);
    formData.append('drugName', form.drugName);
    formData.append('dosageInstructions', form.dosageInstructions);

    // Include cart items
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
      const res = await api.post('/vet/prescriptions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setUploadSuccess(`Prescription uploaded for ${form.customerName}. ${cartItems.length} item(s) submitted.`);
      clearCart();
      setForm({ customerName: '', customerEmail: '', customerPhone: '', drugId: '', drugName: '', dosageInstructions: '' });
      fileInputRef.current.value = '';
      loadPrescriptions();
      loadStats();
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed. Please try again.');
    }
    setSubmitting(false);
  };

  const statusBadge = (status) => {
    const badges = {
      pending: 'badge-pending',
      approved: 'badge-approved',
      rejected: 'badge-rejected',
      payment_sent: 'badge-approved',
      paid: 'badge-paid',
      fulfilled: 'badge-fulfilled',
    };
    const labels = {
      pending: 'Pending Review',
      approved: 'Approved',
      rejected: 'Rejected',
      payment_sent: 'Payment Sent',
      paid: 'Paid',
      fulfilled: 'Fulfilled',
    };
    return <span className={badges[status] || 'badge-pending'}>{labels[status] || status}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vet Dashboard</h1>
          <p className="text-gray-500">{user?.practice_name || user?.name}</p>
        </div>
        <div className="text-right text-sm text-gray-500">
          {user?.veterinaryNumber && <p>Reg: {user.veterinaryNumber}</p>}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900' },
            { label: 'Pending', value: stats.pending, color: 'text-amber-600' },
            { label: 'Approved', value: stats.approved, color: 'text-green-600' },
            { label: 'Paid', value: stats.paid, color: 'text-blue-600' },
            { label: 'Rejected', value: stats.rejected, color: 'text-red-600' },
          ].map((s) => (
            <div key={s.label} className="card text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {['upload', 'history'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab ? 'bg-white shadow-sm text-rxgate-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab === 'upload' ? 'Upload Prescription' : 'Prescription History'}
          </button>
        ))}
      </div>

      {activeTab === 'upload' && (
        <div className="max-w-2xl">
          {/* Cart Summary */}
          {cartItems.length > 0 && (
            <div className="card mb-4 border-rxgate-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 text-sm">Cart ({itemCount} item{itemCount > 1 ? 's' : ''})</h3>
                <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-600">Clear</button>
              </div>
              <div className="space-y-1.5">
                {cartItems.map(i => (
                  <div key={i.drug?.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{i.drug?.name} × {i.quantity}</span>
                    <span className="text-rxgate-600 font-medium">£{((i.drug?.price || 0) * i.quantity / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-sm font-semibold">
                <span>Total</span>
                <span className="text-rxgate-600">£{(cartTotal / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Upload Customer Prescription</h2>
            <p className="text-sm text-gray-500 mb-6">Select medications below to add them to the cart, then upload the prescription image.</p>

            {uploadSuccess && <div className="bg-green-50 text-green-600 text-sm px-4 py-3 rounded-lg border border-green-200 mb-4">{uploadSuccess}</div>}
            {uploadError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200 mb-4">{uploadError}</div>}

            {/* Quick Add Drugs */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Add Medications to Cart</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {drugs.slice(0, 12).map(drug => (
                  <button
                    key={drug.id}
                    type="button"
                    onClick={() => { addItem(drug); setAddedFeedback(p => ({ ...p, [drug.id]: true })); setTimeout(() => setAddedFeedback(p => ({ ...p, [drug.id]: false })), 1200); }}
                    className={`text-left p-2 rounded-lg border text-sm transition-all ${
                      addedFeedback[drug.id]
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'border-gray-200 hover:border-rxgate-300 hover:bg-rxgate-50'
                    }`}
                  >
                    <span className="font-medium text-gray-900 block truncate">{drug.name}</span>
                    <span className="text-xs text-gray-500">£{(drug.price / 100).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prescription Image *</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-rxgate-400 transition-colors">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      required
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-rxgate-50 file:text-rxgate-600 hover:file:bg-rxgate-100"
                    />
                    <p className="text-xs text-gray-400 mt-2">JPEG, PNG, WebP, or PDF (max 10MB)</p>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
                  <input type="text" name="customerName" value={form.customerName} onChange={handleChange} className="input-field" placeholder="e.g., A. Client" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Email *</label>
                  <input type="email" name="customerEmail" value={form.customerEmail} onChange={handleChange} className="input-field" placeholder="customer@example.com" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Phone</label>
                  <input type="tel" name="customerPhone" value={form.customerPhone} onChange={handleChange} className="input-field" placeholder="Optional" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Medication</label>
                  <select name="drugId" value={form.drugId} onChange={handleDrugSelect} className="input-field">
                    <option value="">-- Select from formulary --</option>
                    {drugs.map((drug) => (
                      <option key={drug.id} value={drug.id}>{drug.name} - £{(drug.price / 100).toFixed(2)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Or type drug name</label>
                  <input type="text" name="drugName" value={form.drugName} onChange={handleChange} className="input-field" placeholder="If not in list above" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dosage Instructions</label>
                  <textarea
                    name="dosageInstructions"
                    value={form.dosageInstructions}
                    onChange={handleChange}
                    className="input-field"
                    rows={2}
                    placeholder="e.g., 1 tablet twice daily with food"
                  />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing OCR & Uploading...
                  </span>
                ) : (
                  `Upload Prescription${cartItems.length > 0 ? ` with ${itemCount} Item${itemCount > 1 ? 's' : ''}` : ''}`
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Prescription History</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rxgate-600"></div>
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="font-medium">No prescriptions uploaded yet</p>
              <p className="text-sm">Upload your first prescription to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Customer</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Drug</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-2">
                        <p className="font-medium text-gray-900">{p.customer_name}</p>
                        <p className="text-xs text-gray-400">{p.customer_email}</p>
                      </td>
                      <td className="py-3 px-2">
                        <p>{p.drug_name || '—'}</p>
                        {p.dosage_instructions && <p className="text-xs text-gray-400">{p.dosage_instructions}</p>}
                      </td>
                      <td className="py-3 px-2">{statusBadge(p.status)}</td>
                      <td className="py-3 px-2 text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
