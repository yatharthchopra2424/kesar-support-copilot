// Node: "Prepare email"  (n8n Code node, run once for each item)
//
// Takes the webhook payload (one email, exactly as in data/test_emails.json)
// and builds the request we send to Gemini.
//
// SYSTEM_PROMPT and POLICY are added above this code by scripts/build_workflow.js,
// from prompts/classify_v1.md and config/policy.json. Edit those files, not the
// workflow JSON.

// Model history on 2026-11-24 (see docs/BUILD_LOG.md):
//   gemini-2.5-flash      -> 404, no longer available to new users
//   gemini-3.8-flash      -> 503, high demand on the free tier
//   gemini-flash-latest   -> 503, same
//   gemini-flash-lite-latest -> works (resolved to gemini-3.5-flash-lite)
// "-latest" aliases avoid 404s when Google renames models, but they can change
// under us. The exact model used is stored in every Audit Log row ("model").
const MODEL = 'gemini-flash-lite-latest';
const PROMPT_VERSION = 'v1';

const email = $json.body || {};

// Basic shape check. A broken payload should be logged, not crash the flow.
const missing = [];
if (!email.id) missing.push('id');
if (!email.from || !email.from.email) missing.push('from.email');
if (!email.body) missing.push('body');

// The model only sees the text of the email.
const userText =
  'From: ' + (email.from && email.from.name || '') + ' <' + (email.from && email.from.email || '') + '>\n' +
  'Subject: ' + (email.subject || '') + '\n' +
  'Attachments: ' + ((email.attachments || []).join(', ') || 'none') + '\n\n' +
  (email.body || '');

// Smaller schema for Gemini. Gemini does not accept "pattern", "maxLength" or
// type arrays, so those rules are checked in the next node instead.
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
    summary: { type: 'STRING' }
  },
  required: ['intent', 'secondary_intent', 'order_id', 'sentiment', 'language', 'confidence', 'summary']
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
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema
      }
    }
  }
};
