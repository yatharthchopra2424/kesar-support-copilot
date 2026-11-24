# Build log

Honest notes on what went wrong while building, and what I did about it. This feeds the "what didn't work" parts of the README and test report.

## 2026-11-24: phase 1 first run

| # | What happened | Cause | What I did |
|---|---|---|---|
| 1 | First E01 run returned 500 | Two separate problems (below) | Read the n8n execution record to find each one, not guess |
| 2 | Gemini 404 on `gemini-2.5-flash` | Model "no longer available to new users" | Tried the replacement the API named |
| 3 | Gemini 503 on `gemini-3.8-flash` and `gemini-flash-latest` | "This model is currently experiencing high demand" (free tier) | Switched to `gemini-flash-lite-latest`: worked first time, 1.25 s, valid JSON |
| 4 | Google Sheets 403 "The caller does not have permission" | The Google account used when connecting n8n is probably not the account that owns the "Kesar Support" Sheet | Fixed later the same day by reconnecting the n8n credential with the Sheet owner's account (see the next section) |

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

## 2026-11-24: v2 first full run (all 25 emails)

v2 is the pipeline with decision code, an agent with two tools, an output guard and ticket planning. I built it before the plain v1 baseline; v1 comes next and will be reported as it actually performs.

**Offline tests first (no LLM):** `eval/test_logic.js` feeds each email's "ideal" classification to the decision code: 25/25 match my answer key. `eval/test_guard.js` covers the guard, ticket create/update/no-op, and the audit row. These test my rules, not model accuracy.

**Live run, issues found and fixed**

| # | What happened | Cause | Fix |
|---|---|---|---|
| 1 | Guard flagged `did_not_call_get_order` on E01 although the reply had the right courier and link | n8n names an agent tool after its node, so the agent called `get_order_tool`, not `get_order` | Renamed the nodes to `get_order` and `search_faq`; guard matches by prefix. This also proved a Code Tool can read `$('Resolve order and decide')` |
| 2 | E19 (correct COD reply) was replaced by the safe holding reply, which broke the expected `needs_human` | My payment-details rule saw "do not share any bank details" and ignored the negation | Rule now accepts a negation or "after the pickup" in the same sentence. Regression test uses the real reply |
| 3 | E07 (correct privacy refusal) was replaced the same way | My privacy rule looked for the words "tracking" and "address", which a good refusal contains | Rule now looks for leaked facts (link, courier, dates, pincode, "was delivered"), not words. The real-leak test still fails as it should |
| 4 | E05 got soft flag `length_0_sentences` | Hinglish greeting was on the same line as the text, so my "drop the first line" removed everything | Strip the greeting with a pattern instead |
| 5 | The send script crashed on E09 | Windows console cannot print the Hindi subject (cp1252). The email was already sent | Run with `PYTHONUTF8=1` |

**Result after fixes (second run of all 25, same Sheet):** 25 audit rows, 9 tickets, 0 duplicates. Every email matches my answer key on action, ticket and `needs_human`. Only soft flags remain: E02 and E16 replies have 2 sentences (brand voice asks for 3 to 6). The second run overwrote the first run's rows, which is the idempotency test. One request of the 25 reported a client-side failure in the send script, but n8n shows all 25 executions as success and every row has a fresh `processed_at`.

**Not verified yet:** model accuracy against a scored answer key (`eval/score.py` still to write), token counts for the agent (estimates only), cost, and the plain v1 baseline.

## 2026-11-24: scorer and data API

- `eval/expected.json` is the answer key as data. The per-email intent, order, ticket and needs_human answers come from the plan I wrote before building. **The `must` / `must_not` reply-content patterns were written after I had seen the v2 replies**, so they are not blind. I note that in TEST_REPORT.
- `scripts/build_workflow_data_api.js` builds a small read-only n8n workflow that returns the Audit Log and Tickets as JSON (`?v=v1` reads the v1 tabs). The scorer and the Ops Console use it. It has no password, only an unguessable path, and the data is fictional.
- Google Drive's file reader only returns the first 8 rows as a "sample", so it cannot be used to export the sheet.
- First score of v2: 2 failures, **both were scorer mistakes**: E15 reply correctly said "keep the exact amount ready" but my key demanded the courier name and the word "change"; E20 matched the harmless "need help with anything else" with a pattern meant for efficacy claims. I fixed both rules and said so here.
- The scorer was checked against deliberately corrupted data (a leak of another customer's tracking link, an "approved" refund, a duplicate row, a duplicate ticket): it failed all four and exited with code 1.
- Real remaining finding: E02 and E16 replies are 2 sentences (soft check, 21/23 before the last run).
