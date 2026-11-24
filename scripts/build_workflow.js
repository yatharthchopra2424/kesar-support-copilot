#!/usr/bin/env node
/**
 * Builds the n8n workflow JSON from the readable files in this repo, so nobody
 * has to edit a big JSON blob by hand.
 *
 *   prompts/classify_v1.md      -> SYSTEM_PROMPT inside the "Prepare email" node
 *   config/policy.json          -> POLICY inside both Code nodes
 *   code/prepare_email.js       -> "Prepare email" node
 *   code/validate_classification.js -> "Validate classification" node
 *
 * Usage: node scripts/build_workflow.js
 * Output: workflow/kesar-copilot-phase1.json  (contains NO secrets, only a credential id)
 *
 * Credentials are referenced by id and name only (never the secret itself).
 * On a different n8n instance the ids will not match: after importing, open the
 * "Gemini classify" and "Write Audit Log row" nodes and pick your own credentials.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SHEET_ID = '1E876dXOmopYZUy0Z4IYtzzmpBYpyTCVpRLBB_K0-VH8';
const SHEETS_CRED = { id: 'lHRcWR7m06r1xfQg', name: 'Google Sheets account' };
const GEMINI_CRED = { id: 'FDRhs4FC81VjM9Q9', name: 'Google Gemini(PaLM) Api account' };

const systemPrompt = read('prompts/classify_v1.md').trim();
const policy = JSON.parse(read('config/policy.json'));
delete policy._comment;
delete policy._sources;

const header =
  'const SYSTEM_PROMPT = ' + JSON.stringify(systemPrompt) + ';\n' +
  'const POLICY = ' + JSON.stringify(policy) + ';\n\n';

// Audit Log columns, in sheet order (template columns first, then my extras).
const auditCols = [
  'email_id', 'received_at', 'from_email', 'intent', 'secondary_intent', 'order_id',
  'language', 'sentiment', 'confidence', 'order_found', 'action_taken', 'needs_human',
  'ticket_id', 'reply_draft', 'prompt_version', 'processed_at', 'error', 'notes',
  'model', 'tokens_in', 'tokens_out', 'cost_usd', 'latency_ms', 'guard_flags',
  'facts_json', 'trace_json'
];

const sheetsValue = {};
for (const c of auditCols) sheetsValue[c] = '={{ $json.row.' + c + ' }}';

const nodes = [
  {
    parameters: {
      httpMethod: 'POST',
      path: 'kesar-support-email',
      responseMode: 'lastNode',
      options: {}
    },
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Email webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 0],
    webhookId: 'b2000000-0000-4000-8000-000000000001'
  },
  {
    parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: header + read('code/prepare_email.js') },
    id: 'a1000000-0000-4000-8000-000000000002',
    name: 'Prepare email',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [240, 0]
  },
  {
    parameters: {
      method: 'POST',
      url: '=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.model }}:generateContent',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googlePalmApi',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.gemini_request) }}',
      options: { timeout: 60000 }
    },
    id: 'a1000000-0000-4000-8000-000000000003',
    name: 'Gemini classify',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [480, 0],
    credentials: { googlePalmApi: GEMINI_CRED },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    onError: 'continueRegularOutput'
  },
  {
    parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: 'const POLICY = ' + JSON.stringify(policy) + ';\n\n' + read('code/validate_classification.js') },
    id: 'a1000000-0000-4000-8000-000000000004',
    name: 'Validate classification',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [720, 0]
  },
  {
    parameters: {
      resource: 'sheet',
      operation: 'appendOrUpdate',
      documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
      sheetName: { __rl: true, value: 'Audit Log', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: sheetsValue,
        matchingColumns: ['email_id'],
        schema: auditCols.map((c) => ({
          id: c, displayName: c, required: false, defaultMatch: c === 'email_id',
          display: true, type: 'string', canBeUsedToMatch: true
        }))
      },
      options: {}
    },
    id: 'a1000000-0000-4000-8000-000000000005',
    name: 'Write Audit Log row',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [960, 0],
    credentials: { googleSheetsOAuth2Api: SHEETS_CRED }
  }
];

const link = (from, to) => ({ [from]: { main: [[{ node: to, type: 'main', index: 0 }]] } });
const connections = Object.assign(
  {},
  link('Email webhook', 'Prepare email'),
  link('Prepare email', 'Gemini classify'),
  link('Gemini classify', 'Validate classification'),
  link('Validate classification', 'Write Audit Log row')
);

const workflow = {
  name: 'Kesar Support Copilot - Phase 1 (classify and log)',
  nodes,
  connections,
  pinData: {},
  settings: { executionOrder: 'v1' }
};

const out = path.join(ROOT, 'workflow', 'kesar-copilot-phase1.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote ' + path.relative(ROOT, out) + ' (' + nodes.length + ' nodes)');
