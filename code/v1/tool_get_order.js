// Agent tool: get_order  (n8n "Code Tool" node)  [v1]
//
// ORDERS is added above this code by scripts/build_workflow_v1.js (data/orders.json).
// Plain lookup: by order number if the input has one, otherwise by customer email.
// v1 simply trusts whatever the agent passes in. There is NO check that the person
// writing the email owns the order. That is a known weakness of v1 and is what v2's
// code-side gate fixes.

const text = String(query || '');
const id = text.toUpperCase().match(/KC-\d{4}/);
const mail = text.toLowerCase().match(/[a-z0-9._+-]+@[a-z0-9.-]+/);

let found = null;
if (id) found = ORDERS.orders.find((o) => o.order_id === id[0]);
else if (mail) found = ORDERS.orders.find((o) => o.customer_email.toLowerCase() === mail[0]);

return found ? JSON.stringify(found) : JSON.stringify({ error: 'order not found' });
