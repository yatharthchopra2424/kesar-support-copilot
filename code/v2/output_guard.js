// Node: "Output guard"  (n8n Code node, run once for each item)  [v2]
//
// Checks the agent's draft reply BEFORE it is stored. The prompt asks the agent to
// behave, but a prompt can be talked out of things, so these rules are code.
//
//  - Repairs (safe, automatic): strip emojis, limit exclamation marks, fix the sign-off.
//  - Soft flags: noted in the audit log, no escalation (for example reply length).
//  - Hard flags: a rule that protects the customer or the company was broken. The
//    draft is replaced by a safe holding reply and the email goes to a human.
//
// Input : $json = the agent output ({ output, intermediateSteps })
// Output: reply, grounded, guard flags, tools used

const ctx = $('Resolve order and decide').first().json;
const d = ctx.decision;
const raw = $json.output !== undefined ? $json.output : '';
const steps = Array.isArray($json.intermediateSteps) ? $json.intermediateSteps : [];

const hard = [];
const soft = [];
const repaired = [];

// ---- 1. read the agent's JSON answer ----
let reply = '';
let grounded = true;
try {
  const cleaned = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const obj = JSON.parse(cleaned);
  reply = String(obj.reply || '');
  grounded = obj.grounded !== false;
} catch (e) {
  reply = String(raw);
  soft.push('agent_output_not_json');
}
if (!reply.trim()) { hard.push('empty_reply'); }

// ---- 2. safe repairs ----
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}️]/gu;
if (EMOJI.test(reply)) { reply = reply.replace(EMOJI, ''); repaired.push('emoji_removed'); }
const SIGN = 'Warm regards,\nTeam Kesar';
reply = reply.replace(/\s*(warm regards|regards|best regards|sincerely|thanks)[,!.]?\s*(\n\s*)?(team kesar|kesar & co\.?|kesar team)?\s*$/i, '').trim();
reply = reply + '\n\n' + SIGN;
const bang = (reply.match(/!/g) || []).length;
if (bang > 1) { let n = 0; reply = reply.replace(/!/g, () => (++n === 1 ? '!' : '.')); repaired.push('exclamations_limited'); }

// ---- 3. checks ----
// Body = reply without the greeting ("Hi Name," on its own line or in front of the text) and the sign-off.
const body = reply.replace(SIGN, '').replace(/^\s*(hi|hello|dear|namaste|नमस्ते)\b[^,\n।]{0,40}[,।]\s*/i, '').trim();
const sentences = body.split(/(?<=[.!?।])\s+/).filter((s) => s.trim().length > 2);
if (sentences.length < 3 || sentences.length > 6) soft.push('length_' + sentences.length + '_sentences');
if (/\b[A-Z]{5,}\b/.test(body.replace(/KC-\d+|UPI|IFSC|COD|OTP|CVV/g, ''))) soft.push('all_caps_word');
if (d.order_lookup.found && d.action === 'draft_reply' && ctx.cls.intent === 'order_status' && !steps.some((s) => s.action && String(s.action.tool).indexOf('get_order') === 0)) soft.push('did_not_call_get_order');

// medical claims: any cure/treat word that is not negated shortly before it
const MED = /\b(cure|cures|cured|curing|treat|treats|treated|treating|heal|heals|healed|remedy|therapy)\b/gi;
let m;
while ((m = MED.exec(reply)) !== null) {
  const before = reply.slice(Math.max(0, m.index - 45), m.index);
  if (!/(not|cannot|can't|isn't|aren't|never|n't|without|no)\b[^.]{0,40}$/i.test(before)) { hard.push('medical_claim'); break; }
}

// amounts must come from the facts
const AMT = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/gi;
while ((m = AMT.exec(reply)) !== null) {
  const v = Math.round(parseFloat(m[1].replace(/,/g, '')));
  if (!ctx.allowed_amounts.includes(v)) { hard.push('amount_not_in_facts:' + v); }
}

// links must be the order's own tracking link or our own domain
const URL_RE = /https?:\/\/[^\s)>\]"']+/gi;
while ((m = URL_RE.exec(reply)) !== null) {
  const u = m[0].replace(/[.,;]+$/, '');
  if (!ctx.allowed_urls.includes(u) && !/kesarandco\.example/i.test(u)) hard.push('url_not_allowed');
}

// never promise approval or payment
if (/\b(approved|will be credited|has been credited|has been refunded|within 24 hours)\b/i.test(reply)) hard.push('unapproved_refund_promise');

// never ask for payment details early, and never ask for secrets
for (const s of sentences) {
  // A sentence is fine if it says NOT to share details, or says we will ask only after the pickup.
  const negated = /\b(do not|don't|dont|no need|not need|never|won't|will not)\b/i.test(s);
  const afterPickup = /\b(after|once|following|when)\b[^.]{0,60}\bpick/i.test(s);
  if (/(share|send|provide|give|reply with|let us know|need|ask).{0,40}\b(UPI|account number|IFSC|bank details)/i.test(s) && !negated && !afterPickup) { hard.push('asks_payment_details_early'); break; }
  if (/(share|send|provide|enter|tell).{0,30}\b(OTP|PIN|CVV|password)\b/i.test(s) && !/\b(never|do not|don't|won't)\b/i.test(s)) { hard.push('asks_for_secret'); break; }
}

// privacy: when the sender is not the owner, the reply must contain no order facts.
// We look for facts (a link, a courier name, a date, a pincode, "was delivered"), not for words
// like "tracking" or "address", because a good refusal says "we cannot share tracking or address".
if (d.order_lookup.privacy_blocked) {
  const FACT = /track\.example|swiftship|bharatexpress|\b20\d\d-\d\d-\d\d\b|\b\d{6}\b|\b(has been|was|is|got|were) (shipped|delivered|dispatched|out for delivery|cancelled)\b|\b(estimated|expected) (delivery|to arrive|to reach)\b/i;
  if (FACT.test(reply)) hard.push('privacy_leak');
}

// ---- 4. unsafe draft: replace it with a safe holding reply ----
const nameMatch = String(ctx.agent_input).match(/Customer first name: (.+)/);
const first = nameMatch ? nameMatch[1].trim() : 'there';
let finalReply = reply;
if (hard.length) {
  finalReply = 'Hi ' + first + ',\n\nThank you for writing to us. We have passed your message to our team, and a team member will follow up within 24 business hours.\n\n' + SIGN;
  repaired.push('replaced_by_safe_reply');
}

return {
  json: {
    reply: finalReply,
    original_reply: hard.length ? reply : '',
    grounded,
    guard: { hard: Array.from(new Set(hard)), soft, repaired },
    tools_used: steps.map((s) => (s.action && s.action.tool) || 'unknown'),
    tool_observation_chars: steps.reduce((n, s) => n + String(s.observation || '').length, 0),
    agent_output_chars: String(raw).length
  }
};
