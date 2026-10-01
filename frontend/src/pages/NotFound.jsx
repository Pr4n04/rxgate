import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-rxgate-600 font-semibold tracking-widest text-sm">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-3">Page not found</h1>
        <p className="text-gray-500 mb-6">
          We couldn't find anything at <code className="text-gray-700">{pathname}</code>.
          If you followed a link from an email, it may have expired.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="btn-primary">Return Home</Link>
          <Link to="/shop" className="btn-secondary">Browse Shop</Link>
        </div>
      </div>
    </div>
  );
}