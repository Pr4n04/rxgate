import { useSearchParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../api/axios';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const prescriptionId = searchParams.get('prescription_id');
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (prescriptionId) {
      api.get(`/prescriptions/${prescriptionId}`)
        .then(res => setDetails(res.data.prescription))
        .catch(() => {});
    }
  }, [prescriptionId]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-gray-500 mb-6">Your prescription payment has been processed. Your order is now being prepared.</p>

        {details && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-left">
            <p><strong>Prescription:</strong> #{details.id?.substring(0, 8)}</p>
            <p><strong>Medication:</strong> {details.drug_name || details.drug_display_name || '—'}</p>
            <p><strong>Status:</strong> Paid - Awaiting Fulfilment</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="btn-primary">Return to Home</Link>
          <Link to="/my-orders" className="btn-secondary">View My Orders</Link>
        </div>
      </div>
    </div>
  );
}
