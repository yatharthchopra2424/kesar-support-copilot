# Ops Console

A static site that shows what the copilot did with each of the 25 test emails. It reads the same data the Google Sheet holds, so nothing here is made up for the screen.

| Page | What it shows |
|---|---|
| Inbox | The 25 emails, the intent, what the copilot did, and whether a person must look |
| Trace | One email, step by step: classify (LLM), order lookup, eligibility, decision, reply draft (LLM), output guard, ticket, audit row. Each step says whether the LLM or plain code decided |
| Tickets | Tickets by priority. TKT-002 shows two emails (E04, E21) sharing one ticket |
| Audit log | The full audit table with reply drafts, filters and a CSV download |
| Evals | v1 and v2 scored by `eval/score.py` against the answer key, email by email |
| Cost | Measured tokens per email, with price and volume as inputs you can change |
| Policy | Change the return window, high-value limit or confidence threshold and see which emails would move |

Use the v2 / v1 switch in the side rail to flip Inbox, Trace, Tickets and Audit between the final workflow and the baseline.

## Where the data comes from

1. The page loads the saved run bundled in `src/data` (instant, works offline).
2. It then asks the read-only data API in n8n for fresh rows (`src/config.ts`). If that fails, a banner says so and the snapshot stays.

The data API only serves the fictional test data and has no password, so nothing secret is in the browser.

## Run it

```powershell
cd console
npm install
npm run dev      # http://localhost:5173
npm run build    # static files in dist/
```

Refresh the bundled data from the saved runs and re-score them (needs Python 3):

```powershell
npm run sync
```

## Notes

- Token numbers for the reply agent are estimates (characters / 4). Classification tokens are measured.
- The Policy page re-applies three numeric rules to stored facts. It does not re-run the workflow.
- `damage_report_window_hours` is in `config/policy.json` but the code uses a fixed 2 days, so the Policy page cannot change it yet.

## Deploy

Served from Cloudflare Workers static assets (free plan), no server code:

```powershell
cd console
npm run build
$env:CLOUDFLARE_ACCOUNT_ID = "<your account id>"; npx wrangler deploy
```

Live: https://kesar-ops-console.yc9891966.workers.dev
