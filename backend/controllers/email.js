const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    // Check if email is configured
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_PORT === '465',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
      console.log('Email transporter configured.');
    } else {
      console.warn('Email not configured. Set EMAIL_USER and EMAIL_PASS in .env to send emails.');
      // Create a fake transporter for development
      transporter = {
        sendMail: async (options) => {
          console.log('=== EMAIL (dev mode - not actually sent) ===');
          console.log(`To: ${options.to}`);
          console.log(`Subject: ${options.subject}`);
          console.log(`Body preview: ${options.html?.substring(0, 200)}...`);
          console.log('===========================================');
          return { messageId: `dev-${Date.now()}@rxgate.local` };
        }
      };
    }
  }
  return transporter;
}

/**
 * Send payment link email to customer
 * @param {object} params
 * @param {string} params.to - Customer email
 * @param {string} params.customerName - Customer name
 * @param {string} params.drugName - Name of prescribed drug
 * @param {string} params.amount - Amount in pounds (e.g., "45.00")
 * @param {string} params.paymentLink - Full payment URL
 * @param {string} params.prescriptionId - Prescription ID
 */
async function sendPaymentLinkEmail({ to, customerName, drugName, amount, paymentLink, prescriptionId }) {
  const transporter = getTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
        .header { background: #822746; padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; }
        .body { padding: 30px; }
        .details { background: #f8f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #822746; }
        .details p { margin: 8px 0; color: #333; }
        .details .label { font-weight: 600; color: #822746; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        .price { font-size: 28px; font-weight: 700; color: #822746; text-align: center; margin: 20px 0; }
        .button { display: inline-block; background: #822746; color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; margin: 20px 0; }
        .button:hover { background: #6a1f3a; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; border-top: 1px solid #eee; }
        .footer img { max-height: 40px; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>RxGate</h1>
          <p>Veterinary Prescription Services</p>
        </div>
        <div class="body">
          <p>Dear ${customerName},</p>
          <p>Your veterinary prescription has been approved by our pharmacy team. Please complete payment to proceed with your order.</p>

          <div class="details">
            <p><span class="label">Prescription</span><br>#${prescriptionId.substring(0, 8)}</p>
            <p><span class="label">Medication</span><br>${drugName}</p>
            <p><span class="label">Status</span><br>Approved - Awaiting Payment</p>
          </div>

          <div class="price">£${amount}</div>

          <div style="text-align: center;">
            <a href="${paymentLink}" class="button">Pay Now & Complete Order</a>
          </div>

          <p style="color: #666; font-size: 13px; margin-top: 20px;">
            This payment link will expire in 7 days. If you have any questions, please contact your veterinary practice.
          </p>
        </div>
        <div class="footer">
          <p>RxGate | Northern Ireland Veterinary Pharmacy</p>
          <p>This email was sent regarding your veterinary prescription.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const info = await transporter.sendMail({
    from: `"RxGate" <${process.env.EMAIL_USER || 'noreply@rxgate.example'}>`,
    to,
    subject: `Payment Link for Your Veterinary Prescription - ${drugName}`,
    html,
  });

  console.log(`Payment link email sent to ${to}: ${info.messageId}`);
  return info;
}

/**
 * Send prescription status update email
 */
async function sendStatusUpdateEmail({ to, customerName, prescriptionId, status, adminNotes }) {
  const transporter = getTransporter();
  const statusLabels = { approved: 'Approved', rejected: 'Not Approved', paid: 'Paid', fulfilled: 'Fulfilled' };
  const label = statusLabels[status] || status;
  const isRejected = status === 'rejected';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
        .header { background: ${isRejected ? '#dc3545' : '#822746'}; padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .body { padding: 30px; }
        .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Prescription ${label}</h1>
        </div>
        <div class="body">
          <p>Dear ${customerName},</p>
          <p>Your prescription <strong>#${prescriptionId.substring(0, 8)}</strong> has been <strong>${label}</strong>.</p>
          ${adminNotes ? `<p><strong>Notes:</strong> ${adminNotes}</p>` : ''}
          ${isRejected ? '<p>Please contact your veterinary practice for further information.</p>' : '<p>If you have already paid, your order is being processed.</p>'}
        </div>
        <div class="footer">
          <p>RxGate | Northern Ireland Veterinary Pharmacy</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const info = await transporter.sendMail({
    from: `"RxGate" <${process.env.EMAIL_USER || 'noreply@rxgate.example'}>`,
    to,
    subject: `Prescription ${label} - RxGate`,
    html,
  });

  console.log(`Status update sent to ${to}: ${info.messageId}`);
  return info;
}

module.exports = { sendPaymentLinkEmail, sendStatusUpdateEmail };
