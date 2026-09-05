const admin = require('firebase-admin');

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://stepro-contractors-default-rtdb.europe-west1.firebasedatabase.app';
const GREEN_API_ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
const GREEN_API_GROUP_ID = process.env.GREEN_API_GROUP_ID;
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;

for (const [name, value] of Object.entries({
  GREEN_API_ID_INSTANCE,
  GREEN_API_TOKEN,
  GREEN_API_GROUP_ID,
  FIREBASE_SERVICE_ACCOUNT: SERVICE_ACCOUNT_JSON,
})) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch (e) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT must contain the full Firebase service-account JSON.');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL,
});

const db = admin.database();
const MS_DAY = 24 * 60 * 60 * 1000;

function todayRiyadhISO() {
  // YYYY-MM-DD in Saudi Arabia time, independent of the GitHub runner timezone.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseISODate(value) {
  const s = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addOneYearISO(start) {
  const d = parseISODate(start);
  if (!d) return '';
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function diffDays(targetISO, todayISO) {
  const a = parseISODate(targetISO);
  const b = parseISODate(todayISO);
  if (!a || !b) return null;
  return Math.round((a - b) / MS_DAY);
}

function isCompletedVisit(v) {
  const s = String(v?.status || '').trim();
  return ['منفذة', 'مكتمل', 'مكتملة', 'تمت المراجعة', 'Completed', 'Done'].some(x => s.toLowerCase() === x.toLowerCase());
}

function isPaid(p) {
  const s = String(p?.status || p?.paymentStatus || '').trim();
  return s === 'مدفوعة' || s === 'مدفوع' || /^paid$/i.test(s) || p?.paid === true || p?.isPaid === true || p?.approved === true;
}

function clientId(c, key) {
  return String(c?.id ?? key ?? '-');
}

function clientName(c) {
  return String(c?.name || 'عميل');
}

function contractEnd(c) {
  return String(c?.contractEndDate || c?.endDate || addOneYearISO(c?.contractStartDate || c?.start) || c?.end || '').slice(0, 10);
}

function visitsOf(c) {
  return [c?.visitSchedule, c?.visitsSchedule, c?.schedule, c?.visitsList, c?.visitsTable].find(Array.isArray) || [];
}

function paymentsOf(c) {
  if (Array.isArray(c?.payments) && c.payments.length) return c.payments;
  if (Array.isArray(c?.manualPayments) && c.manualPayments.length) {
    return c.manualPayments.map((p, i) => ({
      ...p,
      number: p.number || i + 1,
      dueDate: p.dueDate || p.date || '',
    }));
  }
  if (Array.isArray(c?.paymentSchedule)) return c.paymentSchedule;
  return [];
}

function fmtAmount(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) && n ? `${n.toLocaleString('en-US')} SAR` : '';
}

async function sendWhatsApp(message) {
  const shard = String(GREEN_API_ID_INSTANCE).slice(0, 4);
  const url = `https://${shard}.api.greenapi.com/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: GREEN_API_GROUP_ID, message }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Green API ${res.status}: ${body}`);
  console.log('WhatsApp sent:', body);
}

