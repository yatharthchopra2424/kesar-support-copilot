// Node: "Prepare email"  (n8n Code node, run once for each item)  [v2]
//
// Builds the request we send to Gemini for classification and extraction.
// SYSTEM_PROMPT and POLICY are added above this code by scripts/build_workflow_v2.js
// from prompts/classify_v2.md and config/policy.json.

// Model history is in docs/BUILD_LOG.md. "-latest" aliases avoid 404s when Google
// renames models, but they can change under us. The exact model used is logged
// in every Audit Log row.
const MODEL = 'gemini-flash-lite-latest';
const PROMPT_VERSION = 'v2';

const email = $json.body || {};

const missing = [];
if (!email.id) missing.push('id');
if (!email.from || !email.from.email) missing.push('from.email');
if (!email.body) missing.push('body');

const userText =
  'From: ' + (email.from && email.from.name || '') + ' <' + (email.from && email.from.email || '') + '>\n' +
  'Subject: ' + (email.subject || '') + '\n' +
  'Attachments: ' + ((email.attachments || []).join(', ') || 'none') + '\n\n' +
  (email.body || '');

// Smaller schema for Gemini (it rejects "pattern", "maxLength" and type arrays).
// Those rules are checked in the next node.
const intents = ['order_status', 'product_query', 'return_refund', 'complaint', 'other'];
const responseSchema = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: intents },
    secondary_intent: { type: 'STRING', enum: intents, nullable: true },
    order_id: { type: 'STRING', nullable: true },
    sentiment: { type: 'STRING', enum: ['positive', 'neutral', 'negative', 'angry'] },
    language: { type: 'STRING', enum: ['en', 'hi', 'hinglish'] },
    confidence: { type: 'NUMBER' },
    summary: { type: 'STRING' },
    issue_type: { type: 'STRING', enum: ['none', 'change_of_mind', 'not_effective', 'damaged', 'wrong_item', 'missing_item', 'delivery_delay', 'cancellation', 'other'] },
    item_condition: { type: 'STRING', enum: ['unopened', 'opened_or_used', 'unknown'] },
    requested_resolution: { type: 'STRING', enum: ['refund', 'replacement', 'none', 'unspecified'] },
    items_affected: { type: 'ARRAY', items: { type: 'STRING' } },
    customer_location: { type: 'STRING', nullable: true },
    other_type: { type: 'STRING', enum: ['spam', 'partnership', 'thanks', 'invoice_or_billing', 'other_request', 'not_applicable'] },
    medical_question: { type: 'BOOLEAN' },
    instruction_attempt: { type: 'BOOLEAN' }
  },
  required: ['intent', 'secondary_intent', 'order_id', 'sentiment', 'language', 'confidence', 'summary',
             'issue_type', 'item_condition', 'requested_resolution', 'items_affected', 'customer_location',
             'other_type', 'medical_question', 'instruction_attempt']
};

return {
  json: {
    email,
    missing_fields: missing,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    started_at: Date.now(),
    gemini_request: {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema }
    }
  }
};
