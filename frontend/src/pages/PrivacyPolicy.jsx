import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-gray-500 text-sm mb-8">Last updated: January 2025 · RxGate, Northern Ireland, UK</p>

      <div className="prose prose-gray max-w-none space-y-6 text-sm leading-relaxed">
        <div className="bg-rxgate-50 border border-rxgate-200 rounded-lg p-4 mb-6">
          <p className="font-medium text-rxgate-700">Our Commitment</p>
          <p className="text-rxgate-600 text-sm mt-1">RxGate is committed to protecting your privacy and handling your personal data transparently, in full compliance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Who We Are</h2>
          <p>RxGate is a veterinary pharmacy operating in Northern Ireland, United Kingdom. We are the data controller for your personal information.</p>
          <p className="mt-2"><strong>Data Protection Officer:</strong> dpo@rxgate.example</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">2. What Data We Collect</h2>
          <p>We collect and process the following categories of personal data:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Identity Data:</strong> Name, email address, phone number, postal address</li>
            <li><strong>Professional Data (vets):</strong> Practice name, veterinary registration number</li>
            <li><strong>Prescription Data:</strong> Prescription images, medication details, dosage instructions, veterinarian details</li>
            <li><strong>Pet Health Data:</strong> Information about your pet's medical treatment contained in prescriptions</li>
            <li><strong>Transaction Data:</strong> Payment records (processed via Stripe — we never store card details)</li>
            <li><strong>Technical Data:</strong> IP address, browser type, device information, usage patterns</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Legal Basis for Processing</h2>
          <p>We process your personal data under the following legal bases:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Consent (Article 6(1)(a)):</strong> You have given explicit consent by creating an account and accepting this policy</li>
            <li><strong>Contract (Article 6(1)(b)):</strong> Processing is necessary for the performance of our contract to dispense veterinary medications</li>
            <li><strong>Legal Obligation (Article 6(1)(c)):</strong> We are required by UK/NI veterinary medicines regulations to maintain prescription records</li>
            <li><strong>Legitimate Interests (Article 6(1)(f)):</strong> For account security, fraud prevention, and service improvement</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">4. How We Use Your Data</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>To process and dispense veterinary prescriptions</li>
            <li>To verify prescription authenticity and regulatory compliance</li>
            <li>To communicate with you about your orders and prescriptions</li>
            <li>To process payments securely via Stripe</li>
            <li>To maintain records as required by UK/NI veterinary pharmaceutical regulations</li>
            <li>To improve our services and ensure platform security</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Data Retention</h2>
          <p>We retain your personal data only for as long as necessary:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Account data:</strong> Retained until account deletion request, or after 3 years of inactivity</li>
            <li><strong>Prescription records:</strong> Retained for 3 years as required by UK/NI veterinary medicines regulations (Veterinary Medicines Regulations 2013)</li>
            <li><strong>Financial records:</strong> Retained for 7 years as required by HMRC</li>
            <li><strong>After retention:</strong> Data is anonymised or securely deleted</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Data Sharing</h2>
          <p>We share your data only with trusted processors:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Stripe:</strong> Payment processing — GDPR compliant, PCI DSS Level 1 certified</li>
            <li><strong>Email Service:</strong> Transactional emails regarding your prescriptions</li>
            <li><strong>Regulatory Authorities:</strong> If required by law (e.g., Veterinary Medicines Directorate)</li>
          </ul>
          <p className="mt-2">We never sell your personal data to third parties.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Security Measures</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>All data transmitted over HTTPS/TLS (256-bit encryption)</li>
            <li>Passwords hashed with bcrypt (12 rounds)</li>
            <li>JWT token-based authentication with session revocation</li>
            <li>Access logging and monitoring</li>
            <li>Regular security updates and vulnerability assessments</li>
            <li>Stripe handles all payment data — we never see or store card numbers</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Your Rights</h2>
          <p>Under UK GDPR, you have the following rights:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Right to Access:</strong> Request a copy of all data we hold about you</li>
            <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete data</li>
            <li><strong>Right to Erasure:</strong> Request deletion of your personal data (subject to legal retention requirements)</li>
            <li><strong>Right to Restrict Processing:</strong> Limit how we use your data</li>
            <li><strong>Right to Data Portability:</strong> Receive your data in a machine-readable format</li>
            <li><strong>Right to Object:</strong> Object to processing based on legitimate interests</li>
          </ul>
          <p className="mt-2">To exercise any of these rights, visit your <Link to="/customer/dashboard" className="text-rxgate-600 underline">Privacy Settings</Link> dashboard or contact our DPO at dpo@rxgate.example.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Cookies</h2>
          <p>We use only essential cookies for authentication and security. No tracking or analytics cookies are used without your explicit consent. You can manage your cookie preferences using the cookie banner on our website.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">10. International Transfers</h2>
          <p>Your data is processed within the United Kingdom and European Economic Area (EEA). Where data is transferred to Stripe (US-based), we rely on the UK International Data Transfer Agreement and Stripe's certification under the EU-US Data Privacy Framework.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Contact & Complaints</h2>
          <p><strong>Data Protection Officer:</strong> dpo@rxgate.example</p>
          <p className="mt-1"><strong>Regulator:</strong> You have the right to lodge a complaint with the Information Commissioner's Office (ICO): <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-rxgate-600 underline">ico.org.uk</a></p>
        </section>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200">
        <Link to="/" className="btn-primary inline-block">Return to Home</Link>
      </div>
    </div>
  );
}
