// Node: "Resolve order and decide"  (n8n Code node, run once for each item)  [v2]
//
// This is where the business rules live. The LLM only extracted facts (the
// classification); this code decides what happens. Nothing here can be changed
// by text inside a customer email.
//
// POLICY is added above this code by scripts/build_workflow_v2.js (config/policy.json).
//
// Input : $json = the orders payload from the "Fetch orders" node
// Output: decision, the one order this sender may see, and the input for the AI agent

const prep = $('Prepare email').first().json;
const vc = $('Validate classification').first().json;
const cls = vc.cls;
const meta = vc.meta;
const email = prep.email;

const ordersOk = Array.isArray($json.orders);
const orders = ordersOk ? $json.orders : [];
const sender = String(email.from.email || '').trim().toLowerCase();
const receivedDate = String(email.received_at).slice(0, 10);      // the email's own date, never the real clock
const attachments = Array.isArray(email.attachments) ? email.attachments : [];

// ---------- helpers ----------
const dayNum = (d) => { const p = String(d).slice(0, 10).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; };
function inr(n) {
  const s = String(Math.round(n));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + (rest ? rest + ',' + last3 : last3);
}
function firstName(name) {
  const t = String(name || '').trim().split(/\s+/)[0] || '';
  return /^[A-Za-zऀ-ॿ]+$/.test(t) && !/[-@]/.test(String(name)) ? t : 'there';
}

// Delivery region from FAQ section 1. Only used when the customer names a place.
const NE = ['assam', 'arunachal', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'tripura', 'sikkim', 'jammu', 'kashmir', 'ladakh', 'andaman', 'nicobar', 'lakshadweep',
  'guwahati', 'shillong', 'imphal', 'aizawl', 'kohima', 'agartala', 'itanagar', 'gangtok', 'dibrugarh', 'silchar', 'srinagar', 'leh', 'kargil', 'port blair', 'kavaratti'];
const METRO = ['delhi', 'gurgaon', 'gurugram', 'noida', 'ghaziabad', 'faridabad', 'mumbai', 'bengaluru', 'bangalore', 'chennai', 'kolkata', 'hyderabad', 'pune'];
function regionTier(loc) {
  if (!loc) return null;
  const s = String(loc).toLowerCase();
  if (NE.some((x) => s.includes(x))) return 'north_east_and_remote';
  if (METRO.some((x) => s.includes(x))) return 'metro';
  return 'rest_of_india';
}

// Match product names the customer wrote to the items on the order (best token overlap).
const STOP = new Set(['the', 'and', 'my', 'of', 'ml', 'gm', 'one', 'two', 'bottle', 'bottles', 'jar', 'box', 'pack', 'packs']);
const toks = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
function matchItems(order, names) {
  if (!names || !names.length) return order.items.slice();
  const hit = new Map();
  for (const n of names) {
    const nt = new Set(toks(n));
    let best = 0; let bestItems = [];
    for (const it of order.items) {
      const score = toks(it.name).filter((w) => nt.has(w)).length;
      if (score > best) { best = score; bestItems = [it]; } else if (score === best && score > 0) bestItems.push(it);
    }
    bestItems.forEach((it) => hit.set(it.sku, it));
  }
  return hit.size ? Array.from(hit.values()) : order.items.slice();
}

// ---------- 1. find the order, and check ownership ----------
let order = null;
let lookup = 'none';
let privacyBlocked = false;
let ambiguous = false;
if (cls.order_id) {
  const o = orders.find((x) => x.order_id === cls.order_id);
  if (!o) lookup = 'id_not_found';
  else if (String(o.customer_email).toLowerCase() !== sender) { lookup = 'owner_mismatch'; privacyBlocked = true; }
  else { order = o; lookup = 'by_id'; }
} else {
  const m = orders.filter((x) => String(x.customer_email).toLowerCase() === sender);
  if (m.length === 1) { order = m[0]; lookup = 'by_email'; }
  else if (m.length > 1) { lookup = 'ambiguous_email'; ambiguous = true; }
  else lookup = 'no_match';
}

