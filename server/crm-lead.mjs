import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FALLBACK_MESSAGE = 'Thank you for your response. We will contact you as soon as possible!';

function loadCrmConfig() {
  const dashboard = fs.readFileSync(path.join(ROOT, 'server/templates/includes/get-dashboard.php'), 'utf8');
  const apiClass = fs.readFileSync(path.join(ROOT, 'server/templates/class/Api.class.php'), 'utf8');
  const url = dashboard.match(/\$dashboardUrl\s*=\s*"([^"]+)"/)?.[1] || '';
  const token = apiClass.match(/Authorization:\s*Bearer\s+([^"']+)/)?.[1] || '';
  if (!url || !token) throw new Error('CRM dashboard URL or API token is missing.');
  return { url, token };
}

/** Same labels as includes/ppc_or_seo.php */
export function leadSource(pageUrl) {
  let params;
  try {
    params = new URL(pageUrl || 'http://localhost/').searchParams;
  } catch {
    params = new URLSearchParams();
  }
  if (['gclid', 'utm_source', 'utm_medium', 'utm_campaign'].some((key) => params.has(key))) return 'PPC';
  if (params.has('fbclid')) return 'Facebook';
  if (/google/i.test(pageUrl || '')) return 'SEO';
  return 'OTHER';
}

export async function submitCrmLead({ fields = {}, pageUrl = '', host = '' }) {
  const { url, token } = loadCrmConfig();
  const brief = `${fields.brief || ' '} | ${fields.company || ' '} | ${fields.budget || ' '}`;
  const route = String(fields.route || pageUrl || '').split('?')[0];
  const payload = {
    name: fields.name || '',
    email: fields.email || '',
    phone: fields.phone || '',
    website_url: host,
    brief,
    source: leadSource(pageUrl),
    news: 1,
    route,
    brand: fields.brand || '',
    tag: fields.tag || '',
    price: fields.price || '',
    domain: host,
    ip_address: '',
    server_ip: null,
    reference_url: pageUrl || null,
  };

  const res = await fetch(`${url}/customer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  const message = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.message)
    || (Array.isArray(parsed) ? parsed[1] : '')
    || FALLBACK_MESSAGE;
  return { ok: res.ok, message: String(message || FALLBACK_MESSAGE) };
}
