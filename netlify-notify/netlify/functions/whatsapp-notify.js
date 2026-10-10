// Instant WhatsApp notification relay for the GitHub Pages app.
// Secrets live ONLY in Netlify environment variables (never in the public HTML):
//   GREEN_API_ID_INSTANCE, GREEN_API_TOKEN, GREEN_API_GROUP_ID
// Only signed-in Firebase users may call it (ID token verified with Google).

const FIREBASE_API_KEY = 'AIzaSyDudd2Y4qfxHJJXpxrDN1nGWPQaBnlKQro'; // public web key, same as in index.html
const ALLOWED_ORIGIN = 'https://khotwatmuhtarif-sys.github.io';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (statusCode, obj) => ({
  statusCode,
  headers: { ...cors, 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'method' });

  const { GREEN_API_ID_INSTANCE: id, GREEN_API_TOKEN: token, GREEN_API_GROUP_ID: group } = process.env;
  if (!id || !token || !group) return reply(500, { ok: false, error: 'server not configured' });

  const auth = String(event.headers.authorization || event.headers.Authorization || '');
  const idToken = auth.replace(/^Bearer\s+/i, '').trim();
  if (!idToken) return reply(401, { ok: false, error: 'no token' });

  try {
    const v = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!v.ok) return reply(401, { ok: false, error: 'invalid token' });
  } catch (e) {
    return reply(502, { ok: false, error: 'auth check failed' });
  }

  let message = '';
  try { message = String(JSON.parse(event.body || '{}').message || '').trim(); } catch (e) {}
  if (!message || message.length > 3000) return reply(400, { ok: false, error: 'bad message' });

  const shard = String(id).slice(0, 4);
  const url = `https://${shard}.api.greenapi.com/waInstance${id}/sendMessage/${token}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: group, message }),
    });
    const text = await res.text();
    if (!res.ok) return reply(502, { ok: false, error: 'green api ' + res.status });
    return reply(200, { ok: true });
  } catch (e) {
    return reply(502, { ok: false, error: 'send failed' });
  }
};
