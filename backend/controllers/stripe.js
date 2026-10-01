const Stripe = require('stripe');

let stripe = null;

function getStripe() {
  if (!stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      stripe = new Stripe(secretKey);
      console.log('Stripe initialized.');
    } else {
      console.warn('Stripe not configured. Set STRIPE_SECRET_KEY in .env');
      // Return a mock for development
      stripe = {
        checkout: {
          sessions: {
            create: async (params) => {
              const sessionId = `cs_dev_${Date.now()}`;
              const prescriptionId = params.metadata?.prescription_id || '';
              const base = process.env.FRONTEND_URL || 'http://localhost:5173';
              return {
                id: sessionId,
                // Carry the prescription through so the simulated checkout page can
                // show which order is being paid and complete the right record.
                url: `${base}/payment/mock?session_id=${sessionId}&prescription_id=${encodeURIComponent(prescriptionId)}`,
                payment_intent: `pi_dev_${Date.now()}`,
                amount_total: params.line_items?.[0]?.price_data?.unit_amount || 0,
                customer_email: params.customer_email,
                status: 'complete',
                payment_status: 'paid'
              };
            },
            retrieve: async (id) => ({
              id,
              payment_intent: `pi_${id}`,
              amount_total: 4500,
              customer_email: 'test@example.com',
              status: 'complete',
              payment_status: 'paid'
            })
          }
        },
        paymentIntents: {
          retrieve: async (id) => ({
            id,
            amount: 4500,
            currency: 'gbp',
            status: 'succeeded'
          })
        }
      };
    }
  }
  return stripe;
}

/**
 * Create a Stripe Checkout Session for a prescription payment
 * @param {object} params
 * @param {string} params.prescriptionId - Internal prescription ID
 * @param {string} params.customerEmail - Customer email
 * @param {string} params.drugName - Name of the drug
 * @param {number} params.amount - Amount in pence (e.g., 4500 = £45.00)
 * @param {string} params.successUrl - Redirect URL on success
 * @param {string} params.cancelUrl - Redirect URL on cancel
 * @returns {Promise<object>} Stripe session object
 */
async function createCheckoutSession({ prescriptionId, customerEmail, customerName, drugName, amount, successUrl, cancelUrl }) {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: customerEmail,
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: {
            name: drugName || 'Veterinary Prescription',
            description: `Prescription #${prescriptionId.substring(0, 8)}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      prescription_id: prescriptionId,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session;
}

/**
 * Retrieve checkout session details
 */
async function getSession(sessionId) {
  const stripe = getStripe();
  return await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent'],
  });
}

module.exports = { createCheckoutSession, getSession };
