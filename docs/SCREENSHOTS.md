# Screenshots for submission

The submission needs three named files in `screenshots/` (see the brief's `docs/SUBMISSION.md`). Anything with a `_draft` prefix is a working copy and is not committed.

| File | What it must show | When it can be taken | Status |
|---|---|---|---|
| `workflow.png` | The **full workflow canvas** in n8n, all branches visible | After the v2 workflow is finished | Draft only (`_draft_workflow_phase1.jpg`, 5 nodes) |
| `audit_log.png` | The **Audit Log** tab with **all 25 rows** (one per email) | After all 25 emails ran | Not possible yet |
| `tickets.png` | The **Tickets** tab with the tickets created, including E21 updating E04's ticket | After all 25 emails ran | Not possible yet |

## Extra shots I will also take (not required, they help the README and video)

- n8n **Executions** list after the 25-email run (shows no manual fixes)
- One execution opened to show the node-by-node data for E12 (the injection) and E07 (the privacy refusal)
- The Sheet's `needs_human` filter view
- `eval/results` scorer output for v1 and v2

## Rules for the final shots

- Take them **after** the last full run, not before. A screenshot of an old run would not match the README.
- The Audit Log screenshot must show **25 rows** with no gaps. If the sheet is taller than the screen, take it in two parts or zoom out.
- No keys, tokens or personal account email visible. Crop or avoid the account menu.
- Save as **PNG**. The browser tool saves JPEG, so convert (do not just rename the extension).
- Open the Sheet link in an incognito window before submitting to check that "Anyone with the link can view" works.
