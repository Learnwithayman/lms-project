// ==========================================
// 💳 STEP 17: PAYPAL READER (read-only)
// ==========================================
// Reads subscriptions, recurring invoice series and invoices from PayPal with the "LMS reader" app.
// Keys come from the environment (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET). This file only READS:
// it never sends, charges, refunds or changes anything in PayPal.

const axios = require('axios');

const API = 'https://api-m.paypal.com';
let cached = { token: null, until: 0 };

const hasKeys = () => !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const getToken = async () => {
  if (cached.token && Date.now() < cached.until) return cached.token;
  if (!hasKeys()) throw new Error('PayPal keys are missing on the server (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).');
  const res = await axios.post(`${API}/v1/oauth2/token`, 'grant_type=client_credentials', {
    auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_CLIENT_SECRET },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000
  });
  cached = { token: res.data.access_token, until: Date.now() + Math.max(60, (res.data.expires_in || 3600) - 300) * 1000 };
  return cached.token;
};

const get = async (path) => {
  const token = await getToken();
  const res = await axios.get(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
  return res.data;
};

const getSubscription = (id) => get(`/v1/billing/subscriptions/${encodeURIComponent(id.trim())}`);
const getPlan = (id) => get(`/v1/billing/plans/${encodeURIComponent(id.trim())}`);
const getSeries = (id) => get(`/v2/invoicing/recurring-invoices/${encodeURIComponent(id.trim())}`);
const getInvoice = (id) => get(`/v2/invoicing/invoices/${encodeURIComponent(id.trim())}`);
// Newest invoices first, 100 per page
const listInvoices = (page) => get(`/v2/invoicing/invoices?page=${page}&page_size=100&total_required=true`);

// Short reason for a PayPal error (no secrets)
const errorText = (e) => {
  if (e.response) {
    const d = e.response.data || {};
    return `PayPal ${e.response.status}: ${d.name || d.error || ''} ${d.message || d.error_description || ''}`.trim();
  }
  return e.message;
};

module.exports = { hasKeys, getSubscription, getPlan, getSeries, getInvoice, listInvoices, errorText };
