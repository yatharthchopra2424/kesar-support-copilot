// Agent tool: get_order  (n8n "Code Tool" node)  [v2]
//
// The agent passes an order number as `query`. This tool does NOT search the order
// database itself. It returns only the order that the code in "Resolve order and decide"
// already authorised for this sender (ID match or email match, owner checked).
// Any other order number, or an unauthorised sender, gets an error. So even if an email
// talks the agent into asking for someone else's order, there is nothing to hand over.
//
// Returns a JSON string. The authorised order never contains the customer's email or address.

const ctx = $('Resolve order and decide').first().json;
const wanted = String(query || '').toUpperCase().match(/KC-\d{4}/);
const ok = ctx.authorized_order && wanted && wanted[0] === ctx.authorized_order.order_id;

if (!ok) {
  return JSON.stringify({ error: 'No order details can be shared for this request. Tell the customer a team member will follow up within 24 business hours.' });
}
return JSON.stringify(ctx.authorized_order);
