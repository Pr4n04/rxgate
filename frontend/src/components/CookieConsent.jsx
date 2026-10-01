import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('rxgate_cookie_consent');
    if (!consent) {
      // Show after a brief delay
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const acceptAll = () => {
    localStorage.setItem('rxgate_cookie_consent', 'all');
    localStorage.setItem('rxgate_cookie_consent_date', new Date().toISOString());
    setVisible(false);
  };

  const acceptEssential = () => {
    localStorage.setItem('rxgate_cookie_consent', 'essential');
    localStorage.setItem('rxgate_cookie_consent_date', new Date().toISOString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-2xl border border-gray-200 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-rxgate-100 rounded-full flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-rxgate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">🍪 Cookie Consent</p>
            <p className="text-sm text-gray-600 mt-1">
              We use essential cookies for authentication and security. No tracking cookies are used without your consent. 
              <Link to="/privacy" className="text-rxgate-600 underline ml-1">Learn more</Link>
            </p>

            {showDetails && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Essential Cookies</p>
                    <p>Session authentication, security, and CSRF protection. Required for the platform to function.</p>
                  </div>
                  <span className="text-green-600 text-xs font-medium">Always Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Analytics Cookies</p>
                    <p>Help us understand how you use our platform to improve your experience.</p>
                  </div>
                  <span className="text-gray-400 text-xs">Optional</span>
                </div>
              </div>
            )}

            <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-rxgate-600 hover:text-rxgate-700 mt-1">
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 justify-end">
          <button onClick={acceptEssential} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Essential Only
          </button>
          <button onClick={acceptAll} className="btn-primary text-sm">
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
