export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-rxgate-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">SP</span>
              </div>
              <span className="text-white font-bold text-lg">RxGate</span>
            </div>
            <p className="text-sm leading-relaxed">
              Northern Ireland's trusted veterinary pharmacy. Providing prescription medications and pet care products with professional oversight.
            </p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/shop" className="hover:text-white transition-colors">Shop Medications</a></li>
              <li><a href="/register" className="hover:text-white transition-colors">Register as Vet</a></li>
              <li><a href="/register" className="hover:text-white transition-colors">Create Account</a></li>
              <li><a href="/login" className="hover:text-white transition-colors">Login</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Contact</h3>
            <ul className="space-y-2 text-sm">
              <li>Northern Ireland, UK</li>
              <li>info@rxgate.example</li>
              <li>Prescription enquiries: 028 1234 5678</li>
            </ul>
            <p className="text-xs mt-4 text-gray-500">
              All prescription medications require veterinary approval before dispatch.
            </p>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} RxGate. All rights reserved.</p>
          <p className="text-xs mt-1">Dispensing veterinary pharmaceuticals in compliance with Northern Ireland regulations.</p>
        </div>
      </div>
    </footer>
  );
}
