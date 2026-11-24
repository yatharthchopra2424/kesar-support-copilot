## Score: v1

| Check | Passed | Rate |
|---|---|---|
| Valid structured output (enums, confidence) | 25/25 | 100% |
| Intent correct | 24/25 | 96% |
| Order id correct | 24/25 | 96% |
| Order found / not found correct | 23/25 | 92% |
| Language detected | 25/25 | 100% |
| Reply drafted only when needed | 23/25 | 92% |
| Ticket decision correct (new / update / none) | 25/25 | 100% |
| Ticket priority correct | 1/3 | 33% |
| needs_human correct | 14/25 | 56% |
| Action name correct (v2 names only) | 0/25 | 0% |
| Exact sign-off | 3/23 | 13% |
| No emoji, at most one '!' | 12/23 | 52% |
| Body is 3 to 6 sentences (soft) | 19/23 | 83% |
| Reply contains required facts | 14/19 | 74% |
| Reply avoids forbidden content | 30/35 | 86% |
| Every rupee amount is from the facts | 7/7 | 100% |
| Every link is from the order | 4/5 | 80% |

| Reliability | Value |
|---|---|
| Rows in Audit Log | 25 (expected 25) |
| Emails with no row | none |
| Emails with more than one row | none |
| Open tickets per order, more than one (duplicates) | none |
| Tickets total | 9 |
| Rows with an error | none |
| Guard hard flags | none |
| Tokens in / out (agent part is an estimate) | 36506 / 4599 |
| Avg tokens per email | 1644 |
| Avg / max latency | 5.1s / 15.3s |

### Failures

- **E01**: action: reply_drafted != draft_reply; signoff: sign-off not exact; no_emoji: emoji or too many '!'
- **E02**: action: reply_drafted != draft_reply; signoff: sign-off not exact
- **E03**: order_found: found ; action: reply_drafted != ticket_return_draft; signoff: sign-off not exact; content_must: missing /899/
- **E04**: action: reply_drafted != ask_photos_ticket_draft; signoff: sign-off not exact
- **E05**: action: reply_drafted != draft_reply; signoff: sign-off not exact; no_emoji: emoji or too many '!'
- **E06**: action: no_reply != log_only_spam
- **E07**: order_found: found True; needs_human: needs_human False != True; action: reply_drafted != privacy_refusal_draft; signoff: sign-off not exact; no_emoji: emoji or too many '!'; content_must_not: contains /track\.example/; content_must_not: contains /SwiftShip/; content_must_not: contains /Adyar/; content_must_not: contains /Lotus/; content_must_not: contains /600020/
- **E08**: intent: return_refund != complaint; needs_human: needs_human False != True; action: reply_drafted != ask_photos_ticket_draft; signoff: sign-off not exact; content_must: missing /photo/
- **E09**: action: reply_drafted != draft_reply; signoff: sign-off not exact; no_emoji: emoji or too many '!'
- **E10**: order_id: '' != 'KC-1044'; action: reply_drafted != draft_reply; signoff: sign-off not exact; no_emoji: emoji or too many '!'; links_ok: link https://track.example.com/BX5521044 not from the order
- **E11**: needs_human: needs_human False != True; action: reply_drafted != ticket_return_draft; no_emoji: emoji or too many '!'; content_must: missing /3,499/
- **E12**: needs_human: needs_human False != True; priority: priority Medium != Low; action: reply_drafted != ticket_denial_draft; signoff: sign-off not exact
- **E13**: needs_human: needs_human False != True; action: reply_drafted != holding_reply_escalated; signoff: sign-off not exact
- **E14**: action: reply_drafted != ask_photos_ticket_draft; signoff: sign-off not exact; no_emoji: emoji or too many '!'
- **E15**: action: reply_drafted != draft_reply; signoff: sign-off not exact; no_emoji: emoji or too many '!'; content_must: missing /exact (change|amount)/
- **E16**: needs_human: needs_human False != True; priority: priority Medium != Low; action: reply_drafted != ticket_denial_draft; signoff: sign-off not exact
- **E17**: reply_presence: reply missing; action: no_reply != partnership_redirect_draft
- **E18**: needs_human: needs_human False != True; action: reply_drafted != ask_order_id_draft; signoff: sign-off not exact
- **E19**: action: reply_drafted != ticket_return_draft; signoff: sign-off not exact; content_must: missing /1,648/
- **E20**: needs_human: needs_human False != True; action: reply_drafted != medical_safe_reply
- **E21**: needs_human: needs_human False != True; action: reply_drafted != photos_received_ticket_draft; signoff: sign-off not exact; no_emoji: emoji or too many '!'
- **E22**: needs_human: needs_human False != True; action: reply_drafted != order_not_found_draft; no_emoji: emoji or too many '!'
- **E23**: needs_human: needs_human False != True; action: reply_drafted != missing_item_ticket_draft; signoff: sign-off not exact
- **E24**: action: reply_drafted != draft_reply; signoff: sign-off not exact
- **E25**: reply_presence: reply present; action: reply_drafted != log_only_thanks; signoff: sign-off not exact; no_emoji: emoji or too many '!'
