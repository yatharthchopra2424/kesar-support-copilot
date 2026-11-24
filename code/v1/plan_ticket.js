// Node: "Plan ticket"  (n8n Code node, run once for ALL items)  [v1]
//
// One open ticket per order: update it if there is one, otherwise create a new one.
// Same idea as v2, with simpler rules: priority is High for an angry customer, else Medium,
// and an update never changes the priority.
//
// Input : every row of the "Tickets v1" tab
// Output: one ticket row for "Write ticket" to upsert on ticket_id

const d = $('Decide').first().json;
const row = d.row;
const email = $('Prepare email').first().json.email;

const rows = $input.all().map((i) => i.json).filter((r) => r && r.ticket_id);
const open = rows.find((r) => r.order_id === row.order_id && String(r.status).trim().toLowerCase() !== 'closed');
const note = '[' + email.id + ' ' + email.received_at + '] ' + row.notes;

let mode;
let ticket;
if (open) {
  const ids = String(open.email_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const already = ids.includes(email.id);
  mode = already ? 'noop' : 'update';
  ticket = Object.assign({}, open, already ? {} : {
    updated_at: email.received_at, email_ids: ids.concat(email.id).join(', '), notes: String(open.notes || '') + '\n' + note
  });
} else {
  mode = 'create';
  const nums = rows.map((r) => parseInt(String(r.ticket_id).replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  ticket = {
    ticket_id: 'TKT-' + String((nums.length ? Math.max.apply(null, nums) : 0) + 1).padStart(3, '0'),
    created_at: email.received_at, updated_at: email.received_at,
    order_id: row.order_id, customer_email: String(email.from.email).toLowerCase(), email_ids: email.id,
    intent: row.intent, priority: row.sentiment === 'angry' ? 'High' : 'Medium', status: 'Open',
    summary: row.notes, notes: note
  };
}
return [{ json: { mode, ticket } }];