function safeKey(s) {
  return String(s).replace(/[.#$\[\]/]/g, '_');
}

async function sendOnce(eventKey, message, meta = {}) {
  const ref = db.ref(`notificationLog/${safeKey(eventKey)}`);
  const snap = await ref.once('value');
  if (snap.exists()) {
    console.log('Already sent, skipping:', eventKey);
    return false;
  }

  await sendWhatsApp(message);
  await ref.set({
    sentAt: admin.database.ServerValue.TIMESTAMP,
    sentDate: todayRiyadhISO(),
    ...meta,
  });
  return true;
}

function visitMessage(c, cid, visit, index, total, days) {
  const number = visit?.number || index + 1;
  const date = String(visit?.date || visit?.scheduledVisitDate || '').slice(0, 10);
  if (days === 6) {
    return [
      '🔔 تذكير زيارة / Visit Reminder',
      `👤 العميل / Customer: ${clientName(c)}`,
      `📄 العقد / Contract: #${cid}`,
      `📅 الزيارة / Visit: ${number} / ${total}`,
      `🗓️ الموعد / Date: ${date}`,
      '⏳ المتبقي / Remaining: 6 Days',
    ].join('\n');
  }
  return [
    '🔔 زيارة غدًا / Visit Tomorrow',
    `👤 العميل / Customer: ${clientName(c)}`,
    `📄 العقد / Contract: #${cid}`,
    `📅 الزيارة / Visit: ${number} / ${total}`,
    `🗓️ الموعد / Date: ${date}`,
    '⏰ غدًا / Tomorrow',
  ].join('\n');
}

function contractMessage(c, cid, end, days) {
  if (days === 15) {
    return [
      '📄 اقتراب انتهاء العقد / Contract Expiry',
      `👤 العميل / Customer: ${clientName(c)}`,
      `📄 العقد / Contract: #${cid}`,
      `🗓️ الانتهاء / Expiry: ${end}`,
      '⏳ المتبقي / Remaining: 15 Days',
    ].join('\n');
  }
  return [
    '⚠️ العقد منتهي / Contract Expired',
    `👤 العميل / Customer: ${clientName(c)}`,
    `📄 العقد / Contract: #${cid}`,
    `🗓️ الانتهاء / Expired: ${end}`,
    '⏱️ منذ / Since: 1 Day',
  ].join('\n');
}

function paymentMessage(c, cid, p, index, overdueDays) {
  const no = p?.number || index + 1;
  const due = String(p?.dueDate || p?.date || p?.paymentDate || p?.scheduledDate || '').slice(0, 10);
  const amount = fmtAmount(p?.amount ?? p?.value ?? p?.paymentAmount);
  return [
    '💳 دفعة متأخرة / Overdue Payment',
    `👤 العميل / Customer: ${clientName(c)}`,
    `📄 العقد / Contract: #${cid}`,
    `💰 الدفعة / Payment: #${no}${amount ? ` — ${amount}` : ''}`,
    `🗓️ الاستحقاق / Due: ${due}`,
    `⏱️ التأخير / Overdue: ${overdueDays} Days`,
  ].join('\n');
}

async function main() {
  const today = todayRiyadhISO();
  console.log('Saudi date:', today);

  const snap = await db.ref('clients').once('value');
  const raw = snap.val() || {};
  const entries = Array.isArray(raw)
    ? raw.map((c, i) => [String(i), c]).filter(([, c]) => c)
    : Object.entries(raw).filter(([, c]) => c);

  let sent = 0;

  for (const [key, c] of entries) {
    const cid = clientId(c, key);

    // 1) Scheduled visits: 6 days before and 1 day before.
    const visits = visitsOf(c);
    for (let i = 0; i < visits.length; i++) {
      const v = visits[i];
      if (!v || isCompletedVisit(v)) continue;
      const date = String(v.date || v.scheduledVisitDate || '').slice(0, 10);
      const days = diffDays(date, today);
      if (days !== 6 && days !== 1) continue;
      const eventKey = `visit_${cid}_${v.id || i + 1}_${date}_d${days}`;
      if (await sendOnce(eventKey, visitMessage(c, cid, v, i, visits.length, days), { type: 'visit', clientId: cid, date, days })) sent++;
    }

    // 2) Contract: 15 days before, and one day after expiration.
    const end = contractEnd(c);
    const contractDays = diffDays(end, today);
    if (contractDays === 15 || contractDays === -1) {
      const eventKey = `contract_${cid}_${end}_${contractDays === 15 ? 'd15' : 'expired_d1'}`;
      if (await sendOnce(eventKey, contractMessage(c, cid, end, contractDays), { type: 'contract', clientId: cid, endDate: end, days: contractDays })) sent++;
    }

    // 3) Payment: becomes overdue after 3 full days. Send once when it first qualifies.
    const payments = paymentsOf(c);
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!p || isPaid(p)) continue;
      const due = String(p.dueDate || p.date || p.paymentDate || p.scheduledDate || '').slice(0, 10);
      const daysUntilDue = diffDays(due, today);
      if (daysUntilDue === null) continue;
      const overdueDays = -daysUntilDue;
      if (overdueDays < 3) continue;
      const paymentNo = p.number || i + 1;
      const eventKey = `payment_${cid}_${paymentNo}_${due}_overdue3`;
      if (await sendOnce(eventKey, paymentMessage(c, cid, p, i, overdueDays), { type: 'payment', clientId: cid, paymentNumber: paymentNo, dueDate: due, overdueDays })) sent++;
    }
  }

  console.log(`Done. Sent ${sent} notification(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
