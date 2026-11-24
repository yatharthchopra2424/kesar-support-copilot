#!/usr/bin/env node
/**
 * Tests the three "after the agent" Code nodes without calling any LLM:
 *   output_guard.js   - does it catch bad drafts and repair small ones?
 *   plan_ticket.js    - create vs update vs no-op (no duplicate tickets)?
 *   assemble_result.js + build_audit_row.js - does the audit row come out complete?
 *
 * The "agent output" is hand-written below: some good, some deliberately bad.
 * Usage: node eval/test_guard.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const load = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const emails = JSON.parse(load('data/test_emails.json')).emails;
const orders = JSON.parse(load('data/orders.json'));
const policy = JSON.parse(load('config/policy.json'));
const resolveSrc = load('code/v2/resolve_order.js');
const guardSrc = load('code/v2/output_guard.js');
const assembleSrc = 'const AGENT_PROMPT_CHARS = 2956;\n' + load('code/v2/assemble_result.js');
const planSrc = load('code/v2/plan_ticket.js');
const rowSrc = load('code/v2/build_audit_row.js');

const mock = (json) => { const x = { json }; return { item: x, first: () => x, all: () => [x] }; };
const base = { intent: 'other', secondary_intent: null, order_id: null, sentiment: 'neutral', language: 'en', confidence: 0.9, summary: 'test summary', issue_type: 'none', item_condition: 'unknown', requested_resolution: 'none', items_affected: [], customer_location: null, other_type: 'not_applicable', medical_question: false, instruction_attempt: false };
const run = (src, nodes, $json, $input) => new Function('$', '$json', '$input', 'POLICY', src)((n) => nodes[n], $json, $input, policy);

function decide(id, cls) {
  const e = emails.find((x) => x.id === id);
  const nodes = { 'Prepare email': mock({ email: e, model: 'm', prompt_version: 'v2', started_at: Date.now() }), 'Validate classification': mock({ cls: Object.assign({}, base, cls), meta: { fallback: false, tokens_in: 370, tokens_out: 80, ms: 900, valid_first_try: true } }) };
  const ctx = run(resolveSrc, nodes, orders).json;
  nodes['Resolve order and decide'] = mock(ctx);
  return { nodes, ctx };
}
let fails = 0;
const check = (label, ok, extra) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  ' + (extra || ''))); };
const guard = (nodes, replyObj) => run(guardSrc, nodes, { output: typeof replyObj === 'string' ? replyObj : JSON.stringify(replyObj), intermediateSteps: [{ action: { tool: 'get_order' }, observation: '{}' }] }).json;
const SIGN = '\n\nWarm regards,\nTeam Kesar';

// ---- guard ----
const a = decide('E01', { intent: 'order_status', order_id: 'KC-1041' });
const good = guard(a.nodes, { reply: 'Hi Ananya,\n\nYour order KC-1041 is on its way. It was shipped with the courier listed in your order. You can follow it with the tracking link we sent. We will keep you updated.' + SIGN, grounded: true });
check('good reply passes with no hard flags', good.guard.hard.length === 0, JSON.stringify(good.guard));
check('sign-off is exact', good.reply.endsWith('Warm regards,\nTeam Kesar'));

const emoji = guard(a.nodes, { reply: 'Hi Ananya,\n\nYour order is on its way 😊. Thank you for your patience! Great! Really! Truly.' + SIGN, grounded: true });
check('emoji removed, extra exclamations limited', emoji.guard.repaired.includes('emoji_removed') && (emoji.reply.match(/!/g) || []).length <= 1, JSON.stringify(emoji.guard));

const badAmt = guard(a.nodes, { reply: 'Hi Ananya,\n\nWe will refund ₹9,999 to you. It goes back soon. Thank you for waiting.' + SIGN, grounded: true });
check('invented amount is a hard flag and replaced', badAmt.guard.hard.some((h) => h.startsWith('amount_not_in_facts')) && /passed your message to our team/.test(badAmt.reply), JSON.stringify(badAmt.guard));

const med = guard(a.nodes, { reply: 'Hi Ananya,\n\nOur serum cures acne and treats eczema well. You will see results fast. Thank you.' + SIGN, grounded: true });
check('medical claim is a hard flag', med.guard.hard.includes('medical_claim'), JSON.stringify(med.guard));
const medNeg = guard(a.nodes, { reply: 'Hi Ananya,\n\nOur products are cosmetics and do not treat or cure any condition. Please ask your doctor about skin concerns. Thank you for asking.' + SIGN, grounded: true });
check('negated "do not treat or cure" is allowed', !medNeg.guard.hard.includes('medical_claim'), JSON.stringify(medNeg.guard));

const link = guard(a.nodes, { reply: 'Hi Ananya,\n\nTrack it at https://evil.example/track?id=1 please. It should arrive soon. Thank you.' + SIGN, grounded: true });
check('foreign link is a hard flag', link.guard.hard.includes('url_not_allowed'), JSON.stringify(link.guard));

const promise = guard(a.nodes, { reply: 'Hi Ananya,\n\nYour refund is approved and will be credited tomorrow. Thank you. We are sorry.' + SIGN, grounded: true });
check('"approved / will be credited" is a hard flag', promise.guard.hard.includes('unapproved_refund_promise'), JSON.stringify(promise.guard));

const e07 = decide('E07', { intent: 'order_status', order_id: 'KC-1046' });
const leak = guard(e07.nodes, { reply: 'Hi Rohan,\n\nThe order was delivered to Adyar yesterday. Tracking is on the way. Thank you for writing in.' + SIGN, grounded: true });
check('E07 privacy leak is a hard flag', leak.guard.hard.includes('privacy_leak'), JSON.stringify(leak.guard));

// Regression: real replies from the first live run that an over-strict guard rejected wrongly.
const e19 = decide('E19', { intent: 'return_refund', order_id: 'KC-1050', issue_type: 'change_of_mind', item_condition: 'unopened', requested_resolution: 'refund', items_affected: ['Kumkumadi oil', 'aloe gel'] });
const okCod = guard(e19.nodes, { reply: 'Hi Farhan,\n\nYes, your return request for order KC-1050 is within our 7-day window since it was delivered 3 days ago, and can proceed as long as both items remain unopened with the seal intact. We will arrange a free reverse pickup for you within 2 to 3 business days. Once the pickup is completed, a team member will contact you to confirm the return process and ask for your UPI or bank details to process the refund of ₹1,648 (shipping and COD fees are not refunded). Please do not share any bank details at this stage. A team member will follow up shortly to confirm everything for you.' + SIGN, grounded: true });
check('E19 COD reply ("do not share bank details now", UPI only after pickup) is NOT flagged', !okCod.guard.hard.length, JSON.stringify(okCod.guard));
const earlyAsk = guard(e19.nodes, { reply: 'Hi Farhan,\n\nYour return is within the window. Please send your UPI id and bank details so we can process the refund of ₹1,648. A team member will confirm. Thank you.' + SIGN, grounded: true });
check('asking for UPI before pickup IS still flagged', earlyAsk.guard.hard.includes('asks_payment_details_early'), JSON.stringify(earlyAsk.guard));
const goodRefusal = guard(e07.nodes, { reply: 'Hi Arjun,\n\nFor privacy and security reasons, we can only discuss order details with the email address used to place the order. We cannot share or confirm any information regarding the status, tracking, or delivery address for this order. Please ask the account holder to write to us from that email address. Thank you for understanding.' + SIGN, grounded: true });
check('E07 refusal that names "tracking / address" without leaking facts is NOT flagged', !goodRefusal.guard.hard.length, JSON.stringify(goodRefusal.guard));
const hinglish = guard(a.nodes, { reply: 'Hi Priya, aapka order KC-1043 ship ho chuka hai aur iska estimated delivery date 23 November 2026 hai. Aap apna shipment yahan track kar sakte hain. Kyunki ye ek estimated date hai, ye thoda aage pichhe bhi ho sakta hai. Agar aapko koi aur madad chahiye toh batayiyega.' + SIGN, grounded: true });
check('greeting on the same line as the text still counts sentences (no length_0)', !hinglish.guard.soft.some((x) => /^length_0/.test(x)), JSON.stringify(hinglish.guard));

const notJson = guard(a.nodes, 'Hi Ananya,\n\nYour order is on its way. It ships with SwiftShip. We will update you. Thank you.');
check('plain text (not JSON) is accepted but noted', notJson.guard.soft.includes('agent_output_not_json'));
const empty = run(guardSrc, a.nodes, {}).json;
check('agent failure (no output) becomes a safe reply', empty.guard.hard.includes('empty_reply') && /passed your message to our team/.test(empty.reply));

// ---- plan ticket + audit row: E03 then a second email on the same order ----
// E04 and E21 are two emails about the same order (KC-1052) from the same customer.
const t1 = decide('E04', { intent: 'return_refund', order_id: 'KC-1052', sentiment: 'negative', issue_type: 'damaged', requested_resolution: 'unspecified', items_affected: ['Ubtan Face Pack'] });
t1.nodes['Output guard'] = mock(guard(t1.nodes, { reply: 'Hi there,\n\nWe are sorry the pack arrived damaged. Please reply with a photo of the item and the outer packaging. A team member will review it and follow up within 24 business hours.' + SIGN, grounded: true }));
t1.nodes['Assemble result'] = mock(run(assembleSrc, t1.nodes, {}).json);
const empty0 = [{ json: {} }];
const p1 = run(planSrc, t1.nodes, null, { all: () => empty0 })[0].json;
check('first ticket for the order is created as TKT-001', p1.mode === 'create' && p1.ticket.ticket_id === 'TKT-001', JSON.stringify(p1));
check('ticket has only template columns', Object.keys(p1.ticket).every((k) => ['ticket_id', 'created_at', 'updated_at', 'order_id', 'customer_email', 'email_ids', 'intent', 'priority', 'status', 'summary', 'notes'].includes(k)), Object.keys(p1.ticket).join());
const existing = [{ json: Object.assign({}, p1.ticket) }];
const again = run(planSrc, t1.nodes, null, { all: () => existing })[0].json;
check('same email again is a no-op (idempotent)', again.mode === 'noop' && again.ticket.notes === p1.ticket.notes, again.mode);

const t2 = decide('E21', { intent: 'return_refund', order_id: 'KC-1052', issue_type: 'damaged', requested_resolution: 'replacement', items_affected: ['Ubtan jar'] });
t2.nodes['Assemble result'] = mock(run(assembleSrc, t2.nodes, {}).json);
const upd = run(planSrc, t2.nodes, null, { all: () => existing })[0].json;
check('a different email on the same order UPDATES the open ticket (no duplicate)', upd.mode === 'update' && upd.ticket.ticket_id === 'TKT-001' && /E04/.test(upd.ticket.email_ids) && /E21/.test(upd.ticket.email_ids), JSON.stringify(upd));

t1.nodes['Plan ticket'] = mock(p1);
const row = run(rowSrc, t1.nodes, null).json.row;
const cols = ['email_id', 'received_at', 'from_email', 'intent', 'secondary_intent', 'order_id', 'language', 'sentiment', 'confidence', 'order_found', 'action_taken', 'needs_human', 'ticket_id', 'reply_draft', 'prompt_version', 'processed_at', 'error', 'notes', 'model', 'tokens_in', 'tokens_out', 'cost_usd', 'latency_ms', 'guard_flags', 'facts_json', 'trace_json'];
check('audit row has every column', cols.every((c) => c in row), cols.filter((c) => !(c in row)).join());
check('audit row links the ticket and the reply', row.ticket_id === 'TKT-001' && row.reply_draft.endsWith('Team Kesar') && row.order_found === 'TRUE', JSON.stringify({ t: row.ticket_id, f: row.order_found }));
check('trace_json and facts_json parse', !!JSON.parse(row.trace_json) && !!JSON.parse(row.facts_json));

console.log('\n' + (fails ? fails + ' check(s) failed.' : 'All guard, ticket and audit-row checks passed.'));
process.exit(fails ? 1 : 0);
