import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    role: 'customer', practiceName: '', veterinaryNumber: '', phone: '',
    gdprConsent: false, marketingConsent: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  if (isLoggedIn) {
    navigate('/');
    return null;
  }

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [e.target.name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters for security.');
      return;
    }
    if (!form.gdprConsent) {
      setError('You must accept the Privacy Policy and Terms of Service to create an account.');
      return;
    }

    setLoading(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        practiceName: form.practiceName || undefined,
        veterinaryNumber: form.veterinaryNumber || undefined,
        phone: form.phone || undefined,
        gdprConsent: form.gdprConsent,
        marketingConsent: form.marketingConsent,
      });

      if (form.role === 'vet') navigate('/vet/dashboard');
      else if (form.role === 'customer') navigate('/customer/dashboard');
      else navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-rxgate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-rxgate-600 font-bold text-2xl">SP</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 mt-1">Join RxGate</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
            )}

            {/* Account Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">I am a...</label>
              <div className="flex gap-3">
                <label className={`flex-1 p-3 rounded-lg border-2 text-center cursor-pointer transition-all ${form.role === 'customer' ? 'border-rxgate-600 bg-rxgate-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="role" value="customer" checked={form.role === 'customer'} onChange={handleChange} className="sr-only" />
                  <span className="block text-sm font-medium">Pet Owner</span>
                  <span className="text-xs text-gray-500">Buy medications</span>
                </label>
                <label className={`flex-1 p-3 rounded-lg border-2 text-center cursor-pointer transition-all ${form.role === 'vet' ? 'border-rxgate-600 bg-rxgate-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="role" value="vet" checked={form.role === 'vet'} onChange={handleChange} className="sr-only" />
                  <span className="block text-sm font-medium">Veterinary</span>
                  <span className="text-xs text-gray-500">Upload prescriptions</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" name="name" value={form.name} onChange={handleChange} className="input-field" placeholder="Your full name" required />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} className="input-field" placeholder="you@example.com" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" name="password" value={form.password} onChange={handleChange} className="input-field" placeholder="Min 8 characters" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm *</label>
                <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} className="input-field" placeholder="Repeat password" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="input-field" placeholder="Optional" />
              </div>

              {form.role === 'vet' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Practice Name</label>
                    <input type="text" name="practiceName" value={form.practiceName} onChange={handleChange} className="input-field" placeholder="Your practice" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Veterinary Number</label>
                    <input type="text" name="veterinaryNumber" value={form.veterinaryNumber} onChange={handleChange} className="input-field" placeholder="NI veterinary registration number" />
                  </div>
                </>
              )}
            </div>

            {/* GDPR Consent Section */}
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="gdprConsent"
                  checked={form.gdprConsent}
                  onChange={handleChange}
                  className="mt-1"
                  id="gdprConsent"
                  required
                />
                <label htmlFor="gdprConsent" className="text-xs text-gray-600">
                  I have read and agree to the{' '}
                  <Link to="/privacy" target="_blank" className="text-rxgate-600 underline">Privacy Policy</Link>
                  {' '}and{' '}
                  <Link to="/terms" target="_blank" className="text-rxgate-600 underline">Terms of Service</Link>.
                  I consent to RxGate processing my personal data for account management and prescription processing
                  in accordance with UK GDPR. *
                </label>
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="marketingConsent"
                  checked={form.marketingConsent}
                  onChange={handleChange}
                  className="mt-1"
                  id="marketingConsent"
                />
                <label htmlFor="marketingConsent" className="text-xs text-gray-500">
                  I would like to receive occasional emails about new medications, pet health tips, and practice updates.
                  You can unsubscribe at any time.
                </label>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-500">Already have an account? </span>
            <Link to="/login" className="text-rxgate-600 font-medium hover:text-rxgate-700">Sign in</Link>
          </div>
        </div>

        {/* Dev accounts hint — stripped from production builds by Vite. */}
        {import.meta.env.DEV && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            <p className="font-medium mb-1">🧪 Development Accounts:</p>
            <p>Admin: admin@rxgate.example / admin123</p>
            <p>Vet: vet@rxgate.example / vet123</p>
            <p>Customer: customer@rxgate.example / customer123</p>
          </div>
        )}
      </div>
    </div>
  );
}
