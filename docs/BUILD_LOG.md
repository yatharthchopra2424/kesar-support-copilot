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
