## Score: v2

| Check | Passed | Rate |
|---|---|---|
| Valid structured output (enums, confidence) | 25/25 | 100% |
| Intent correct | 25/25 | 100% |
| Order id correct | 25/25 | 100% |
| Order found / not found correct | 25/25 | 100% |
| Language detected | 25/25 | 100% |
| Reply drafted only when needed | 25/25 | 100% |
| Ticket decision correct (new / update / none) | 25/25 | 100% |
| Ticket priority correct | 3/3 | 100% |
| needs_human correct | 25/25 | 100% |
| Action name correct (only for runs that use v2 action names) | 25/25 | 100% |
| Exact sign-off | 23/23 | 100% |
| No emoji, at most one '!' | 23/23 | 100% |
| Body is 3 to 6 sentences (soft) | 21/23 | 91% |
| Reply contains required facts | 20/20 | 100% |
| Reply avoids forbidden content | 35/35 | 100% |
| Every rupee amount is from the facts | 9/9 | 100% |
| Every link is from the order | 4/4 | 100% |

| Reliability | Value |
|---|---|
| Rows in Audit Log | 25 (expected 25) |
| Emails with no row | none |
| Emails with more than one row | none |
| Open tickets per order, more than one (duplicates) | none |
| Tickets total | 9 |
| Rows with an error | none |
| Guard hard flags | none |
| Tokens in / out (agent part is an estimate) | 49938 / 6694 |
| Avg tokens per email | 2265 |
| Avg / max latency | 4.6s / 8.2s |

No failures against the answer key.