// The only order data the agent can ever see. No customer email, no address.
const authorized = order && {
  order_id: order.order_id, order_date: order.order_date, status: order.status,
  items: order.items.map((i) => ({ name: i.name, qty: i.qty, unit_price: i.unit_price })),
  subtotal: order.subtotal, shipping_fee: order.shipping_fee, cod_fee: order.cod_fee, total: order.total,
  payment_method: order.payment_method, courier: order.courier, tracking_url: order.tracking_url,
  shipped_date: order.shipped_date, estimated_delivery: order.estimated_delivery, delivered_date: order.delivered_date,
  cancelled_date: order.cancelled_date, cancellation_reason: order.cancellation_reason, refund_status: order.refund_status
};
const days = order && order.delivered_date ? dayNum(receivedDate) - dayNum(order.delivered_date) : null;

// ---------- 2. risk signals ----------
const reasons = [];
if (meta.fallback) reasons.push('classification_failed');
else if (cls.confidence < POLICY.confidence_threshold) reasons.push('low_confidence');
if (cls.sentiment === 'angry') reasons.push('angry_customer');
const INJECTION = /(ignore (all )?(previous|prior|above) (instructions|rules|polic)|system (note|prompt|message)|note to (the )?(ai|assistant)|you are now|disregard .{0,30}(polic|instruction)|do not create (any )?ticket|mark (the )?(refund )?as approved)/i;
const injection = cls.instruction_attempt || INJECTION.test(String(email.subject) + ' ' + String(email.body));
if (injection) reasons.push('prompt_injection_attempt');
if (cls.medical_question) reasons.push('medical_question');
if (!ordersOk) reasons.push('order_api_unavailable');

// ---------- 3. decide the action ----------
const intent = cls.intent;
let action = 'draft_reply';
let replyRequired = true;
let ticketRequired = false;
let priority = '';
let eligibility = null;
let refundAmount = null;
let refundMethod = null;
const tp = []; // talking points the reply must cover

const needsOrder = ['order_status', 'return_refund', 'complaint'].includes(intent);
const isDamageType = ['damaged', 'wrong_item', 'missing_item'].includes(cls.issue_type);
const payCod = order && order.payment_method === 'cod';

