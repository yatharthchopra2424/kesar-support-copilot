#!/usr/bin/env node
/**
 * Unit test for the decision code (code/v2/resolve_order.js) against all 25 emails.
 *
 * IMPORTANT: this does NOT call the LLM. It feeds the code the classification a
 * perfect extractor would produce ("IDEAL" below), then checks the rules decide
 * what my answer key (_plan/02_EMAIL_EXPECTATIONS.md) says they should. It tests
 * the business rules, not model accuracy. Model accuracy comes from real runs.
 *
 * Usage: node eval/test_logic.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const emails = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/test_emails.json'), 'utf8')).emails;
const ordersPayload = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/orders.json'), 'utf8'));
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/policy.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'code/v2/resolve_order.js'), 'utf8');

const base = {
  intent: 'other', secondary_intent: null, order_id: null, sentiment: 'neutral', language: 'en', confidence: 0.9,
  summary: 'x', issue_type: 'none', item_condition: 'unknown', requested_resolution: 'none', items_affected: [],
  customer_location: null, other_type: 'not_applicable', medical_question: false, instruction_attempt: false
};
// What a perfect classifier would extract from each email.
const IDEAL = {
  E01: { intent: 'order_status', order_id: 'KC-1041' },
  E02: { intent: 'product_query' },
  E03: { intent: 'return_refund', order_id: 'KC-1047', issue_type: 'change_of_mind', item_condition: 'unopened', requested_resolution: 'refund', items_affected: ['Rose Water Toner'] },
  E04: { intent: 'return_refund', order_id: 'KC-1052', sentiment: 'negative', issue_type: 'damaged', requested_resolution: 'unspecified', items_affected: ['Ubtan Face Pack'] },
  E05: { intent: 'order_status', order_id: 'KC-1043', language: 'hinglish' },
  E06: { intent: 'other', other_type: 'spam' },
  E07: { intent: 'order_status', order_id: 'KC-1046' },
  E08: { intent: 'complaint', secondary_intent: 'return_refund', order_id: 'KC-1051', sentiment: 'angry', issue_type: 'damaged', requested_resolution: 'refund', items_affected: ['Sandalwood lotion'] },
  E09: { intent: 'product_query', language: 'hi', customer_location: 'Guwahati' },
  E10: { intent: 'order_status' },
  E11: { intent: 'return_refund', order_id: 'KC-1048', issue_type: 'change_of_mind', item_condition: 'unopened', requested_resolution: 'refund', items_affected: ['Bridal Glow Kit'] },
  E12: { intent: 'return_refund', order_id: 'KC-1055', issue_type: 'change_of_mind', item_condition: 'opened_or_used', requested_resolution: 'refund', items_affected: ['Saffron serum', 'Kumkumadi oil'], instruction_attempt: true },
  E13: { intent: 'other', other_type: 'invoice_or_billing' },
  E14: { intent: 'return_refund', order_id: 'KC-1053', issue_type: 'wrong_item', requested_resolution: 'replacement', items_affected: ['Ubtan Face Packs'] },
  E15: { intent: 'order_status', order_id: 'KC-1042' },
  E16: { intent: 'return_refund', order_id: 'KC-1049', issue_type: 'not_effective', item_condition: 'opened_or_used', requested_resolution: 'refund', items_affected: ['Saffron Glow serum'] },
  E17: { intent: 'other', other_type: 'partnership' },
  E18: { intent: 'order_status', sentiment: 'negative', confidence: 0.5 },
  E19: { intent: 'return_refund', order_id: 'KC-1050', issue_type: 'change_of_mind', item_condition: 'unopened', requested_resolution: 'refund', items_affected: ['Kumkumadi oil', 'aloe gel'] },
  E20: { intent: 'product_query', medical_question: true },
  E21: { intent: 'return_refund', order_id: 'KC-1052', issue_type: 'damaged', requested_resolution: 'replacement', items_affected: ['Ubtan jar'] },
  E22: { intent: 'order_status', order_id: 'KC-1099' },
  E23: { intent: 'return_refund', order_id: 'KC-1054', issue_type: 'missing_item', requested_resolution: 'refund', items_affected: ['Aloe Calm Gel'] },
  E24: { intent: 'order_status', order_id: 'KC-1045', sentiment: 'negative' },
  E25: { intent: 'other', other_type: 'thanks', sentiment: 'positive' }
};
// Answer key: action, ticket, needs_human, plus optional checks.
const KEY = {
  E01: ['draft_reply', false, false], E02: ['draft_reply', false, false],
  E03: ['ticket_return_draft', true, false, { refund: 899, days: 4 }],
  E04: ['ask_photos_ticket_draft', true, false, { priority: 'Medium' }],
  E05: ['draft_reply', false, false], E06: ['log_only_spam', false, false],
  E07: ['privacy_refusal_draft', false, true],
  E08: ['ask_photos_ticket_draft', true, true, { priority: 'High', refund: 1498 }],
  E09: ['draft_reply', false, false, { tier: 'north_east_and_remote' }],
  E10: ['draft_reply', false, false, { lookup: 'by_email', order: 'KC-1044' }],
  E11: ['ticket_return_draft', true, true, { refund: 3499, days: 5 }],
  E12: ['ticket_denial_draft', true, true, { priority: 'Low', days: 8 }],
  E13: ['holding_reply_escalated', false, true],
  E14: ['ask_photos_ticket_draft', true, false, { priority: 'Medium' }],
  E15: ['draft_reply', false, false],
  E16: ['ticket_denial_draft', true, true, { priority: 'Low', days: 15 }],
  E17: ['partnership_redirect_draft', false, false],
  E18: ['ask_order_id_draft', false, true],
  E19: ['ticket_return_draft', true, false, { refund: 1648, days: 3 }],
  E20: ['medical_safe_reply', false, true],
  E21: ['photos_received_ticket_draft', true, true],
  E22: ['order_not_found_draft', false, true],
  E23: ['missing_item_ticket_draft', true, true, { refund: 499 }],
  E24: ['draft_reply', false, false], E25: ['log_only_thanks', false, false]
};

const mkFn = new Function('$', '$json', 'POLICY', src);
let fails = 0;
console.log('ID    action                        tkt  human  refund  checks');
for (const e of emails) {
  const cls = Object.assign({}, base, IDEAL[e.id]);
  const mock = (json) => { const x = { json }; return { item: x, first: () => x }; };
  const nodes = {
    'Prepare email': mock({ email: e }),
    'Validate classification': mock({ cls, meta: { fallback: false } })
  };
  const out = mkFn((n) => nodes[n], ordersPayload, policy).json;
  const d = out.decision;
  const [act, tkt, hum, extra = {}] = KEY[e.id];
  const bad = [];
  if (d.action !== act) bad.push('action ' + d.action + ' != ' + act);
  if (d.ticket_required !== tkt) bad.push('ticket ' + d.ticket_required + ' != ' + tkt);
  if (d.needs_human !== hum) bad.push('needs_human ' + d.needs_human + ' != ' + hum + ' [' + d.escalation_reasons + ']');
  if (extra.refund !== undefined && d.refund_amount_inr !== extra.refund) bad.push('refund ' + d.refund_amount_inr + ' != ' + extra.refund);
  if (extra.days !== undefined && d.days_since_delivery !== extra.days) bad.push('days ' + d.days_since_delivery + ' != ' + extra.days);
  if (extra.priority && d.priority !== extra.priority) bad.push('priority ' + d.priority + ' != ' + extra.priority);
  if (extra.lookup && d.order_lookup.method !== extra.lookup) bad.push('lookup ' + d.order_lookup.method);
  if (extra.order && d.order_lookup.order_id !== extra.order) bad.push('order ' + d.order_lookup.order_id);
  if (extra.tier && !d.talking_points.join(' ').includes(policy.delivery_days_after_dispatch[extra.tier])) bad.push('region tier text missing');
  // E07 must never expose the order to the agent. Check values that can ONLY come from the
  // order record (the customer's own words, like "Bridal Glow Kit", are allowed in the email part).
  const recordOnly = ['track.example', 'Lotus', 'Adyar', 'SwiftShip', '2026-11-22', 'meera.iyer', '600020'];
  if (e.id === 'E07' && (out.authorized_order !== null || out.allowed_urls.length || recordOnly.some((v) => out.agent_input.includes(v)))) bad.push('PRIVACY LEAK to agent input');
  // E12: the injected text must not change anything, and the agent input must still carry the real decision
  if (e.id === 'E12' && !d.escalation_reasons.includes('prompt_injection_attempt')) bad.push('injection not flagged');
  if (bad.length) fails++;
  console.log(e.id.padEnd(5), d.action.padEnd(29), String(d.ticket_required).padEnd(5), String(d.needs_human).padEnd(6), String(d.refund_amount_inr || '-').padEnd(7), bad.length ? 'FAIL: ' + bad.join('; ') : 'ok');
}
console.log('\n' + (25 - fails) + '/25 emails decided as the answer key says.');
process.exit(fails ? 1 : 0);
