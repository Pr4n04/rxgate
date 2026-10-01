import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';

export default function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/prescriptions/${id}`)
      .then(res => {
        setPrescription(res.data.prescription);
        const status = res.data.prescription.status;
        if (status === 'paid') {
          navigate(`/payment/success?prescription_id=${id}`, { replace: true });
        }
      })
      .catch(err => setError(err.response?.data?.error || 'Prescription not found'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handlePay = async () => {
    setPaying(true);
    setError('');
    try {
      const res = await api.post('/orders/create', { prescriptionId: id });
      if (res.data.paymentUrl) {
        window.location.href = res.data.paymentUrl;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate payment. Please try again.');
    }
    setPaying(false);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rxgate-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!prescription) return null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="card text-center">
          <div className="w-16 h-16 bg-rxgate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-rxgate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-1">Prescription Approved</h1>
          <p className="text-gray-500 text-sm mb-6">Your prescription is ready for payment</p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Customer</span>
              <span className="font-medium">{prescription.customer_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Medication</span>
              <span className="font-medium">{prescription.drug_name || prescription.drug_display_name || 'Veterinary Prescription'}</span>
            </div>
            {prescription.dosage_instructions && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Dosage</span>
                <span className="font-medium text-right max-w-[200px]">{prescription.dosage_instructions}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-xl text-rxgate-600">
                £{prescription.price ? (prescription.price / 100).toFixed(2) : '—'}
              </span>
            </div>
          </div>

          <button
            onClick={handlePay}
            disabled={paying}
            className="btn-primary w-full text-lg py-3"
          >
            {paying ? 'Redirecting to payment...' : 'Pay with Card'}
          </button>

          <p className="text-xs text-gray-400 mt-4">
            Secure payment processed by Stripe. Your card details are never stored by RxGate.
          </p>
        </div>
      </div>
    </div>
  );
}