if (intent === 'other') {
  if (cls.other_type === 'spam') { action = 'log_only_spam'; replyRequired = false; }
  else if (cls.other_type === 'thanks') { action = 'log_only_thanks'; replyRequired = false; }
  else if (cls.other_type === 'partnership') {
    action = 'partnership_redirect_draft';
    tp.push('Thank them for reaching out.', 'Say business and partnership enquiries go to partnerships@kesarandco.example and suggest they send their details there.', 'Do not commit to anything.');
  } else {
    action = 'holding_reply_escalated';
    reasons.push('not_in_faq');
    tp.push('Thank them and say their request has been passed to the team, who will follow up within 24 business hours.', 'Do not state or promise anything that is not in the FAQ (for example invoices or documents).');
  }
} else if (privacyBlocked) {
  action = 'privacy_refusal_draft';
  reasons.push('privacy_mismatch');
  tp.push('Say you can only discuss order details with the email address used to place the order.',
    'Do not confirm or mention anything about the order: not its contents, status, tracking or address.',
    'Invite the account holder to write to us from the email address on the order.');
} else if (lookup === 'id_not_found') {
  action = 'order_not_found_draft';
  reasons.push('order_not_found');
  tp.push('Say you could not find an order with that number.', 'Ask them to double-check the number (format KC-1234) and the email used at checkout.', 'Say a team member will follow up within 24 business hours.');
} else if (needsOrder && !order) {
  if (ambiguous) { action = 'ask_order_id_draft'; reasons.push('multiple_orders'); }
  else { action = 'ask_order_id_draft'; reasons.push('order_unidentified'); }
  tp.push('Say you could not match an order to this email address.', 'Ask for the order number (format KC-1234) and the email used at checkout.', 'Do not guess which order they mean.');
} else if (intent === 'product_query') {
  action = cls.medical_question ? 'medical_safe_reply' : 'draft_reply';
  if (cls.medical_question) {
    tp.push('Say our products are cosmetics, not medicines, and are not intended to diagnose, treat or cure any skin or medical condition.',
      'Recommend consulting a dermatologist or doctor before use, and mention the patch test.',
      'Do not say whether it will work or how long it would take.');
  }
  const tier = regionTier(cls.customer_location);
  if (tier) {
    tp.push('The customer is in ' + cls.customer_location + '. Delivery after dispatch for this region is ' + POLICY.delivery_days_after_dispatch[tier] + ' business days, and dispatch takes ' + POLICY.dispatch_business_days + ' business days.');
  }
} else if (intent === 'order_status') {
  action = 'draft_reply';
  tp.push('Use get_order for the real status, dates and tracking link.');
} else {
  // return_refund or complaint, with a known order the sender owns
  ticketRequired = true;
  const items = matchItems(order, cls.items_affected);
  const allAffected = items.length === order.items.length;
  const itemsValue = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
  refundMethod = payCod ? 'UPI or bank transfer (we ask for the details only after pickup is completed)' : 'the original payment method within 5-7 business days after the returned item passes quality check';
  priority = (intent === 'complaint' || cls.sentiment === 'angry') ? 'High' : 'Medium';

  if (order.status !== 'delivered') {
    eligibility = { path: 'not_delivered', status: 'not_applicable', reason: 'order status is ' + order.status };
    action = 'ticket_and_draft';
    tp.push('The order is not delivered yet (status: ' + order.status + '). Explain that returns start after delivery, and give the real status from get_order.');
  } else if (isDamageType) {
    const within = days <= 2; // FAQ: report within 48 hours of delivery (dates only, so allow up to 2 days)
    eligibility = { path: 'damaged_wrong_missing', days_since_delivery: days, within_48h_window: within, photos_attached: attachments.length > 0, status: within ? 'pending_verification' : 'outside_window' };
    if (cls.requested_resolution !== 'replacement') refundAmount = allAffected && cls.issue_type !== 'missing_item' ? order.total : itemsValue;
    if (cls.issue_type === 'missing_item') reasons.push('packing_record_check');
    if (!within) {
      action = 'ticket_denial_draft'; reasons.push('late_damage_report'); priority = priority === 'High' ? 'High' : 'Low';
      tp.push('Explain kindly that damaged, wrong or missing items must be reported within 48 hours of delivery, so we cannot process this automatically, and that a team member will review and follow up within 24 business hours.');
    } else if (cls.issue_type === 'missing_item') {
      action = 'missing_item_ticket_draft';
      tp.push('Apologise for the missing item.', 'Say we will check it against the packing record and then ship the missing item or refund its value, as the customer prefers. A team member confirms within 24 business hours.');
      if (refundAmount) tp.push('The value of the missing item is ' + inr(itemsValue) + '. The customer asked for a refund.');
    } else if (attachments.length === 0) {
      action = 'ask_photos_ticket_draft';
      tp.push('Apologise sincerely.', 'Ask for photos of the product and of the outer box.',
        'Explain that after we verify the photos we offer a free replacement or a full refund, the customer\'s choice (use search_faq, FAQ section 5). For a wrong item we pick it up and send the correct one at no cost. Do not promise either yet.');
    } else {
      action = 'photos_received_ticket_draft'; reasons.push('photo_verification');
      tp.push('Thank them for the photos (' + attachments.join(', ') + ') and apologise.',
        'Say a team member will verify the photos and confirm within 24 business hours.',
        'Customer preference: ' + cls.requested_resolution + '. Note it, but do not promise it.');
    }
  } else {
    const within = days <= POLICY.return_window_days;
    const used = cls.item_condition === 'opened_or_used';
    const why = [];
    if (!within) why.push('window_passed');
    if (used) why.push('opened_or_used');
    refundAmount = itemsValue; // product value only: shipping and COD fees are not refundable
    if (why.length) {
      eligibility = { path: 'return_unused', days_since_delivery: days, within_7_day_window: within, item_condition: cls.item_condition, status: 'ineligible', reasons: why };
      action = 'ticket_denial_draft'; reasons.push('refund_denied_review'); refundAmount = null;
      priority = (intent === 'complaint' || cls.sentiment === 'angry') ? 'High' : 'Low';
      tp.push('Kindly explain we cannot accept this return: ' + (why.includes('window_passed') ? 'returns are accepted within 7 days of delivery. ' : '') + (why.includes('opened_or_used') ? 'for hygiene reasons we cannot accept opened or used products, including "did not suit me" or "did not see results" cases. ' : '') + '(FAQ section 4).',
        'Do not argue, do not claim any results, and do not offer or hint at a refund or goodwill.', 'Say a team member will review and follow up within 24 business hours.');
    } else {
      eligibility = { path: 'return_unused', days_since_delivery: days, within_7_day_window: true, item_condition: cls.item_condition, status: 'eligible_subject_to_pickup_check' };
      action = 'ticket_return_draft';
      tp.push('Confirm the return is within the 7-day window (delivered ' + days + ' days ago) and can go ahead, as long as the item is unopened with the seal intact when it is picked up.',
        'A free reverse pickup is arranged within 2-3 business days.',
        'Refund of ' + inr(refundAmount) + ' goes to ' + refundMethod + '. Shipping and COD fees are not refunded.',
        'Do not say the refund is approved. A team member confirms.');
      if (payCod) tp.push('Do NOT ask for UPI or bank details now. Say we will ask for them only after the pickup is completed.');
      if (items.some((i) => /kit/i.test(i.name))) tp.push('Combo or kit products must be returned as a complete set.');
      if (refundAmount >= POLICY.high_value_inr) reasons.push('high_value_refund');
    }
    if (intent === 'complaint' && cls.sentiment === 'angry') tp.unshift('Open with a sincere apology and stay calm and empathetic.');
  }
  if (cls.sentiment === 'angry' && action === 'ask_photos_ticket_draft') tp.push('Do not mention social media or reviews. Stay calm and empathetic.');
}

