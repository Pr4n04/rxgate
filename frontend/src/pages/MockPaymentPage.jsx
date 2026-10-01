import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';

/**
 * Simulated Stripe Checkout.
 *
 * Reached only when the backend has no STRIPE_SECRET_KEY configured and is
 * therefore serving mock checkout sessions. It lets the whole
 * approve -> pay -> paid flow be demonstrated locally without Stripe test keys.
 *
 * The matching backend endpoint (POST /api/orders/mock-complete) returns 404 as
 * soon as real Stripe keys are present, so this page cannot simulate a payment in
 * a real deployment.
 */
export default function MockPaymentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const prescriptionId = searchParams.get('prescription_id');

  const [details, setDetails] = useState(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!prescriptionId) return;
    api.get(`/prescriptions/${prescriptionId}`)
      .then((res) => setDetails(res.data.prescription))
      .catch(() => {});
  }, [prescriptionId]);

  const completePayment = async () => {
    setPaying(true);
    setError('');
    try {
      await api.post('/orders/mock-complete', { prescriptionId });
      navigate(`/payment/success?prescription_id=${prescriptionId}`);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          'Could not complete the simulated payment. Are you signed in as the prescribing customer?'
      );
      setPaying(false);
    }
  };

  const amount = details?.price != null ? (details.price / 100).toFixed(2) : null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Simulated checkout.</strong> No Stripe keys are configured, so
          this is a local stand-in for Stripe Checkout. No money moves.
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <span className="text-sm text-gray-500">RxGate Veterinary Pharmacy</span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              test mode
            </span>
          </div>

          <div className="py-6">
            <p className="text-sm text-gray-500">
              {details?.drug_display_name || details?.drug_name || 'Veterinary Prescription'}
            </p>
            {details?.strength && <p className="text-sm text-gray-500">{details.strength}</p>}
            {prescriptionId && (
              <p className="mt-1 text-xs text-gray-400">
                Prescription #{prescriptionId.substring(0, 8)}
              </p>
            )}
            <p className="mt-4 text-3xl font-bold text-gray-900">
              {amount != null ? `£${amount}` : '—'}
            </p>
          </div>

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            onClick={completePayment}
            disabled={paying || !prescriptionId}
            className="btn-primary w-full disabled:opacity-60"
          >
            {paying ? 'Processing…' : `Pay ${amount != null ? `£${amount}` : ''}`}
          </button>

          <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
            <span>Session {sessionId ? sessionId.substring(0, 14) : '—'}</span>
            <Link to="/my-orders" className="hover:text-gray-600">Cancel and return</Link>
          </div>
        </div>
      </div>
    </div>
  );
}