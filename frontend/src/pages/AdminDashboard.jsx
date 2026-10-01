import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('prescriptions');

  // Stats
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState([]);
  const [prescriptionLoading, setPrescriptionLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  // Drugs
  const [drugs, setDrugs] = useState([]);
  const [drugLoading, setDrugLoading] = useState(false);
  const [showAddDrug, setShowAddDrug] = useState(false);
  const [csvResult, setCsvResult] = useState('');
  const csvFileRef = useRef(null);
  const [drugForm, setDrugForm] = useState({
    name: '', activeIngredient: '', strength: '', species: '', description: '', price: '', stock: '0', requiresPrescription: true,
    controlledDrugSchedule: '', maxSupplyDays: '30',
  });

  // Approval modal state
  const [approvalModal, setApprovalModal] = useState(null); // prescription object

  // GDPR requests
  const [gdprRequests, setGdprRequests] = useState([]);
  const [gdprLoading, setGdprLoading] = useState(false);

  useEffect(() => {
    loadStats();
    loadPrescriptions();
  }, [statusFilter]);

  const loadStats = async () => {
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data.stats);
      setActivity(res.data.recentActivity || []);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadPrescriptions = async () => {
    setPrescriptionLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/admin/prescriptions', { params });
      setPrescriptions(res.data.prescriptions);
    } catch (err) {
      console.error('Failed to load prescriptions:', err);
    }
    setPrescriptionLoading(false);
  };

  const loadDrugs = async () => {
    setDrugLoading(true);
    try {
      const res = await api.get('/admin/drugs');
      setDrugs(res.data.drugs);
    } catch (err) {
      console.error('Failed to load drugs:', err);
    }
    setDrugLoading(false);
  };

  const handleApprove = async (prescriptionId, data) => {
    setApproving(prescriptionId);
    try {
      await api.put(`/admin/prescriptions/${prescriptionId}/approve`, data);
      loadPrescriptions();
      loadStats();
      setApprovalModal(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve');
    }
    setApproving(null);
  };

  const handleReject = async (prescriptionId, notes = '') => {
    if (!window.confirm('Reject this prescription?')) return;
    setRejecting(prescriptionId);
    try {
      await api.put(`/admin/prescriptions/${prescriptionId}/reject`, { adminNotes: notes });
      loadPrescriptions();
      loadStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject');
    }
    setRejecting(null);
  };

  const handleMarkPaid = async (id) => {
    await api.put(`/admin/prescriptions/${id}/mark-paid`);
    loadPrescriptions();
    loadStats();
  };

  const handleFulfill = async (id) => {
    await api.put(`/admin/prescriptions/${id}/fulfill`);
    loadPrescriptions();
    loadStats();
  };

  const loadGdprRequests = async () => {
    setGdprLoading(true);
    try {
      const res = await api.get('/admin/gdpr-requests');
      setGdprRequests(res.data.requests);
    } catch (err) { console.error(err); }
    setGdprLoading(false);
  };

  const handleProcessGdpr = async (requestId, action) => {
    if (!window.confirm(`Are you sure you want to ${action} this GDPR ${action === 'approve' ? 'deletion' : ''} request?`)) return;
    try {
      await api.post(`/admin/gdpr-requests/${requestId}/process`, { action });
      loadGdprRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to process request');
    }
  };

  const handleAddDrug = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/drugs', {
        ...drugForm,
        price: parseFloat(drugForm.price) * 100,
        stock: parseInt(drugForm.stock),
        controlledDrugSchedule: drugForm.controlledDrugSchedule || null,
        maxSupplyDays: parseInt(drugForm.maxSupplyDays) || 30,
      });
      setShowAddDrug(false);
      setDrugForm({ name: '', activeIngredient: '', strength: '', species: '', description: '', price: '', stock: '0', requiresPrescription: true, controlledDrugSchedule: '', maxSupplyDays: '30' });
      loadDrugs();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add drug');
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFileRef.current?.files[0]) return;
    setCsvResult('Uploading...');
    const formData = new FormData();
    formData.append('csvFile', csvFileRef.current.files[0]);
    try {
      const res = await api.post('/admin/drugs/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCsvResult(`✅ ${res.data.message}`);
      csvFileRef.current.value = '';
      loadDrugs();
    } catch (err) {
      setCsvResult(`❌ ${err.response?.data?.error || 'Upload failed'}`);
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected',
      payment_sent: 'badge-approved', paid: 'badge-paid', fulfilled: 'badge-fulfilled',
    };
    const labels = {
      pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
      payment_sent: 'Payment Sent', paid: 'Paid', fulfilled: 'Fulfilled',
    };
    return <span className={map[status] || 'badge-pending'}>{labels[status] || status}</span>;
  };

  // Counts for tabs
  const counts = stats ? {
    pending: stats.pendingPrescriptions,
  } : {};

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500">RxGate — {user?.name}</p>
        </div>
        <button onClick={() => { loadStats(); loadPrescriptions(); }} className="text-sm text-rxgate-600 hover:text-rxgate-700">
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 mb-6">
          {[
            { label: 'Pending Rx', value: stats.pendingPrescriptions, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Approved Today', value: stats.approvedToday, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Total Rx', value: stats.totalPrescriptions, color: 'text-gray-900', bg: 'bg-gray-50' },
            { label: 'Revenue', value: `£${(stats.totalRevenue / 100).toFixed(0)}`, color: 'text-rxgate-600', bg: 'bg-rxgate-50' },
            { label: 'Drugs', value: stats.totalDrugs, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Vets', value: stats.totalVets, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Customers', value: stats.totalCustomers, color: 'text-teal-600', bg: 'bg-teal-50' },
            { label: 'CD Pending', value: stats.controlledDrugPrescriptions, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'CD Valid.', value: stats.pendingCdValidations, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'GDPR Req.', value: stats.gdprRequests, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-lg p-2 text-center`}>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-500 truncate">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg flex-wrap">
        {[
          { id: 'prescriptions', label: 'Prescriptions', count: counts.pending },
          { id: 'drugs', label: 'Drug Management' },
          { id: 'gdpr', label: `GDPR (${stats?.gdprRequests || 0})` },
          { id: 'activity', label: 'Activity Log' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); if (tab.id === 'drugs') loadDrugs(); if (tab.id === 'gdpr') loadGdprRequests(); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white shadow-sm text-rxgate-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
            {tab.count > 0 && <span className="bg-rxgate-600 text-white text-xs rounded-full px-2 py-0.5">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* ===== PRESCRIPTIONS TAB ===== */}
      {activeTab === 'prescriptions' && (
        <div>
          {/* Status Filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {['pending', 'approved', 'payment_sent', 'paid', 'rejected', 'fulfilled', ''].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-rxgate-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {s ? s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'All'}
              </button>
            ))}
          </div>

          {prescriptionLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rxgate-600"></div>
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <p className="font-medium">No {statusFilter || ''} prescriptions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prescriptions.map((p) => (
                <div key={p.id} className="card hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{p.customer_name}</h3>
                        {statusBadge(p.status)}
                        {p.is_controlled_drug === 1 && (
                          <span className="badge-rejected text-[10px] font-bold px-1.5">
                            CD {p.cd_schedule || p.drug_cd_schedule || ''}
                          </span>
                        )}
                        {p.upload_source === 'customer' && (
                          <span className="bg-blue-100 text-blue-700 text-[10px] rounded-full px-1.5">Self-Upload</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{p.customer_email}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                        <span className="text-gray-700"><strong>Drug:</strong> {p.drug_name || 'Not specified'}</span>
                        {p.drug_display_name && <span className="text-gray-500">{p.drug_display_name}</span>}
                        {p.vet_name ? <span className="text-gray-500">Vet: {p.vet_name}</span> : p.vet_name_on_rx && <span className="text-gray-500">Prescriber: {p.vet_name_on_rx}</span>}
                        {p.price && <span className="text-rxgate-600 font-medium">£{(p.price / 100).toFixed(2)}</span>}
                      </div>
                      {p.dosage_instructions && <p className="text-xs text-gray-400 mt-1">{p.dosage_instructions}</p>}

                      {/* Cart Items */}
                      {p.cart_items && (() => {
                        try {
                          const items = JSON.parse(p.cart_items);
                          if (items.length > 0) {
                            const notInRx = items.filter(i => i.notInPrescription === true);
                            return (
                              <div className={`mt-2 rounded p-2 border ${notInRx.length > 0 ? 'bg-amber-50 border-amber-300' : 'bg-rxgate-50 border-rxgate-100'}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-medium text-rxgate-700">Cart Items ({items.length})</p>
                                  {notInRx.length > 0 && (
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded-full">
                                      ⚠ {notInRx.length} not on Rx
                                    </span>
                                  )}
                                </div>
                                {notInRx.length > 0 && (
                                  <p className="text-[10px] text-amber-700 mb-1">
                                    The following items were <strong>not detected</strong> in the uploaded prescription image. Verify with the customer before approving.
                                  </p>
                                )}
                                <ul className="text-xs text-gray-600 space-y-0.5">
                                  {items.map((item, idx) => (
                                    <li key={idx} className="flex justify-between items-center gap-2">
                                      <span className={item.notInPrescription === true ? 'text-amber-700 font-medium' : ''}>
                                        {item.notInPrescription === true && <span className="mr-1">⚠</span>}
                                        {item.drugName || 'Unknown'} × {item.quantity || 1}
                                        {item.notInPrescription === null && <span className="text-gray-400 ml-1">(unverified)</span>}
                                      </span>
                                      <span className="flex items-center gap-1 shrink-0">
                                        {item.price && <span className="text-rxgate-600">£{(item.price / 100).toFixed(2)}</span>}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          }
                        } catch {}
                        return null;
                      })()}

                      <p className="text-xs text-gray-400 mt-1">
                        Uploaded: {new Date(p.created_at).toLocaleString()}
                        {p.practice_name ? ` by ${p.practice_name}` : p.upload_source === 'customer' ? ' by customer' : ''}
                        {p.prescription_date && ` · Rx date: ${p.prescription_date}`}
                      </p>
                      {/* Prescription Image */}
                      {p.image_path && p.image_path !== '[DELETED]' && (
                        <div className="mt-2">
                          <details>
                            <summary className="text-xs text-rxgate-600 cursor-pointer hover:text-rxgate-700 font-medium">
                              📷 View Prescription Image
                            </summary>
                            <div className="mt-2 bg-gray-50 rounded-lg border border-gray-200 p-2">
                              <a
                                href={p.image_path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={p.image_path}
                                  alt="Prescription"
                                  className="max-h-64 w-full object-contain rounded border border-gray-200 bg-white cursor-pointer hover:opacity-90 transition-opacity"
                                  onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }}
                                />
                                <div className="hidden text-xs text-gray-400 text-center py-4">Image unavailable</div>
                              </a>
                              <p className="text-xs text-gray-400 mt-1 text-center">
                                Click to open full size in new tab
                              </p>
                            </div>
                          </details>
                        </div>
                      )}
                      {p.ocr_text && p.ocr_text !== '[OCR failed]' && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">OCR Text</summary>
                          <pre className="text-xs text-gray-500 mt-1 bg-gray-50 p-2 rounded max-h-24 overflow-y-auto whitespace-pre-wrap">{p.ocr_text}</pre>
                        </details>
                      )}
                      {p.admin_notes && (
                        <p className="text-xs text-amber-600 mt-1">Notes: {p.admin_notes}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {p.status === 'pending' && (
                        <>
                          <button onClick={() => setApprovalModal(p)} className="btn-primary text-sm py-1.5 px-3">
                            Approve
                          </button>
                          <button onClick={() => handleReject(p.id)} disabled={rejecting === p.id} className="btn-danger text-sm py-1.5 px-3">
                            Reject
                          </button>
                        </>
                      )}
                      {p.status === 'payment_sent' && (
                        <button onClick={() => handleMarkPaid(p.id)} className="btn-primary text-sm py-1.5 px-3">
                          Mark Paid
                        </button>
                      )}
                      {p.status === 'paid' && (
                        <button onClick={() => handleFulfill(p.id)} className="btn-primary text-sm py-1.5 px-3">
                          Fulfill
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== APPROVAL MODAL ===== */}
      {approvalModal && (
        <ApproveModal
          prescription={approvalModal}
          drugs={drugs}
          onApprove={handleApprove}
          onCancel={() => setApprovalModal(null)}
          approving={approving}
          onLoadDrugs={loadDrugs}
        />
      )}

      {/* ===== DRUGS TAB ===== */}
      {activeTab === 'drugs' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-6">
            <button onClick={() => { setShowAddDrug(!showAddDrug); if (!drugLoading) loadDrugs(); }} className="btn-primary text-sm">
              {showAddDrug ? 'Cancel' : '+ Add Drug'}
            </button>
            <label className="btn-secondary text-sm cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv" onChange={handleCsvUpload} ref={csvFileRef} className="hidden" />
            </label>
          </div>

          {csvResult && (
            <div className={`text-sm mb-4 p-3 rounded-lg ${csvResult.includes('❌') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {csvResult}
            </div>
          )}

          {/* CSV Format Hint */}
          <div className="bg-blue-50 text-blue-700 text-xs p-3 rounded-lg mb-4">
            <strong>CSV Format:</strong> name, active_ingredient, strength, species, description, price (in pence, e.g. 4500 for £45), stock, requires_prescription (yes/no)
          </div>

          {/* Add Drug Form */}
          {showAddDrug && (
            <div className="card mb-6 border-rxgate-200">
              <h3 className="font-semibold text-gray-900 mb-4">Add New Drug</h3>
              <form onSubmit={handleAddDrug} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                  <input type="text" value={drugForm.name} onChange={e => setDrugForm({...drugForm, name: e.target.value})} className="input-field text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Active Ingredient</label>
                  <input type="text" value={drugForm.activeIngredient} onChange={e => setDrugForm({...drugForm, activeIngredient: e.target.value})} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Strength</label>
                  <input type="text" value={drugForm.strength} onChange={e => setDrugForm({...drugForm, strength: e.target.value})} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Species</label>
                  <input type="text" value={drugForm.species} onChange={e => setDrugForm({...drugForm, species: e.target.value})} className="input-field text-sm" placeholder="Dog, Cat, etc." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Price (£) *</label>
                  <input type="number" step="0.01" value={drugForm.price} onChange={e => setDrugForm({...drugForm, price: e.target.value})} className="input-field text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Stock</label>
                  <input type="number" value={drugForm.stock} onChange={e => setDrugForm({...drugForm, stock: e.target.value})} className="input-field text-sm" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={drugForm.description} onChange={e => setDrugForm({...drugForm, description: e.target.value})} className="input-field text-sm" rows={2} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2">
                  <input type="checkbox" checked={drugForm.requiresPrescription} onChange={e => setDrugForm({...drugForm, requiresPrescription: e.target.checked})} id="rxCheck" />
                  <label htmlFor="rxCheck" className="text-sm">Requires Prescription</label>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <button type="submit" className="btn-primary">Add Drug</button>
                </div>
              </form>
            </div>
          )}

          {/* Drug Table */}
          {drugLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rxgate-600"></div>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Name</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Ingredient</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Strength</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Price</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Stock</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Rx</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {drugs.map((d) => (
                    <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-2 font-medium">{d.name}</td>
                      <td className="py-2 px-2 text-gray-500 text-xs">{d.active_ingredient || '—'}</td>
                      <td className="py-2 px-2 text-gray-500">{d.strength || '—'}</td>
                      <td className="py-2 px-2 text-rxgate-600 font-medium">£{(d.price / 100).toFixed(2)}</td>
                      <td className="py-2 px-2">{d.stock}</td>
                      <td className="py-2 px-2">{d.requires_prescription ? '✅' : '—'}</td>
                      <td className="py-2 px-2">{d.is_active ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== GDPR TAB ===== */}
      {activeTab === 'gdpr' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">GDPR Data Subject Requests</h2>
          <p className="text-sm text-gray-500 mb-4">Manage right to erasure, data export, and rectification requests.</p>
          {gdprLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rxgate-600"></div></div>
          ) : gdprRequests.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No GDPR data requests pending.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Email</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Type</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Status</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Date</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gdprRequests.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="py-2 px-2">{r.email}</td>
                      <td className="py-2 px-2">
                        <span className={`badge ${r.request_type === 'deletion' ? 'badge-rejected' : r.request_type === 'export' ? 'badge-approved' : 'badge-pending'}`}>
                          {r.request_type}
                        </span>
                      </td>
                      <td className="py-2 px-2">{r.status}</td>
                      <td className="py-2 px-2 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="py-2 px-2">
                        {r.status === 'pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => handleProcessGdpr(r.id, 'approve')} className="btn-primary text-xs py-1 px-2">Approve</button>
                            <button onClick={() => handleProcessGdpr(r.id, 'reject')} className="btn-danger text-xs py-1 px-2">Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== ACTIVITY TAB ===== */}
      {activeTab === 'activity' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No activity recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 text-sm py-2 border-b border-gray-100 last:border-0">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-gray-500">{a.user_name?.[0] || '?'}</span>
                  </div>
                  <div>
                    <p className="text-gray-900">
                      <span className="font-medium">{a.user_name || 'System'}</span>
                      {' '}{a.details}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== APPROVE MODAL COMPONENT =====
function ApproveModal({ prescription, drugs, onApprove, onCancel, approving, onLoadDrugs }) {
  // Server-authoritative cart total. The backend re-prices from the drugs table
  // and returns this as pricing.cartTotal, so the pharmacist compares a real
  // figure against the amount they are about to charge instead of trusting the
  // unit price of whichever single drug happens to be selected.
  const cartTotal = useMemo(() => {
    if (!prescription.cart_items) return 0;
    try {
      return JSON.parse(prescription.cart_items)
        .map(i => {
          const drug = drugs.find(d => d.id === i.drugId);
          if (!drug) return null;
          return drug.price * Math.max(1, parseInt(i.quantity, 10) || 1);
        })
        .filter(v => v !== null)
        .reduce((a, b) => a + b, 0);
    } catch {
      return 0;
    }
  }, [prescription.cart_items, drugs]);

  // Default to what the cart actually comes to. Previously this defaulted to the
  // unit price of one drug, so a multi-item or multi-quantity prescription was
  // approved at a fraction of the real total.
  const defaultAmount = cartTotal > 0 ? cartTotal : (prescription.price || 0);

  const [drugId, setDrugId] = useState(prescription.drug_id || '');
  const [drugName, setDrugName] = useState(prescription.drug_name || '');
  const [amount, setAmount] = useState(defaultAmount ? (defaultAmount / 100).toFixed(2) : '');
  const [adminNotes, setAdminNotes] = useState('');
  const [cdValidated, setCdValidated] = useState(false);
  const [cdInfo, setCdInfo] = useState(null);

  useEffect(() => {
    if (drugId) {
      const drug = drugs.find(d => d.id === drugId);
      if (drug) {
      setDrugName(drug.name);
      // Prefer the cart total; only fall back to the unit price for a
      // prescription with no cart attached.
      setAmount(((cartTotal > 0 ? cartTotal : drug.price) / 100).toFixed(2));
        if (drug.controlled_drug_schedule) {
          setCdInfo({
            schedule: drug.controlled_drug_schedule,
            maxDays: drug.max_supply_days || 30,
          });
        } else {
          setCdInfo(null);
        }
      }
    }
  }, [drugId, cartTotal]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onApprove(prescription.id, {
      drugId: drugId || null,
      drugName,
      amount: Math.round(parseFloat(amount) * 100),
      adminNotes,
      cdValidated,
    });
  };

  const isCd = cdInfo !== null || prescription.is_controlled_drug === 1;
  const needCdValidation = isCd && (cdInfo?.schedule === 'CD-SCH2' || cdInfo?.schedule === 'CD-SCH3');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Approve Prescription</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p><strong>Customer:</strong> {prescription.customer_name}</p>
          <p><strong>Email:</strong> {prescription.customer_email}</p>
          <p><strong>Vet:</strong> {prescription.vet_name || prescription.vet_name_on_rx || 'Unknown'}</p>
          {prescription.vet_reg_number_on_rx && <p><strong>Reg:</strong> {prescription.vet_reg_number_on_rx}</p>}
          {prescription.prescription_date && <p><strong>Rx Date:</strong> {prescription.prescription_date}</p>}
          {prescription.upload_source === 'customer' && <p className="text-blue-600 text-xs mt-1">📄 Uploaded by customer</p>}

          {isCd && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              <strong>⚠️ Controlled Drug</strong>
              {cdInfo ? (
                <p>{cdInfo.schedule} — Max supply: {cdInfo.maxDays} days. Additional validation required.</p>
              ) : (
                <p>{prescription.cd_schedule || 'Schedule unknown'}</p>
              )}
            </div>
          )}

          {/* Prescription Image in Modal */}
          {prescription.image_path && prescription.image_path !== '[DELETED]' && (
            <div className="mt-2">
              <a
                href={prescription.image_path}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <img
                  src={prescription.image_path}
                  alt="Prescription"
                  className="max-h-48 w-full object-contain rounded border border-gray-200 bg-white cursor-pointer hover:opacity-90 transition-opacity"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }}
                />
                <div className="hidden text-xs text-gray-400 text-center py-2">Image unavailable</div>
              </a>
              <p className="text-xs text-gray-400 mt-1 text-center">Click to open full size</p>
            </div>
          )}

          {prescription.ocr_text && prescription.ocr_text !== '[OCR failed]' && (
            <details className="mt-1">
              <summary className="text-xs text-gray-400 cursor-pointer">OCR Text</summary>
              <pre className="text-xs text-gray-500 mt-1 bg-white p-2 rounded max-h-20 overflow-y-auto whitespace-pre-wrap">{prescription.ocr_text}</pre>
            </details>
          )}

          {/* Cart Items in Modal */}
          {prescription.cart_items && (() => {
            try {
              const items = JSON.parse(prescription.cart_items);
              if (items.length > 0) {
                return (
                  <div className="mt-2 p-2 bg-rxgate-50 border border-rxgate-200 rounded text-xs">
                    <strong className="text-rxgate-700">🛒 Cart Items ({items.length}):</strong>
                    <ul className="mt-1 space-y-0.5">
                      {items.map((item, idx) => (
                        <li key={idx} className="flex justify-between text-gray-600">
                          <span>{item.drugName || 'Unknown'} × {item.quantity || 1}</span>
                          {item.price && <span>£{(item.price / 100).toFixed(2)}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
            } catch {}
            return null;
          })()}
        </div>

        {isCd && needCdValidation && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={cdValidated} onChange={e => setCdValidated(e.target.checked)} className="mt-0.5" />
              <div className="text-xs text-orange-700">
                <strong>I confirm CD validation:</strong> I have verified the prescription is authentic, the prescriber is registered,
                the prescription is within the valid date (28 days for {cdInfo?.schedule}), and supply does not exceed the maximum.
              </div>
            </label>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link Medication</label>
            <select value={drugId} onChange={e => setDrugId(e.target.value)} className="input-field text-sm">
              <option value="">-- Select from formulary --</option>
              {drugs.map(d => (
                <option key={d.id} value={d.id}>{d.name} — £{(d.price / 100).toFixed(2)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Drug Name</label>
              <input type="text" value={drugName} onChange={e => setDrugName(e.target.value)} className="input-field text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (£) *</label>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="input-field text-sm" required />
              {cartTotal > 0 && (
                <p className={`text-xs mt-1 ${Number(amount) === cartTotal / 100 ? 'text-gray-500' : 'text-amber-700 font-medium'}`}>
                  Cart total £{(cartTotal / 100).toFixed(2)}
                  {Number(amount) !== cartTotal / 100 && ' — you are charging a different amount'}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes (optional)</label>
            <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} className="input-field text-sm" rows={2} placeholder="These will be included in the email to the customer." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={approving === prescription.id} className="btn-primary flex-1">
              {approving === prescription.id ? 'Approving & Sending Email...' : 'Approve & Send Payment Link'}
            </button>
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
