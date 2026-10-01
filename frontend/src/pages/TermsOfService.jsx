import { Link } from 'react-router-dom';

export default function TermsOfService() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-gray-500 text-sm mb-8">Last updated: January 2025 · RxGate, Northern Ireland, UK</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="font-medium text-amber-700">Important Legal Notice</p>
          <p className="text-amber-600 text-sm mt-1">RxGate provides veterinary prescription dispensing services in compliance with the Veterinary Medicines Regulations 2013 (NI) and the Medicines (Veterinary Drugs) Regulations 2011. All prescription-only medications require prior veterinary prescription and pharmacy approval before dispensing.</p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Service Description</h2>
          <p>RxGate operates an online platform that facilitates:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>The upload and processing of veterinary prescriptions</li>
            <li>Pharmacy review and approval of prescriptions</li>
            <li>Secure payment processing for veterinary medications</li>
            <li>Dispensing and delivery of prescription and non-prescription veterinary products</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Account Registration</h2>
          <p>By creating an account, you confirm that:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>You are at least 18 years of age</li>
            <li>The information you provide is accurate and complete</li>
            <li>You will keep your login credentials secure</li>
            <li>You accept responsibility for all activity under your account</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Prescription Requirements</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>All prescription-only medications (POM-V) require a valid prescription from a UK-registered veterinary surgeon</li>
            <li>Prescriptions must be clear, legible, and include the vet's details and registration number</li>
            <li>Controlled Drugs (CD) have additional requirements as specified by the Misuse of Drugs Regulations (NI) 2002</li>
            <li>We reserve the right to reject any prescription that does not meet regulatory requirements</li>
            <li>Prescriptions are typically valid for 28 days (or as specified for the specific drug schedule)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Pharmacy Review & Approval</h2>
          <p>All prescriptions submitted through our platform are reviewed by our qualified pharmacy team before any medication is dispensed. The review process includes:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Verification of prescription authenticity and completeness</li>
            <li>Clinical check of the prescribed medication against the patient details</li>
            <li>Controlled drug validation (where applicable)</li>
            <li>Compliance with NI veterinary pharmaceutical regulations</li>
          </ul>
          <p className="mt-2">We reserve the right to refuse or cancel any order at our discretion, particularly if regulatory requirements are not met.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Payment Terms</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Payment is processed securely via Stripe</li>
            <li>Prices are in GBP (£) and inclusive of VAT where applicable</li>
            <li>Payment is taken only after prescription approval</li>
            <li>We do not store payment card details on our systems</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Controlled Drugs</h2>
          <p>For controlled drug prescriptions (Schedules 2-5 under the Misuse of Drugs Regulations):</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Additional validation checks are performed</li>
            <li>Schedule 2 & 3 prescriptions require the original paper prescription</li>
            <li>Supply is limited to a maximum of 30 days (28 days for Schedule 2)</li>
            <li>Safe custody requirements apply to Schedule 2 drugs</li>
            <li>Full CD records are maintained as required by law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Data Protection</h2>
          <p>Our handling of your personal data is governed by our <Link to="/privacy" className="text-rxgate-600 underline">Privacy Policy</Link>. By using our service, you acknowledge and agree to our data processing practices as described in that policy.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Limitation of Liability</h2>
          <p>RxGate acts as a dispensing pharmacy and is not responsible for:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>The clinical decisions made by prescribing veterinarians</li>
            <li>Adverse reactions to medications (please consult your vet if concerned)</li>
            <li>Delays caused by regulatory requirements or prescription validation</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Governing Law</h2>
          <p>These terms are governed by the laws of Northern Ireland, United Kingdom. Any disputes shall be subject to the exclusive jurisdiction of the courts of Northern Ireland.</p>
        </section>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200">
        <Link to="/" className="btn-primary inline-block">Return to Home</Link>
      </div>
    </div>
  );
}
