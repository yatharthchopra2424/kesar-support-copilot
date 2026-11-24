// Node: "Build audit row"  (n8n Code node, run once for each item)  [v2]
//
// Builds the one Audit Log row for this email. It reads from named nodes, not from
// the previous node, because the previous node can be the Sheets "Write ticket" step.
//
// Input : nothing from the previous node (it is only a trigger)
// Output: { row } for the "Write Audit Log row" node

const fin = $('Assemble result').first().json;
const ctx = fin.ctx;
const email = ctx.email;
const cls = ctx.cls;
const d = ctx.decision;
const meta = ctx.meta || {};

// Ticket id: only exists when "Plan ticket" ran for this email.
let ticketId = '';
let ticketMode = '';
try {
  const t = $('Plan ticket').first().json;
  ticketId = t.ticket.ticket_id;
  ticketMode = t.mode;
} catch (e) { /* no ticket for this email */ }

const prep = $('Prepare email').first().json;
const latency = Date.now() - (prep.started_at || Date.now());
const tokensIn = (meta.tokens_in || 0) + fin.tokens_agent_in_est;
const tokensOut = (meta.tokens_out || 0) + fin.tokens_agent_out_est;

const guardFlags = fin.guard
  ? fin.guard.hard.map((h) => 'HARD:' + h).concat(fin.guard.soft.map((s) => 'soft:' + s), fin.guard.repaired.map((r) => 'fixed:' + r)).join('; ')
  : '';

const notes = [];
notes.push(cls.summary);
if (fin.reasons.length) notes.push('Needs human: ' + fin.reasons.join(', '));
if (ticketMode) notes.push('Ticket ' + ticketId + ' (' + ticketMode + ')');
if (d.refund_amount_inr) notes.push('Refund amount (record only, not approved): INR ' + d.refund_amount_inr);

const row = {
  email_id: email.id,
  received_at: email.received_at,
  from_email: String(email.from.email).toLowerCase(),
  intent: cls.intent,
  secondary_intent: cls.secondary_intent === null ? '' : cls.secondary_intent,
  order_id: d.order_lookup.order_id || (cls.order_id || ''),
  language: cls.language,
  sentiment: cls.sentiment,
  confidence: cls.confidence,
  order_found: d.order_lookup.found ? 'TRUE' : 'FALSE',
  action_taken: d.action,
  needs_human: fin.needs_human ? 'TRUE' : 'FALSE',
  ticket_id: ticketId,
  reply_draft: fin.reply,
  prompt_version: prep.prompt_version,
  processed_at: new Date().toISOString(),
  error: meta.error || '',
  notes: notes.join(' | '),
  model: prep.model,
  tokens_in: tokensIn,
  tokens_out: tokensOut,
  cost_usd: '',
  latency_ms: latency,
  guard_flags: guardFlags,
  // facts_json: everything the code decided. Lets a reviewer check a reply against the facts.
  facts_json: JSON.stringify({
    lookup: d.order_lookup, eligibility: d.eligibility, refund_inr: d.refund_amount_inr,
    refund_method: d.refund_method, days_since_delivery: d.days_since_delivery,
    priority: d.priority, injection: d.injection_detected, reasons: fin.reasons
  }),
  trace_json: JSON.stringify({
    steps: [
      { name: 'classify', model: prep.model, ms: meta.ms, valid_first_try: meta.valid_first_try, fallback: meta.fallback, tokens_in: meta.tokens_in, tokens_out: meta.tokens_out },
      { name: 'decide', action: d.action, lookup: d.order_lookup.method },
      { name: 'agent', tools: fin.tools_used, tokens_in_est: fin.tokens_agent_in_est, tokens_out_est: fin.tokens_agent_out_est, tokens_are_estimates: true },
      { name: 'guard', flags: fin.guard, rejected_draft: fin.original_reply || undefined },
      { name: 'ticket', mode: ticketMode || 'none', id: ticketId }
    ]
  })
};

return { json: { row } };
