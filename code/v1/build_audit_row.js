// Node: "Build audit row"  (n8n Code node, run once for each item)  [v1]
//
// Takes the row the classifier already built and fills in what v1 knows: the action,
// the reply, needs_human, the ticket id and the token estimate.

const d = $('Decide').first().json;
const row = Object.assign({}, d.row);

let ticketId = '';
let ticketMode = '';
try { const t = $('Plan ticket').first().json; ticketId = t.ticket.ticket_id; ticketMode = t.mode; } catch (e) { /* no ticket */ }

const prep = $('Prepare email').first().json;
row.action_taken = d.action;
row.order_found = d.order_found === null ? '' : (d.order_found ? 'TRUE' : 'FALSE');
row.needs_human = d.needs_human ? 'TRUE' : 'FALSE';
row.ticket_id = ticketId;
row.reply_draft = d.reply;
row.processed_at = new Date().toISOString();
row.tokens_in = (Number(row.tokens_in) || 0) + d.tokens_agent_in_est;
row.tokens_out = (Number(row.tokens_out) || 0) + d.tokens_agent_out_est;
row.latency_ms = Date.now() - (prep.started_at || Date.now());
row.notes = row.notes + (d.reasons.length ? ' | Needs human: ' + d.reasons.join(', ') : '') + (ticketMode ? ' | Ticket ' + ticketId + ' (' + ticketMode + ')' : '');
row.guard_flags = '';
row.facts_json = '';
row.trace_json = JSON.stringify({ steps: [
  { name: 'classify', model: prep.model, tokens_in: JSON.parse(row.trace_json || '{"steps":[{}]}').steps[0].tokens_in },
  { name: 'agent', tools: d.tools_used, tokens_in_est: d.tokens_agent_in_est, tokens_out_est: d.tokens_agent_out_est, tokens_are_estimates: true },
  { name: 'ticket', mode: ticketMode || 'none', id: ticketId }
] });

return { json: { row } };
