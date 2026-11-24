# Future integrations (not built)

The assignment does not ask for these. They are written down so the places where they would plug in are clear. None of them is in the workflow today.

| Integration | Where it plugs in | What it would do | What to check first |
|---|---|---|---|
| Slack | After "Assemble result", on the branch where `needs_human` is true | Post the email id, intent, the reason from the audit row (`notes`) and a link to the Ops Console trace | The message must not carry order details to a channel that does not need them |
| Jira | After "Plan ticket" | Create or update an issue from the same ticket row. Use the order id as the lookup key so one order is one issue | Keep the Sheet ticket id in a Jira field so the two never drift. Rate limits |
| Zapier | In front of the webhook | A Zap that turns an inbound email (Gmail, a helpdesk) into the same JSON the webhook already takes | The webhook has no password today. Add a shared-secret header before exposing it |
| Real order API | Replace the "Fetch orders" node | Return the same fields from the store's API | The ownership check in "Resolve order and decide" must stay in code |
| Postgres | Replace the two Sheets write nodes and "Get tickets" | Unique constraint on one open ticket per order, which also fixes the concurrency gap in the README | Keep a Sheet export for the support team |
