// Node: "Plan ticket"  (n8n Code node, run once for ALL items)  [v2]
//
// No duplicate tickets: look for an open ticket for the same order. If there is one,
// update it (add this email's ID and a note). Otherwise create a new one.
// Emails are processed one at a time, so two emails cannot race to create the same ticket.
//
// Input : every row of the Tickets tab (from the "Get tickets" node)
// Output: one ticket row for "Write ticket" to upsert on ticket_id

const fin = $('Assemble result').first().json;
const ctx = fin.ctx;
const email = ctx.email;
const orderId = ctx.decision.order_lookup.order_id;
const sender = String(email.from.email).toLowerCase();

const rows = $input.all().map((i) => i.json).filter((r) => r && r.ticket_id);
const open = rows.find((r) => r.order_id === orderId && String(r.status).trim().toLowerCase() !== 'closed');

const rank = { Low: 1, Medium: 2, High: 3 };
const note = '[' + email.id + ' ' + email.received_at + '] ' + ctx.cls.summary +
  ' | action: ' + ctx.decision.action +
  (fin.reasons.length ? ' | needs human: ' + fin.reasons.join(', ') : '');

let mode;
let ticket;
if (open) {
  const ids = String(open.email_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const already = ids.includes(email.id);                 // re-running the same email changes nothing
  mode = already ? 'noop' : 'update';
  const higher = (rank[ctx.decision.priority] || 0) > (rank[open.priority] || 0) ? ctx.decision.priority : open.priority;
  ticket = Object.assign({}, open, {
    updated_at: already ? open.updated_at : email.received_at,
    email_ids: already ? open.email_ids : ids.concat(email.id).join(', '),
    priority: higher,
    notes: already ? open.notes : String(open.notes || '') + '\n' + note
  });
} else {
  mode = 'create';
  const nums = rows.map((r) => parseInt(String(r.ticket_id).replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  ticket = {
    ticket_id: 'TKT-' + String(next).padStart(3, '0'),
    created_at: email.received_at, updated_at: email.received_at,
    order_id: orderId, customer_email: sender, email_ids: email.id,
    intent: ctx.cls.intent, priority: ctx.decision.priority, status: 'Open',
    summary: ctx.cls.summary, notes: note
  };
}

return [{ json: { mode, ticket } }];
