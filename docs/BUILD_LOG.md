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

## 2026-11-24: v1 baseline, run once on all 25 emails

**Disclosure:** I built v2 first and v1 second, on purpose, so v1 is a plain baseline and not something I tuned until it looked bad. v1 was run once on all 25 emails (the brief asks for 10 or more) and not changed between runs. It uses the same Gemini model, temperature 0, and the same Sheet in separate tabs (`Audit Log v1`, `Tickets v1`).

**What v1 is:** a simple classification prompt, then an agent with `get_order` (looks up by order number or email, trusts whatever the agent passes, no ownership check) and `search_faq` (returns the whole FAQ), a plain system prompt, a ticket whenever the intent is return_refund or complaint and an order number was found (one open ticket per order), `needs_human` only on classifier failure or confidence below 0.75, and no output guard.

**Scores against the same answer key** (`eval/results/v1_score.md`, `v2_score.md`; raw rows in `v1_run.json`, `v2_run.json`):

| Check | v1 | v2 |
|---|---|---|
| Intent correct | 24/25 | 25/25 |
| needs_human correct | 14/25 | 25/25 |
| Exact sign-off ("Warm regards,\nTeam Kesar") | 3/23 | 23/23 |
| No emoji, at most one "!" | 12/23 | 23/23 |
| Ticket decision correct | 25/25 | 25/25 |
| Duplicate open tickets | 0 | 0 |
| Reply avoids forbidden content | 30/35 | 35/35 |
| Every link from the sender's own order | 4/5 | 4/4 |

**What v1 got wrong, in my own words**
- **E07 privacy leak (the worst one).** The sender (arjun.nair) is not the owner of KC-1046. v1's reply gave the courier, the tracking link and the full delivery address of someone else's order. The tool had no ownership check and the prompt did not say to refuse. v2 stops this in code, before the agent sees any order data.
- **E13 invented a process.** For a GST invoice request v1 offered to "update the invoice with your company GSTIN" and share an updated invoice. The FAQ says nothing about invoices. It should have been escalated.
- **needs_human missed 11 of 25.** v1 never escalated the leak, the invoice, the missing item (E23), the unknown order (E22), the angry customer (E08) or the medical question (E20), because confidence was high for all of them (see the Phase 1 note that confidence is not informative).
- **Brand voice ignored:** sign-off wrong in 20 of 23 replies, exclamation marks and emoji in 11.
- **E03 gave no refund amount** (the agent never called `get_order`); E17 (partnership) got no reply at all because the agent returned NO_REPLY; E25 (a thank-you note) got a reply; E08 was classified `return_refund` (the answer key says `complaint`, a judgment call).
- **E10:** v1 found the right order by email inside the agent but left `order_id` empty in the log, so the log does not show which order was used.

**What v1 did well:** valid structured output 25/25; the ticket rule worked and E04 and E21 shared one ticket (no duplicates); E12 correctly declined the return and was not moved by the injected text; E20's reply made no medical claim. v1's ticket priority was Medium for the two denials (answer key: Low).

**Scorer notes:** the "action name" check does not apply to v1 (different names) and is skipped automatically. I fixed the link and amount checks so they only accept facts from orders the sender owns; before that, v1's correct E10 link looked wrong and E07's leaked link would have looked right. v2's scores did not change.
