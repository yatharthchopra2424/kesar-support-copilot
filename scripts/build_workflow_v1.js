#!/usr/bin/env node
/**
 * Builds the v1 (baseline) n8n workflow JSON.
 *
 * v1 is the plain first attempt, kept so the v1 vs v2 comparison is real:
 *   classify (simple prompt) -> agent with 2 tools (plain prompt) -> ticket if intent says so -> audit row
 * No decision code, no privacy gate, no output guard. It writes to the tabs
 * "Audit Log v1" and "Tickets v1" so it never touches the final v2 results.
 *
 *   prompts/classify_v1.md  -> SYSTEM_PROMPT in "Prepare email"
 *   prompts/agent_v1.md     -> system message of the agent
 *   code/prepare_email.js, code/validate_classification.js -> the Phase 1 nodes (reused)
 *   code/v1/*.js            -> the v1 nodes and tools
 *
 * Usage: node scripts/build_workflow_v1.js      Output: workflow/kesar-copilot-v1.json
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
const classifyPrompt = read('prompts/classify_v1.md').trim();
const agentPrompt = read('prompts/agent_v1.md').trim();
const orders = JSON.parse(read('data/orders.json'));
const faqText = read('data/faq.md').replace(/\r\n/g, '\n');

const auditCols = ['email_id', 'received_at', 'from_email', 'intent', 'secondary_intent', 'order_id', 'language', 'sentiment', 'confidence', 'order_found', 'action_taken', 'needs_human', 'ticket_id', 'reply_draft', 'prompt_version', 'processed_at', 'error', 'notes', 'model', 'tokens_in', 'tokens_out', 'cost_usd', 'latency_ms', 'guard_flags', 'facts_json', 'trace_json'];
const ticketCols = ['ticket_id', 'created_at', 'updated_at', 'order_id', 'customer_email', 'email_ids', 'intent', 'priority', 'status', 'summary', 'notes'];
const mapping = (cols, prefix) => Object.fromEntries(cols.map((c) => [c, '={{ $json.' + prefix + c + ' }}']));
const schema = (cols, key) => cols.map((c) => ({ id: c, displayName: c, required: false, defaultMatch: c === key, display: true, type: 'string', canBeUsedToMatch: true }));
const sheetNode = (id, name, tab, cols, key, prefix, pos) => ({
  parameters: { resource: 'sheet', operation: 'appendOrUpdate', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: tab, mode: 'name' },
    columns: { mappingMode: 'defineBelow', value: mapping(cols, prefix), matchingColumns: [key], schema: schema(cols, key) }, options: {} },
  id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: pos, credentials: { googleSheetsOAuth2Api: SHEETS_CRED }
});
const code = (id, name, js, pos, mode) => ({ parameters: { mode: mode || 'runOnceForEachItem', language: 'javaScript', jsCode: js }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos });
const U = (n) => 'a6000000-0000-4000-8000-0000000000' + String(n).padStart(2, '0');
const ifNode = (id, name, expr, pos) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: id + '-c', leftValue: '={{ ' + expr + ' }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos
});

const nodes = [
  { parameters: { httpMethod: 'POST', path: 'kesar-support-email-v1', responseMode: 'lastNode', options: { allowedOrigins: '*' } },
    id: U(1), name: 'Email webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 200], webhookId: 'b7000000-0000-4000-8000-000000000001' },
  code(U(2), 'Prepare email', 'const SYSTEM_PROMPT = ' + JSON.stringify(classifyPrompt) + ';\n' + POLICY + read('code/prepare_email.js'), [220, 200]),
  { parameters: { method: 'POST', url: '=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.model }}:generateContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.gemini_request) }}', options: { timeout: 60000 } },
    id: U(3), name: 'Gemini classify', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 200], credentials: { googlePalmApi: GEMINI_CRED }, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueRegularOutput' },
  code(U(4), 'Validate classification', POLICY + read('code/validate_classification.js'), [660, 200]),
  code(U(5), 'Build agent input', read('code/v1/build_agent_input.js'), [880, 200]),
  { parameters: { promptType: 'define', text: '={{ $json.agent_input }}', hasOutputParser: false, options: { systemMessage: agentPrompt, maxIterations: 5, returnIntermediateSteps: true } },
    id: U(6), name: 'Reply agent', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 1.7, position: [1100, 200], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput' },
  { parameters: { modelName: AGENT_MODEL, options: { temperature: 0 } }, id: U(7), name: 'Gemini model', type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', typeVersion: 1, position: [1040, 440], credentials: { googlePalmApi: GEMINI_CRED } },
  { parameters: { name: 'get_order', description: 'Look up an order. Input: an order number like KC-1041, or the customer email address.', language: 'javaScript', jsCode: 'const ORDERS = ' + JSON.stringify(orders) + ';\n\n' + read('code/v1/tool_get_order.js') },
    id: U(8), name: 'get_order', type: '@n8n/n8n-nodes-langchain.toolCode', typeVersion: 1.3, position: [1180, 440] },
  { parameters: { name: 'search_faq', description: 'Company FAQ: shipping, returns, refunds, COD, cancellation, products and safety. Input: your question.', language: 'javaScript', jsCode: 'const FAQ_TEXT = ' + JSON.stringify(faqText) + ';\n\n' + read('code/v1/tool_search_faq.js') },
    id: U(9), name: 'search_faq', type: '@n8n/n8n-nodes-langchain.toolCode', typeVersion: 1.3, position: [1320, 440] },
  code(U(10), 'Decide', 'const AGENT_PROMPT_CHARS = ' + agentPrompt.length + ';\n' + POLICY + read('code/v1/decide.js'), [1420, 200]),
  ifNode(U(11), 'Ticket needed?', '$json.ticket_needed', [1640, 200]),
  { parameters: { resource: 'sheet', operation: 'read', documentId: { __rl: true, value: SHEET_ID, mode: 'id' }, sheetName: { __rl: true, value: 'Tickets v1', mode: 'name' }, filtersUI: {}, options: {} },
    id: U(12), name: 'Get tickets', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: [1860, 100], credentials: { googleSheetsOAuth2Api: SHEETS_CRED }, alwaysOutputData: true },
  code(U(13), 'Plan ticket', read('code/v1/plan_ticket.js'), [2080, 100], 'runOnceForAllItems'),
  sheetNode(U(14), 'Write ticket', 'Tickets v1', ticketCols, 'ticket_id', 'ticket.', [2300, 100]),
  code(U(15), 'Build audit row', read('code/v1/build_audit_row.js'), [2520, 200]),
  sheetNode(U(16), 'Write Audit Log v1 row', 'Audit Log v1', auditCols, 'email_id', 'row.', [2740, 200])
];
const main = (to) => ({ node: to, type: 'main', index: 0 });
const ai = (type) => ({ [type]: [[{ node: 'Reply agent', type, index: 0 }]] });
const connections = {
  'Email webhook': { main: [[main('Prepare email')]] },
  'Prepare email': { main: [[main('Gemini classify')]] },
  'Gemini classify': { main: [[main('Validate classification')]] },
  'Validate classification': { main: [[main('Build agent input')]] },
  'Build agent input': { main: [[main('Reply agent')]] },
  'Reply agent': { main: [[main('Decide')]] },
  'Gemini model': ai('ai_languageModel'), get_order: ai('ai_tool'), search_faq: ai('ai_tool'),
  Decide: { main: [[main('Ticket needed?')]] },
  'Ticket needed?': { main: [[main('Get tickets')], [main('Build audit row')]] },
  'Get tickets': { main: [[main('Plan ticket')]] },
  'Plan ticket': { main: [[main('Write ticket')]] },
  'Write ticket': { main: [[main('Build audit row')]] },
  'Build audit row': { main: [[main('Write Audit Log v1 row')]] }
};
const wf = { name: 'Kesar Support Copilot - v1 baseline (plain prompt, no guards)', nodes, connections, pinData: {}, settings: { executionOrder: 'v1' } };
const out = path.join(ROOT, 'workflow', 'kesar-copilot-v1.json');
fs.writeFileSync(out, JSON.stringify(wf, null, 2) + '\n');
console.log('Wrote ' + path.relative(ROOT, out) + ' (' + nodes.length + ' nodes)');