// ---------- 4. package the result ----------
const decision = {
  action, reply_required: replyRequired, ticket_required: ticketRequired, priority,
  needs_human: reasons.length > 0, escalation_reasons: reasons,
  order_lookup: { method: lookup, order_id: order ? order.order_id : null, found: !!order, privacy_blocked: privacyBlocked },
  eligibility, refund_amount_inr: refundAmount, refund_method: refundMethod,
  days_since_delivery: days, injection_detected: injection, talking_points: tp
};

const allowedAmounts = [1299, 1149, 699, 899, 649, 749, 499, 3499, POLICY.free_shipping_min_inr, POLICY.shipping_fee_inr, POLICY.cod_limit_inr, POLICY.cod_fee_inr];
if (authorized) {
  authorized.items.forEach((i) => allowedAmounts.push(i.unit_price, i.unit_price * i.qty));
  allowedAmounts.push(authorized.subtotal, authorized.shipping_fee, authorized.cod_fee, authorized.total);
}
if (refundAmount) allowedAmounts.push(refundAmount);
const allowedUrls = authorized && authorized.tracking_url ? [authorized.tracking_url] : [];

const langLabel = { en: 'English', hi: 'Hindi (Devanagari script)', hinglish: 'Hinglish (Hindi in Latin letters mixed with English)' }[cls.language];
const forAgent = {
  action, order_number: authorized ? authorized.order_id : null,
  share_order_details: !!authorized && !privacyBlocked,
  refund_amount_inr: refundAmount, refund_method: refundMethod,
  eligibility, talking_points: tp
};
const agentInput = [
  'Customer first name: ' + firstName(email.from.name),
  'Reply language: ' + langLabel,
  '',
  '<customer_email>',
  'Subject: ' + email.subject,
  String(email.body),
  '</customer_email>',
  '',
  'DECISION (final, made by company systems):',
  JSON.stringify(forAgent, null, 2)
].join('\n');

return {
  json: {
    email, cls, meta, decision,
    authorized_order: authorized || null,
    allowed_amounts: Array.from(new Set(allowedAmounts)),
    allowed_urls: allowedUrls,
    agent_input: agentInput
  }
};
