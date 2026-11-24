# Kesar & Co. Support Copilot

Work in progress. This is my submission for the AI Automation Intern take-home: an n8n workflow that classifies support emails with an LLM, looks up orders, drafts replies with an AI agent, creates tickets and logs everything to Google Sheets.

The full README (architecture, setup, decisions, product answers) will replace this file once the build is done.

## Layout

| Folder | What is in it |
|---|---|
| `workflow/` | n8n workflow exports (no secrets) |
| `prompts/` | Classifier and agent prompts |
| `code/` | Code-node logic: eligibility, output guard, FAQ search |
| `config/policy.json` | Policy numbers in one place |
| `eval/` | Answer key and scorer |
| `console/` | Ops Console front end |
| `data/`, `schemas/`, `scripts/` | Provided assignment material |
| `sheet/` | Column headers for the Google Sheet tabs |
