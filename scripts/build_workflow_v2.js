#!/usr/bin/env node
/**
 * Builds the v2 n8n workflow JSON from the readable files in this repo.
 *
 *   prompts/classify_v2.md        -> SYSTEM_PROMPT in "Prepare email"
 *   prompts/agent_v2.md           -> system message of the AI Agent
 *   config/policy.json            -> POLICY in the Code nodes that need it
 *   data/orders.json              -> the "Fetch orders" node (stands in for the store's order API)
 *   data/faq.md                   -> FAQ sections inside the search_faq tool
 *   code/v2/*.js                  -> one Code node (or tool) each
 *
 * Usage: node scripts/build_workflow_v2.js
 * Output: workflow/kesar-copilot-v2.json  (no secrets, credentials by id and name only)
 *
 * After importing on a different n8n instance, open "Gemini classify", the "Gemini model"
 * node and the three Google Sheets nodes and pick your own credentials.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SHEET_ID = '1E876dXOmopYZUy0Z4IYtzzmpBYpyTCVpRLBB_K0-VH8';
const SHEETS_CRED = { id: 'lHRcWR7m06r1xfQg', name: 'Google Sheets account' };
const GEMINI_CRED = { id: 'FDRhs4FC81VjM9Q9', name: 'Google Gemini(PaLM) Api account' };
const AGENT_MODEL = 'models/gemini-flash-lite-latest';

const policy = JSON.parse(read('config/policy.json'));
delete policy._comment; delete policy._sources;
const POLICY = 'const POLICY = ' + JSON.stringify(policy) + ';\n\n';

const classifyPrompt = read('prompts/classify_v2.md').trim();
const agentPrompt = read('prompts/agent_v2.md').trim();
const orders = JSON.parse(read('data/orders.json'));

// FAQ: split "## 1. Title" sections
const faqText = read('data/faq.md').replace(/\r\n/g, '\n');
const FAQ = [];
faqText.split(/^## /m).slice(1).forEach((block) => {
  const m = block.match(/^(\d+)\.\s*(.+?)\n([\s\S]*)$/);
  if (m) FAQ.push({ n: Number(m[1]), title: m[2].trim(), text: m[3].replace(/\n---\s*$/, '').trim() });
});
if (FAQ.length !== 9) throw new Error('expected 9 FAQ sections, found ' + FAQ.length);

const auditCols = [
  'email_id', 'received_at', 'from_email', 'intent', 'secondary_intent', 'order_id',
  'language', 'sentiment', 'confidence', 'order_found', 'action_taken', 'needs_human',
  'ticket_id', 'reply_draft', 'prompt_version', 'processed_at', 'error', 'notes',
  'model', 'tokens_in', 'tokens_out', 'cost_usd', 'latency_ms', 'guard_flags',
  'facts_json', 'trace_json'
];
const ticketCols = ['ticket_id', 'created_at', 'updated_at', 'order_id', 'customer_email', 'email_ids', 'intent', 'priority', 'status', 'summary', 'notes'];

const mapping = (cols, prefix) => Object.fromEntries(cols.map((c) => [c, '={{ $json.' + prefix + c + ' }}']));
const schema = (cols, key) => cols.map((c) => ({ id: c, displayName: c, required: false, defaultMatch: c === key, display: true, type: 'string', canBeUsedToMatch: true }));
const sheetNode = (id, name, tab, cols, key, prefix, pos, extra) => Object.assign({
  parameters: {
    resource: 'sheet', operation: 'appendOrUpdate',
    documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
    sheetName: { __rl: true, value: tab, mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: mapping(cols, prefix), matchingColumns: [key], schema: schema(cols, key) },
    options: {}
  },
  id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: pos,
  credentials: { googleSheetsOAuth2Api: SHEETS_CRED }
}, extra || {});

const code = (id, name, js, pos, mode) => ({
  parameters: { mode: mode || 'runOnceForEachItem', language: 'javaScript', jsCode: js },
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos
});
const U = (n) => 'c2000000-0000-4000-8000-0000000000' + String(n).padStart(2, '0');
const ifNode = (id, name, expr, pos) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: id + '-c', leftValue: '={{ ' + expr + ' }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and'
    },
    options: {}
  },
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos
});

const nodes = [
  { parameters: { httpMethod: 'POST', path: 'kesar-support-email-v2', responseMode: 'lastNode', options: {} },
    id: U(1), name: 'Email webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 200], webhookId: 'd3000000-0000-4000-8000-000000000001' },
  code(U(2), 'Prepare email', 'const SYSTEM_PROMPT = ' + JSON.stringify(classifyPrompt) + ';\n' + POLICY + read('code/v2/prepare_email.js'), [220, 200]),
  { parameters: {
      method: 'POST',
      url: '=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.model }}:generateContent',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.gemini_request) }}', options: { timeout: 60000 } },
    id: U(3), name: 'Gemini classify', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 200],
    credentials: { googlePalmApi: GEMINI_CRED }, retryOnFail: true, maxTries: 4, waitBetweenTries: 5000, onError: 'continueRegularOutput' },
  code(U(4), 'Validate classification', POLICY + read('code/v2/validate_classification.js'), [660, 200]),
  code(U(5), 'Fetch orders', '// Stands in for the store\'s order API. The data is data/orders.json (fictional).\nconst ORDERS = ' + JSON.stringify(orders) + ';\nreturn { json: ORDERS };', [880, 200]),
  code(U(6), 'Resolve order and decide', POLICY + read('code/v2/resolve_order.js'), [1100, 200]),
  ifNode(U(7), 'Needs reply?', '$json.decision.reply_required', [1320, 200]),
  { parameters: {
      promptType: 'define', text: '={{ $json.agent_input }}', hasOutputParser: false,
      options: { systemMessage: agentPrompt, maxIterations: 5, returnIntermediateSteps: true } },
    id: U(8), name: 'Reply agent', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 1.7, position: [1540, 100],
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput' },
  { parameters: { modelName: AGENT_MODEL, options: { temperature: 0 } },
    id: U(9), name: 'Gemini model', type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', typeVersion: 1, position: [1480, 340],
    credentials: { googlePalmApi: GEMINI_CRED } },
  { parameters: { name: 'get_order', description: 'Get the details of the customer\'s order (status, courier, tracking link, dates, items, amounts). Input: the order number, for example KC-1041. Only works for the order named in the DECISION block.', language: 'javaScript', jsCode: read('code/v2/tool_get_order.js') },
    id: U(10), name: 'get_order tool', type: '@n8n/n8n-nodes-langchain.toolCode', typeVersion: 1.3, position: [1620, 340] },
  { parameters: { name: 'search_faq', description: 'Search the Kesar & Co. FAQ for shipping, returns, refunds, COD, cancellation, product and safety policy. Input: a short question or keywords. Returns the matching FAQ sections, or NOT COVERED.', language: 'javaScript', jsCode: 'const FAQ = ' + JSON.stringify(FAQ) + ';\n\n' + read('code/v2/tool_search_faq.js') },
    id: U(11), name: 'search_faq tool', type: '@n8n/n8n-nodes-langchain.toolCode', typeVersion: 1.3, position: [1760, 340] },
  code(U(12), 'Output guard', read('code/v2/output_guard.js'), [1800, 100]),
  code(U(13), 'Assemble result', 'const AGENT_PROMPT_CHARS = ' + agentPrompt.length + ';\n\n' + read('code/v2/assemble_result.js'), [2020, 200]),
  ifNode(U(14), 'Ticket needed?', '$json.ctx.decision.ticket_required', [2240, 200]),
  { parameters: { resource: 'sheet', operation: 'read', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: 'Tickets', mode: 'name' }, filtersUI: {}, options: {} },
    id: U(15), name: 'Get tickets', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: [2460, 100],
    credentials: { googleSheetsOAuth2Api: SHEETS_CRED }, alwaysOutputData: true },
  code(U(16), 'Plan ticket', read('code/v2/plan_ticket.js'), [2680, 100], 'runOnceForAllItems'),
  sheetNode(U(17), 'Write ticket', 'Tickets', ticketCols, 'ticket_id', 'ticket.', [2900, 100]),
  code(U(18), 'Build audit row', read('code/v2/build_audit_row.js'), [3120, 200]),
  sheetNode(U(19), 'Write Audit Log row', 'Audit Log', auditCols, 'email_id', 'row.', [3340, 200])
];

const main = (to, idx) => ({ node: to, type: 'main', index: idx || 0 });
const connections = {
  'Email webhook': { main: [[main('Prepare email')]] },
  'Prepare email': { main: [[main('Gemini classify')]] },
  'Gemini classify': { main: [[main('Validate classification')]] },
  'Validate classification': { main: [[main('Fetch orders')]] },
  'Fetch orders': { main: [[main('Resolve order and decide')]] },
  'Resolve order and decide': { main: [[main('Needs reply?')]] },
  'Needs reply?': { main: [[main('Reply agent')], [main('Assemble result')]] },
  'Reply agent': { main: [[main('Output guard')]] },
  'Output guard': { main: [[main('Assemble result')]] },
  'Gemini model': { ai_languageModel: [[{ node: 'Reply agent', type: 'ai_languageModel', index: 0 }]] },
  'get_order tool': { ai_tool: [[{ node: 'Reply agent', type: 'ai_tool', index: 0 }]] },
  'search_faq tool': { ai_tool: [[{ node: 'Reply agent', type: 'ai_tool', index: 0 }]] },
  'Assemble result': { main: [[main('Ticket needed?')]] },
  'Ticket needed?': { main: [[main('Get tickets')], [main('Build audit row')]] },
  'Get tickets': { main: [[main('Plan ticket')]] },
  'Plan ticket': { main: [[main('Write ticket')]] },
  'Write ticket': { main: [[main('Build audit row')]] },
  'Build audit row': { main: [[main('Write Audit Log row')]] }
};

const workflow = { name: 'Kesar Support Copilot - v2 (agent, guard, tickets)', nodes, connections, pinData: {}, settings: { executionOrder: 'v1' } };
const out = path.join(ROOT, 'workflow', 'kesar-copilot-v2.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote ' + path.relative(ROOT, out) + ' (' + nodes.length + ' nodes, FAQ sections: ' + FAQ.length + ', agent prompt chars: ' + agentPrompt.length + ')');
