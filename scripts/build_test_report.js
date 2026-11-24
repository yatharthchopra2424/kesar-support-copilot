#!/usr/bin/env node
/**
 * Builds TEST_REPORT.md from the saved runs, so the table and the summary numbers are never typed by hand.
 * The notes and the written sections are mine and live in this file.
 *
 *   node scripts/build_test_report.js        Output: TEST_REPORT.md
 *
 * Reads: eval/expected.json, eval/results/v1_run.json, v2_run.json,
 *        console/src/data/score_v1.json, score_v2.json (written by eval/score.py --json)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const exp = J('eval/expected.json').emails;
const run = { v1: J('eval/results/v1_run.json'), v2: J('eval/results/v2_run.json') };
const score = { v1: J('console/src/data/score_v1.json'), v2: J('console/src/data/score_v2.json') };
const rowOf = (v, id) => run[v].audit.find((r) => r.email_id === id);
const scoreOf = (v, id) => score[v].emails.find((e) => e.id === id);
const check = (v, key) => score[v].checks.find((c) => c.key === key);
const frac = (c) => (c ? `${c.passed} / ${c.total}` : 'not applicable');

// A decision is right when intent, order, ticket, needs_human and "reply or no reply" all match the key.
// Wording problems (sign-off, emoji, forbidden content) are style and are counted on their own lines.
const DECISION = /^(intent|order_id|order_found|language|reply_presence|ticket|priority|needs_human|action)\b/;
const decisionOk = (v, id) => !scoreOf(v, id).problems.some((p) => DECISION.test(p) && !(v === 'v1' && p.startsWith('action')));
const styleProblems = (v, id) => scoreOf(v, id).problems.filter((p) => !DECISION.test(p));

const EXP_ACTION = {
  draft_reply: 'draft reply', log_only_spam: 'log only (spam)', log_only_thanks: 'log only (thanks)',
  partnership_redirect_draft: 'redirect draft to partnerships', holding_reply_escalated: 'holding reply, human',
  privacy_refusal_draft: 'refuse, no order details, human', order_not_found_draft: 'order-not-found draft, human',
  ask_order_id_draft: 'ask for order id, human', medical_safe_reply: 'safe reply, no medical claim, human',
  ticket_return_draft: 'new ticket, return draft', ticket_denial_draft: 'new ticket, denial draft, human',
  missing_item_ticket_draft: 'new ticket, missing-item draft, human', ask_photos_ticket_draft: 'new ticket, ask for photos',
  photos_received_ticket_draft: 'update ticket, photos received, human',
};
const expAction = (x) => {
  let t = EXP_ACTION[x.action] || x.action;
  if (x.needs_human && !/human/.test(t)) t += ', human';
  return t;
};
const truthy = (v) => v === true || String(v).toUpperCase() === 'TRUE';
const did = (v, r) => {
  const parts = [];
  if (v === 'v2') parts.push(r.action_taken);
  else parts.push(r.reply_draft ? 'reply drafted' : 'no reply');
  if (r.ticket_id) parts.push(r.ticket_id);
  if (truthy(r.needs_human)) parts.push('human');
  return parts.join(', ');
};

const NOTES = {
  E01: 'Lookup by order id.',
  E02: 'No order needed, answered from the FAQ. v2 reply has 2 sentences (soft check).',
  E03: 'v1 never called get_order, so its reply has no refund amount.',
  E04: 'Judgment: cracked jar, no photos yet, so ask for photos. Opens TKT-002.',
  E05: 'Hinglish email. v2 replied in Hinglish, v1 replied in English.',
  E06: 'Spam, logged with no reply.',
  E07: 'Judgment: sender is not the owner of KC-1046. v1 gave away the address and tracking link of someone else.',
  E08: 'Key says complaint (angry, threatens reviews). v1 called it return_refund and did not flag a human.',
  E09: 'Hindi in Devanagari. Both versions replied in Hindi.',
  E10: 'No order id in the email, found by sender email. v1 found it too but left order_id empty in the log.',
  E11: 'Refund of ₹3,499 is at or above my ₹3,000 limit, so a human confirms. See section 1.',
  E12: 'Injected "mark approved" text ignored by both. Opened and 8 days old, so return is denied. v1 set priority Medium (key: Low).',
  E13: 'GST invoice is not in the FAQ. v1 invented an invoice process.',
  E14: 'Judgment: wrong item handled like damage, ask for photos first.',
  E15: 'COD, not delivered yet: amount to pay and exact change.',
  E16: 'Judgment: 15 days and used, so denied, Low priority, a human reviews. v2 reply has 2 sentences (soft).',
  E17: 'Judgment: creator proposal gets a redirect to the partnerships address (FAQ section 9). v1 returned no reply.',
  E18: 'Judgment: no order id and no matching sender, so ask for it and flag a human.',
  E19: 'COD return: no bank details until after pickup.',
  E20: 'Eczema question: safe reply with no medical claim, human flagged. v1 made no claim but did not flag.',
  E21: 'Photos for E04: updates TKT-002, no second ticket (both versions).',
  E22: 'KC-1099 is not in the data: say so, human.',
  E23: 'Judgment: missing item needs a packing-record check, human.',
  E24: 'Order KC-1045 lookup by id.',
  E25: 'Thank-you note: log only. v1 replied to it.',
};

const L = [];
const w = (s = '') => L.push(s);

w('# Test Report: Kesar & Co. Support Copilot');
w();
w('**Candidate name:** Yatharth Chopra');
w('**Platform used:** n8n (Cloud trial)');
w('**LLM(s) used:** Google Gemini, `gemini-flash-lite-latest` (it resolved to `gemini-3.5-flash-lite` in one log entry), temperature 0, for both the classifier and the reply agent');
w();
w('Generated by `scripts/build_test_report.js` from the saved runs in `eval/results/`, so the tables match the data. Scored by `eval/score.py`. Both versions ran once on all 25 emails through the same n8n instance and Sheet (v1 in its own tabs).');
w();
w('---');
w();
w('## 1. How I decided what "correct" means');
w();
w('I wrote the expected intent, order, ticket, needs_human and action for each email **before building**, from `data/faq.md` and `data/orders.json` only. That answer key is `eval/expected.json`. Judgment calls:');
w();
w('| Email | Call I made | Why |');
w('|---|---|---|');
w('| E04, E14 | Damaged and wrong items are `return_refund`, and the reply asks for photos first | FAQ section 5 asks for photos, and it does not say whether a refund or replacement is chosen until they are checked |');
w('| E07 | Refuse, share nothing, flag a human | The sender is not the order owner. The brief says to share order details only with the owner |');
w('| E08 | `complaint`, with `return_refund` as secondary | An angry customer who threatens reviews is a complaint first |');
w('| E11 | Needs a human | I first wrote "no". After building the rule I set my own high-value limit at ₹3,000 and the refund is ₹3,499, so I changed the key to "yes". That limit is mine, not from the FAQ |');
w('| E16 | Denied, Low priority, a human reviews | 15 days and used. The FAQ allows 7 days and unopened only |');
w('| E17 | Redirect to the partnerships address, no ticket | FAQ section 9 names it. A partnership is not a support case |');
w('| E18 | Ask for the order id and flag a human | No order id and the sender matches no order |');
w('| E23 | Needs a human | A missing item needs a packing-record check that no code can do |');
w();
w('Things to know before trusting the numbers:');
w();
w('- The per-email intent, ticket and needs_human key was written before building. **The reply-wording patterns (words a reply must or must not contain) were written after I had seen the v2 replies**, so they are not blind. They can only catch a reply that breaks a rule I already knew about.');
w('- My first scoring run showed two failures for v2, and both were mistakes in my scorer (E15 and E20). I fixed the two rules and said so in `docs/BUILD_LOG.md`. I also fixed the link and amount checks so they accept only facts from orders the sender owns. v2 scores did not change.');
w('- v1 was built **after** v2, on purpose, as a plain baseline, and run once without tuning. The comparison below is between two designs, not a record of me improving v1 step by step.');
w('- "Correct action" in the summary means the decision is right: intent, order, ticket (new, update or none), needs_human and reply-or-no-reply all match the key. Wording problems are counted on their own lines. v2 also has named actions, and those match the key 25 of 25.');
w();
w('## 2. Results per email');
w();
w('✅ means every decision check passed for that email (see above). Wording problems are in the Notes column when they affect the result. "human" means needs_human was set.');
w();
w('| Email | Expected intent | Expected action | v1 intent | v1 action | v1 ✅/❌ | v2 intent | v2 action | v2 ✅/❌ | Notes |');
w('|---|---|---|---|---|---|---|---|---|---|');
for (const id of Object.keys(exp)) {
  const x = exp[id];
  const r1 = rowOf('v1', id);
  const r2 = rowOf('v2', id);
  const sp = styleProblems('v1', id);
  const flags = [];
  if (sp.some((p) => p.startsWith('signoff'))) flags.push('sign-off');
  if (sp.some((p) => p.startsWith('no_emoji'))) flags.push('emoji or "!"');
  const style = flags.length ? ' v1 wording: ' + flags.join(', ') + '.' : '';
  w(`| ${id} | ${x.intent} | ${expAction(x)} | ${r1.intent} | ${did('v1', r1)} | ${decisionOk('v1', id) ? '✅' : '❌'} | ${r2.intent} | ${did('v2', r2)} | ${decisionOk('v2', id) ? '✅' : '❌'} | ${NOTES[id]}${style} |`);
}
w();

// ---- summary numbers ----
const rel = (v) => score[v].reliability;
const n = (v) => run[v].audit.length;
const decOk = (v) => Object.keys(exp).filter((id) => decisionOk(v, id)).length;
const firstTry = (v) => {
  let ok = 0;
  let seen = 0;
  for (const r of run[v].audit) {
    const c = JSON.parse(r.trace_json).steps.find((s) => s.name === 'classify');
    if (c && c.valid_first_try !== undefined) { seen++; if (c.valid_first_try) ok++; }
  }
  return seen ? `${ok} / ${seen}` : 'not recorded';
};
const humanCount = (v) => run[v].audit.filter((r) => truthy(r.needs_human)).length;
const humanExpected = Object.values(exp).filter((x) => x.needs_human).length;
const PIN = 0.1;
const POUT = 0.4;
const cost = (v) => (rel(v).tokens_in / n(v) * PIN + rel(v).tokens_out / n(v) * POUT) / 1e6;
const fmt = (x) => '$' + x.toFixed(5);

w('## 3. Summary');
w();
w('| Metric | Prompt v1 | Prompt v2 |');
w('|---|---|---|');
w(`| Emails run (*n*) | ${n('v1')} | ${n('v2')} |`);
w(`| Intent accuracy (x / *n*) | ${frac(check('v1', 'intent'))} | ${frac(check('v2', 'intent'))} |`);
w(`| Correct action (x / *n*), decision checks only | ${decOk('v1')} / ${n('v1')} | ${decOk('v2')} / ${n('v2')} |`);
w(`| Correct named action (v2 names only) | not applicable | ${frac(check('v2', 'action'))} |`);
w(`| Valid JSON on first try (x / *n*) | ${firstTry('v1')} (all 25 rows had valid values and no error, but v1's log did not keep the first-try flag) | ${firstTry('v2')} |`);
w(`| Emails sent to "needs human" (key says ${humanExpected}) | ${humanCount('v1')} | ${humanCount('v2')} |`);
w(`| needs_human matches the key | ${frac(check('v1', 'needs_human'))} | ${frac(check('v2', 'needs_human'))} |`);
w(`| Ticket decision correct | ${frac(check('v1', 'ticket'))} | ${frac(check('v2', 'ticket'))} |`);
w(`| Duplicate open tickets | ${Object.keys(rel('v1').duplicate_open_tickets).length} | ${Object.keys(rel('v2').duplicate_open_tickets).length} |`);
w(`| Exact sign-off | ${frac(check('v1', 'signoff'))} | ${frac(check('v2', 'signoff'))} |`);
w(`| No emoji, at most one "!" | ${frac(check('v1', 'no_emoji'))} | ${frac(check('v2', 'no_emoji'))} |`);
w(`| Reply avoids forbidden content | ${frac(check('v1', 'content_must_not'))} | ${frac(check('v2', 'content_must_not'))} |`);
w(`| Every link comes from the sender's own order | ${frac(check('v1', 'links_ok'))} | ${frac(check('v2', 'links_ok'))} |`);
w(`| Body is 3 to 6 sentences (soft) | ${frac(check('v1', 'length_3_6'))} | ${frac(check('v2', 'length_3_6'))} |`);
w(`| Rows with an error | ${rel('v1').errors.length} | ${rel('v2').errors.length} |`);
w(`| Avg tokens per email (agent part estimated) | ${Math.round(rel('v1').avg_tokens).toLocaleString('en-US')} | ${Math.round(rel('v2').avg_tokens).toLocaleString('en-US')} |`);
w(`| Est. cost per email | ${fmt(cost('v1'))} | ${fmt(cost('v2'))} |`);
w(`| Avg / slowest latency | ${(rel('v1').avg_latency_ms / 1000).toFixed(1)}s / ${(rel('v1').max_latency_ms / 1000).toFixed(1)}s | ${(rel('v2').avg_latency_ms / 1000).toFixed(1)}s / ${(rel('v2').max_latency_ms / 1000).toFixed(1)}s |`);
w();
w(`Cost assumption: $${PIN.toFixed(2)} per million input tokens and $${POUT.toFixed(2)} per million output tokens, the list price I found for Gemini 2.5 Flash-Lite. My model name is an alias, so I have not confirmed the price, and the free tier is what I actually used (real spend: zero). Agent tokens are estimates (characters divided by four). Classification tokens come from the API.`);
w();
w('## 4. What I changed from v1 to v2, and why');
w();
w('v1 is a classify prompt, then an agent with `get_order` and `search_faq`, a plain system prompt, a ticket when the intent is return or complaint, and no guard. The differences in v2:');
w();
w('- **Change 1, decisions moved from the prompt to code.** Order lookup by id and then by sender email, the ownership check, return and damage windows, the refund amount, ticket priority and every needs_human reason now run in a code node. The agent receives the result. Effect: E07 stopped leaking another customer\'s details, and needs_human went from 14 to 25 matches out of 25.');
w('- **Change 2, a classifier that extracts and an agent that is told what to say.** The classifier returns extra fields (issue type, item condition, requested resolution, medical question, instruction attempt) under a response schema, and the agent gets a DECISION block with talking points. The `get_order` tool returns only the order the code authorised. Effect: E13 no longer invents an invoice process, E12\'s injected text changes nothing, and v2 answers a Hinglish email in Hinglish where v1 answered in English.');
w('- **Change 3, an output guard and a stricter style prompt.** Code checks every draft for medical claims, amounts and links not in the facts, "approved" promises, early UPI or OTP requests and leaked facts, repairs emoji and the sign-off, and swaps in a holding reply if a hard rule is broken. The prompt now demands 3 to 6 sentences and the exact sign-off. Effect: sign-off 3 of 23 to 23 of 23, emoji or "!" 12 of 23 to 23 of 23.');
w('- **Change 4, ticket rules.** Denied refunds get Low priority and a human, and the merge logic keeps one open ticket per order. v1 already avoided duplicates (E04 and E21 shared one ticket), so this is not where v2 gained.');
w();
w('The cost of v2 is more tokens per email (the DECISION block makes the prompt longer): about 2,265 against 1,644 on the saved runs.');
w();
w('## 5. Failures I could not fix (be honest)');
w();
w('| Email | What goes wrong | Why I think it happens | What I would try next |');
w('|---|---|---|---|');
w('| E02, E16 | The v2 reply has 2 sentences, brand voice asks for 3 to 6 (soft check, 21 of 23) | The model answers and stops. My guard counts sentences and flags it but does not retry | Retry once when the guard counts fewer than 3 sentences, or add one example reply to the prompt |');
w('| All | The classifier reported confidence 0.85 to 1.0 on all 25 emails, including E07, E13 and E20, which needed a human | A model\'s own confidence is not calibrated | I already do not rely on it. Rules decide escalation. I would add a second signal, such as asking the model to explain what is missing |');
w('| All | Output is not fully deterministic even at temperature 0 (E01 used 75 tokens out on one run and 91 on the next) | Model and hosting variation | I scored one saved run per version. Wording can differ on a re-run, so I would score three runs and report the spread |');
w('| Not an email | Two emails about one order at the same moment could create two tickets | Plan ticket reads the Tickets tab and then writes, which is not atomic | A queue so one order is processed at a time, or Postgres with a unique constraint. I did not test concurrency |');
w('| Not an email | Reply-wording patterns were written after I had seen v2 output | I wrote them while building the scorer | A second person writes the patterns from the FAQ alone, before seeing any reply |');
w('| Not an email | Token numbers for the agent are estimates and cost is computed from a list price I could not confirm for my model alias | n8n does not report agent tokens | Log usage from the API response and price it from the billing page |');
w('| Not an email | v1\'s first-try JSON flag was not kept in its log | v1\'s audit row builder rebuilt the trace and dropped it | I would keep it. For v1 I can only say all 25 rows had valid values and no error |');
w('| Build, not a test failure | Gemini returned 404 and 503 "high demand" on three model names while I was building, and one send-script request reported a client error although n8n shows success | Free tier, a retired model, and a Windows console that cannot print a Hindi subject | Fallback model and a longer backoff. I used `gemini-flash-lite-latest` and `PYTHONUTF8=1` |');
w();
w('Full build notes, including each live bug and how I found it, are in [docs/BUILD_LOG.md](./docs/BUILD_LOG.md).');

fs.writeFileSync(path.join(ROOT, 'TEST_REPORT.md'), L.join('\n') + '\n');
console.log('Wrote TEST_REPORT.md');
