import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const res = await api.get('/orders/my');
      setOrders(res.data.orders);
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
    setLoading(false);
  };

  const statusBadge = (status) => {
    const map = {
      pending: 'badge-pending', requires_payment: 'badge-pending',
      completed: 'badge-paid', failed: 'badge-rejected', refunded: 'badge-rejected',
    };
    const labels = {
      pending: 'Pending', requires_payment: 'Awaiting Payment',
      completed: 'Completed', failed: 'Failed', refunded: 'Refunded',
    };
    return <span className={map[status] || 'badge-pending'}>{labels[status] || status}</span>;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Orders</h1>
      <p className="text-gray-500 mb-8">{user?.email}</p>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rxgate-600"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-16">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-lg font-medium text-gray-500 mb-2">No orders yet</p>
          <p className="text-sm text-gray-400 mb-4">When your vet uploads a prescription and it's approved, you'll see it here.</p>
          <Link to="/" className="btn-primary inline-block">Browse Medications</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{order.drug_name || 'Prescription'}</h3>
                    {statusBadge(order.status)}
                  </div>
                  <p className="text-sm text-gray-500">{order.customer_name}</p>
                  {order.dosage_instructions && (
                    <p className="text-xs text-gray-400">{order.dosage_instructions}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Order #{order.id.substring(0, 8)} · {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-rxgate-600">£{(order.amount / 100).toFixed(2)}</p>
                  {order.status === 'requires_payment' && order.prescription_id && (
                    <Link to={`/payment/${order.prescription_id}`} className="text-sm text-rxgate-600 font-medium hover:text-rxgate-700">
                      Pay Now →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
