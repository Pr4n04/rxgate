import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';

export default function PrescriptionStatus() {
  const { id } = useParams();
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/prescriptions/${id}`)
      .then(res => setPrescription(res.data.prescription))
      .catch(err => setError(err.response?.data?.error || 'Prescription not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const statusConfig = {
    pending: { icon: '🕐', label: 'Pending Review', color: 'text-amber-600', bg: 'bg-amber-50', desc: 'Your prescription is awaiting review by our pharmacy team.' },
    approved: { icon: '✅', label: 'Approved', color: 'text-green-600', bg: 'bg-green-50', desc: 'Your prescription has been approved. A payment link will be sent to your email shortly.' },
    payment_sent: { icon: '📧', label: 'Payment Link Sent', color: 'text-blue-600', bg: 'bg-blue-50', desc: 'A payment link has been sent to your email. Please check your inbox.' },
    paid: { icon: '💳', label: 'Paid', color: 'text-blue-600', bg: 'bg-blue-50', desc: 'Payment received. Your order is being prepared for dispatch.' },
    fulfilled: { icon: '📦', label: 'Fulfilled', color: 'text-emerald-600', bg: 'bg-emerald-50', desc: 'Your order has been dispatched. Tracking information may be provided by your vet.' },
    rejected: { icon: '❌', label: 'Not Approved', color: 'text-red-600', bg: 'bg-red-50', desc: 'This prescription was not approved. Please contact your veterinary practice.' },
  };

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rxgate-600"></div>
    </div>
  );

  if (error) return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Prescription Not Found</h2>
        <p className="text-gray-500">{error}</p>
        <Link to="/" className="btn-primary mt-6 inline-block">Go Home</Link>
      </div>
    </div>
  );

  const config = statusConfig[prescription?.status] || statusConfig.pending;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="card text-center">
          <div className={`w-20 h-20 ${config.bg} rounded-full flex items-center justify-center mx-auto mb-4 text-3xl`}>
            {config.icon}
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">{config.label}</h1>
          <p className="text-gray-500 mb-6">{config.desc}</p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Prescription</span>
              <span className="font-medium">#{id.substring(0, 8)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Customer</span>
              <span className="font-medium">{prescription.customer_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Medication</span>
              <span className="font-medium">{prescription.drug_name || prescription.drug_display_name || '—'}</span>
            </div>
            {prescription.dosage_instructions && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Dosage</span>
                <span className="font-medium">{prescription.dosage_instructions}</span>
              </div>
            )}
          </div>

          {/* Status Timeline */}
          <div className="space-y-3 text-left">
            {['pending', 'approved', 'paid', 'fulfilled'].map((step, idx) => {
              const stepConfig = statusConfig[step];
              const isActive = step === prescription.status;
              const isPast = ['pending', 'approved', 'payment_sent', 'paid', 'fulfilled'].indexOf(prescription.status) >= ['pending', 'approved', 'payment_sent', 'paid', 'fulfilled'].indexOf(step);
              const isRejected = prescription.status === 'rejected';

              return (
                <div key={step} className={`flex items-center gap-3 ${isPast && !isRejected ? 'opacity-100' : 'opacity-40'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${isActive ? 'bg-rxgate-600 text-white' : isPast && !isRejected ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {isPast && !isRejected && step !== 'pending' ? '✓' : idx + 1}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isActive ? 'text-rxgate-600' : 'text-gray-700'}`}>{stepConfig.label}</p>
                    <p className="text-xs text-gray-400">{stepConfig.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8">
            <Link to="/" className="btn-primary">Return Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
