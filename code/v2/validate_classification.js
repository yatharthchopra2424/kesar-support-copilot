// Node: "Validate classification"  (n8n Code node, run once for each item)  [v2]
//
// Checks the model's answer against schemas/llm_output.schema.json (the required
// fields) plus the extra extraction fields. It never throws. If the required
// fields are wrong the email falls back to intent "other" and needs a human.
// If only an extra field is wrong, it gets a safe default and the issue is noted.

const INTENTS = ['order_status', 'product_query', 'return_refund', 'complaint', 'other'];
const SENTIMENTS = ['positive', 'neutral', 'negative', 'angry'];
const LANGUAGES = ['en', 'hi', 'hinglish'];
const ISSUE = ['none', 'change_of_mind', 'not_effective', 'damaged', 'wrong_item', 'missing_item', 'delivery_delay', 'cancellation', 'other'];
const CONDITION = ['unopened', 'opened_or_used', 'unknown'];
const RESOLUTION = ['refund', 'replacement', 'none', 'unspecified'];
const OTHER = ['spam', 'partnership', 'thanks', 'invoice_or_billing', 'other_request', 'not_applicable'];

const prep = $('Prepare email').first().json;
const resp = $input.item.json;
const usage = resp.usageMetadata || {};

// Required fields (from the assignment schema). Returns a list of problems.
function checkCore(o) {
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

let cls = null;
let error = '';
let validFirstTry = false;
const notes = [];

try {
  if (prep.missing_fields && prep.missing_fields.length) throw new Error('payload missing: ' + prep.missing_fields.join(', '));
  if (resp.error) throw new Error('LLM call failed: ' + String(resp.error.message || JSON.stringify(resp.error)).slice(0, 200));
  const text = resp.candidates && resp.candidates[0] && resp.candidates[0].content &&
    resp.candidates[0].content.parts && resp.candidates[0].content.parts[0].text;
  if (!text) throw new Error('empty model response');

  const parsed = JSON.parse(text);
  const problems = checkCore(parsed);
  validFirstTry = problems.length === 0;

  if (problems.length === 1 && problems[0] === 'summary over 200 chars') {
    parsed.summary = parsed.summary.slice(0, 197) + '...';
    notes.push('summary shortened');
  } else if (problems.length) {
    throw new Error('invalid output: ' + problems.join('; '));
  }

  // Extra fields: a bad value gets a safe default, and we note it.
  const fix = (k, ok, dflt) => { if (!ok(parsed[k])) { notes.push('defaulted ' + k); parsed[k] = dflt; } };
  fix('issue_type', (v) => ISSUE.includes(v), 'other');
  fix('item_condition', (v) => CONDITION.includes(v), 'unknown');
  fix('requested_resolution', (v) => RESOLUTION.includes(v), 'unspecified');
  fix('items_affected', (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'), []);
  fix('customer_location', (v) => v === null || typeof v === 'string', null);
  fix('other_type', (v) => OTHER.includes(v), 'not_applicable');
  fix('medical_question', (v) => typeof v === 'boolean', false);
  fix('instruction_attempt', (v) => typeof v === 'boolean', false);
  cls = parsed;
} catch (e) {
  error = String(e.message || e).slice(0, 300);
}

const fallback = cls === null;
if (fallback) {
  cls = {
    intent: 'other', secondary_intent: null, order_id: null, sentiment: 'neutral', language: 'en',
    confidence: 0, summary: 'Classification failed, needs manual review.',
    issue_type: 'other', item_condition: 'unknown', requested_resolution: 'unspecified',
    items_affected: [], customer_location: null, other_type: 'other_request',
    medical_question: false, instruction_attempt: false
  };
}

return {
  json: {
    cls,
    meta: {
      fallback,
      error: error || (notes.length ? 'repaired: ' + notes.join(', ') : ''),
      valid_first_try: validFirstTry,
      model: prep.model,
      tokens_in: usage.promptTokenCount || 0,
      tokens_out: usage.candidatesTokenCount || 0,
      ms: Date.now() - (prep.started_at || Date.now())
    }
  }
};
