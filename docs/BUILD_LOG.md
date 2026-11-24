# Build log

Honest notes on what went wrong while building, and what I did about it. This feeds the "what didn't work" parts of the README and test report.

## 2026-11-24: phase 1 first run

| # | What happened | Cause | What I did |
|---|---|---|---|
| 1 | First E01 run returned 500 | Two separate problems (below) | Read the n8n execution record to find each one, not guess |
| 2 | Gemini 404 on `gemini-2.5-flash` | Model "no longer available to new users" | Tried the replacement the API named |
| 3 | Gemini 503 on `gemini-3.8-flash` and `gemini-flash-latest` | "This model is currently experiencing high demand" (free tier) | Switched to `gemini-flash-lite-latest`: worked first time, 1.25 s, valid JSON |
| 4 | Google Sheets 403 "The caller does not have permission" | The Google account used when connecting n8n is probably not the account that owns the "Kesar Support" Sheet | Not fixed yet. Needs the n8n credential reconnected with the Sheet owner's account, or the Sheet shared with the account n8n uses |

What worked as designed: when the Gemini call failed, the validator fell back to `intent: other`, `needs_human: TRUE` and wrote the reason into the `error` column instead of crashing. The 500 only came from the Sheets step.

What I would do about the 503s in production: retry with longer backoff and fall back to a second model or provider. n8n's built-in retry only waits a few seconds, which is not enough for a demand spike.

First valid result (E01, `gemini-flash-lite-latest`, which resolved to `gemini-3.5-flash-lite`): `order_status`, `KC-1041`, confidence 1.0, 367 tokens in, 85 out. Confidence 1.0 is a reminder that self-reported confidence is not calibrated, which is why escalation rules do not rely on it alone.

## 2026-11-24: phase 1 first successful run (E01 to E04)

Sheets 403 fixed by reconnecting the n8n Google Sheets credential with the account that owns the Sheet. After that, E01 to E04 went through the production webhook (4/4 returned 200) and I read the rows back from the Sheet itself.

| Email | Expected (my answer key) | Got | Match |
|---|---|---|---|
| E01 | order_status, KC-1041 | order_status, KC-1041 | yes |
| E02 | product_query, no order | product_query, no order id | yes |
| E03 | return_refund, KC-1047 | return_refund, KC-1047 | yes |
| E04 | return_refund, KC-1052 (complaint as secondary) | return_refund, KC-1052, secondary empty | yes on intent |

- Intent: 4/4. Valid JSON on first try: 4/4. Latency 0.7 to 1.1 s per classification, 367 to 382 tokens in, 68 to 91 out.
- **No duplicates:** re-sending E01 updated its row (new `processed_at`, different token count) and the table stayed at 4 rows. This is the upsert on `email_id`.
- **Confidence is not informative:** it came back 1, 1, 1, 0.99. A model that says 1.0 for nearly everything cannot be the main escalation signal. Rules decide escalation; confidence stays as a backstop.
- **Phase 1 is classification only.** `order_found`, tickets, reply drafts and real actions are empty on purpose. `needs_human` is FALSE for all four only because nothing else has been built yet, not because the answer is right for E04 (no photos, so it should ask for them).
- Output is not fully deterministic even at temperature 0: E01's `tokens_out` was 75 on one run and 91 on the next.
