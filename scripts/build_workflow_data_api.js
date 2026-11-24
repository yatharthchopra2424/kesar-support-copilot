#!/usr/bin/env node
/**
 * Builds a small READ-ONLY n8n workflow that returns the Audit Log and Tickets tabs as JSON.
 * Used by eval/score.py and by the Ops Console, so neither needs Google credentials.
 *
 *   GET  <n8n>/webhook/<DATA_PATH>            -> tabs "Audit Log" and "Tickets"   (v2, the final system)
 *   GET  <n8n>/webhook/<DATA_PATH>?v=v1       -> tabs "Audit Log v1" and "Tickets v1"
 *
 * Security notes (also in the README):
 *  - It only reads. It cannot write, send or change anything.
 *  - The data is fictional (the assignment's 25 test emails).
 *  - The path contains a random string so it works as a private link. There is no password.
 *    For real customer data this would need real authentication.
 *
 * Usage: node scripts/build_workflow_data_api.js
 * Output: workflow/kesar-data-api.json
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const SHEET_ID = '1E876dXOmopYZUy0Z4IYtzzmpBYpyTCVpRLBB_K0-VH8';
const SHEETS_CRED = { id: 'lHRcWR7m06r1xfQg', name: 'Google Sheets account' };
const DATA_PATH = 'kesar-data-9d4f2a71c3';

const v1 = "$('Data webhook').first().json.query.v === 'v1'";
const readNode = (id, name, tab, pos) => ({
  parameters: {
    resource: 'sheet', operation: 'read',
    documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
    sheetName: { __rl: true, value: "={{ " + v1 + " ? '" + tab + " v1' : '" + tab + "' }}", mode: 'name' },
    filtersUI: {}, options: {}
  },
  id, name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: pos,
  // executeOnce: the second read would otherwise run once per row coming out of the first.
  credentials: { googleSheetsOAuth2Api: SHEETS_CRED }, alwaysOutputData: true, executeOnce: true
});

const pack = [
  '// Returns every row of both tabs as one JSON object. Empty rows are dropped.',
  "const rows = (name, key) => $(name).all().map((i) => i.json).filter((r) => r && r[key]);",
  'return { json: {',
  "  version: $('Data webhook').first().json.query.v === 'v1' ? 'v1' : 'v2',",
  "  fetched_at: new Date().toISOString(),",
  "  audit: rows('Read Audit Log', 'email_id'),",
  "  tickets: rows('Read Tickets', 'ticket_id')",
  '} };'
].join('\n');

const nodes = [
  { parameters: { httpMethod: 'GET', path: DATA_PATH, responseMode: 'lastNode', options: { allowedOrigins: '*' } },
    id: 'e4000000-0000-4000-8000-000000000001', name: 'Data webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
    webhookId: 'f5000000-0000-4000-8000-000000000001' },
  readNode('e4000000-0000-4000-8000-000000000002', 'Read Audit Log', 'Audit Log', [240, 0]),
  readNode('e4000000-0000-4000-8000-000000000003', 'Read Tickets', 'Tickets', [480, 0]),
  { parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: pack },
    id: 'e4000000-0000-4000-8000-000000000004', name: 'Pack JSON', type: 'n8n-nodes-base.code', typeVersion: 2, position: [720, 0] }
];
const main = (n) => ({ main: [[{ node: n, type: 'main', index: 0 }]] });
const connections = { 'Data webhook': main('Read Audit Log'), 'Read Audit Log': main('Read Tickets'), 'Read Tickets': main('Pack JSON') };

const wf = { name: 'Kesar Support Copilot - read-only data API', nodes, connections, pinData: {}, settings: { executionOrder: 'v1' } };
const out = path.join(ROOT, 'workflow', 'kesar-data-api.json');
fs.writeFileSync(out, JSON.stringify(wf, null, 2) + '\n');
console.log('Wrote ' + path.relative(ROOT, out) + '  path: /webhook/' + DATA_PATH);
