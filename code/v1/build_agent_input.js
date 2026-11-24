// Node: "Build agent input"  (n8n Code node, run once for each item)  [v1]
//
// v1 hands the agent the raw email plus the classification. Nothing else:
// no decision, no facts, no rules. The agent works it all out itself.

const email = $('Prepare email').first().json.email || {};
const row = $input.item.json.row;

const text = [
  'From: ' + ((email.from && email.from.name) || '') + ' <' + ((email.from && email.from.email) || '') + '>',
  'Subject: ' + (email.subject || ''),
  'Attachments: ' + ((email.attachments || []).join(', ') || 'none'),
  '',
  email.body || '',
  '',
  '(Automatic classification: intent ' + row.intent + ', order ' + (row.order_id || 'none') + ', sentiment ' + row.sentiment + ', language ' + row.language + ')'
].join('\n');

return { json: { agent_input: text } };
