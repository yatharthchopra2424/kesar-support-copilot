// Node: "Validate classification"  (n8n Code node, run once for each item)
//
// Checks the model's answer against schemas/llm_output.schema.json and builds
// the Audit Log row. It never throws: if anything is wrong the email falls back
// to intent "other" with needs_human = TRUE, and the reason goes in "error".
//
// POLICY is added above this code by scripts/build_workflow.js (config/policy.json).

const INTENTS = ['order_status', 'product_query', 'return_refund', 'complaint', 'other'];
const SENTIMENTS = ['positive', 'neutral', 'negative', 'angry'];
const LANGUAGES = ['en', 'hi', 'hinglish'];

const prep = $('Prepare email').item.json;
const email = prep.email || {};
const resp = $input.item.json;
const usage = resp.usageMetadata || {};

// Returns a list of problems. An empty list means the output is valid.
function check(o) {
  const p = [];
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return ['not a JSON object'];
  for (const k of ['intent', 'secondary_intent', 'order_id', 'sentiment', 'language', 'confidence', 'summary']) {
    if (!(k in o)) p.push('missing ' + k);
  }
  if (!INTENTS.includes(o.intent)) p.push('bad intent');
  if (o.secondary_intent !== null && !INTENTS.includes(o.secondary_intent)) p.push('bad secondary_intent');
  if (o.order_id !== null && !/^KC-[0-9]{4}$/.test(String(o.order_id))) p.push('bad order_id');
  if (!SENTIMENTS.includes(o.sentiment)) p.push('bad sentiment');
  if (!LANGUAGES.includes(o.language)) p.push('bad language');
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) p.push('bad confidence');
  if (typeof o.summary !== 'string') p.push('bad summary');
  else if (o.summary.length > 200) p.push('summary over 200 chars');
  return p;
}

let result = null;
let error = '';
let validFirstTry = false;

try {
  if (prep.missing_fields && prep.missing_fields.length) {
    throw new Error('payload missing: ' + prep.missing_fields.join(', '));
  }
  if (resp.error) {
    throw new Error('LLM call failed: ' + String(resp.error.message || JSON.stringify(resp.error)).slice(0, 200));
  }
  const text = resp.candidates && resp.candidates[0] && resp.candidates[0].content &&
    resp.candidates[0].content.parts && resp.candidates[0].content.parts[0].text;
  if (!text) throw new Error('empty model response');

  const parsed = JSON.parse(text);
  const problems = check(parsed);
  validFirstTry = problems.length === 0;

  // One cheap repair we can do safely: cut a too-long summary.
  if (problems.length === 1 && problems[0] === 'summary over 200 chars') {
    parsed.summary = parsed.summary.slice(0, 197) + '...';
    error = 'repaired: summary shortened';
  } else if (problems.length) {
    throw new Error('invalid output: ' + problems.join('; '));
  }
  result = parsed;
} catch (e) {
  error = String(e.message || e).slice(0, 300);
}

const fallback = result === null;
if (fallback) {
  result = {
    intent: 'other', secondary_intent: null, order_id: null, sentiment: 'neutral',
    language: 'en', confidence: 0, summary: 'Classification failed, needs manual review.'
  };
}

const needsHuman = fallback || result.confidence < POLICY.confidence_threshold;
const latency = Date.now() - (prep.started_at || Date.now());

const row = {
  email_id: email.id || '',
  received_at: email.received_at || '',
  from_email: (email.from && email.from.email) || '',
  intent: result.intent,
  secondary_intent: result.secondary_intent === null ? '' : result.secondary_intent,
  order_id: result.order_id === null ? '' : result.order_id,
  language: result.language,
  sentiment: result.sentiment,
  confidence: result.confidence,
  order_found: '',
  action_taken: fallback ? 'fallback_needs_human' : 'classified_only',
  needs_human: needsHuman ? 'TRUE' : 'FALSE',
  ticket_id: '',
  reply_draft: '',
  prompt_version: prep.prompt_version,
  processed_at: new Date().toISOString(),
  error: error,
  notes: result.summary,
  model: prep.model,
  tokens_in: usage.promptTokenCount || '',
  tokens_out: usage.candidatesTokenCount || '',
  cost_usd: '',
  latency_ms: latency,
  guard_flags: '',
  facts_json: '',
  trace_json: JSON.stringify({
    steps: [{ name: 'classify', model: prep.model, ms: latency, valid_first_try: validFirstTry,
              tokens_in: usage.promptTokenCount || 0, tokens_out: usage.candidatesTokenCount || 0 }]
  })
};

return { json: { row } };
