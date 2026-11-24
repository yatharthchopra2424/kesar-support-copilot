// Node: "Decide"  (n8n Code node, run once for each item)  [v1]
//
// Reads the agent's answer and applies the few v1 rules:
//   reply        : the agent's text, or nothing when it said NO_REPLY
//   ticket       : return_refund or complaint WITH an order number found by the classifier
//   needs_human  : the classifier failed, or its confidence is below the threshold
// There is no eligibility check, no output guard and no privacy check in v1.
//
// POLICY is added above this code by scripts/build_workflow_v1.js.
// AGENT_PROMPT_CHARS is added the same way.

const row = $('Validate classification').first().json.row;
const out = $input.item.json;
const steps = Array.isArray(out.intermediateSteps) ? out.intermediateSteps : [];

let reply = String(out.output === undefined ? '' : out.output).replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
const agentFailed = out.output === undefined;
if (/^NO_REPLY\b/i.test(reply)) reply = '';

const fallback = row.action_taken === 'fallback_needs_human';
const confidence = Number(row.confidence);
const lowConf = !fallback && confidence < POLICY.confidence_threshold;
const reasons = [];
if (fallback) reasons.push('classification_failed');
if (lowConf) reasons.push('low_confidence');
if (agentFailed) reasons.push('agent_failed');

const getOrderCalls = steps.filter((s) => s.action && String(s.action.tool).indexOf('get_order') === 0);
const orderFound = getOrderCalls.some((s) => String(s.observation || '').indexOf('"order_id"') !== -1);

const ticketNeeded = !fallback && ['return_refund', 'complaint'].indexOf(row.intent) !== -1 && !!row.order_id;

const toolChars = steps.reduce((n, s) => n + String(s.observation || '').length, 0);
const agentIn = Math.ceil((AGENT_PROMPT_CHARS + String($('Build agent input').first().json.agent_input).length + toolChars) / 4);
const agentOut = Math.ceil(String(out.output || '').length / 4);

return {
  json: {
    row, reply, ticket_needed: ticketNeeded, needs_human: reasons.length > 0, reasons,
    action: fallback ? 'fallback_needs_human' : (agentFailed ? 'agent_failed' : (reply ? 'reply_drafted' : 'no_reply')),
    order_found: getOrderCalls.length ? orderFound : null,
    tools_used: steps.map((s) => (s.action && s.action.tool) || 'unknown'),
    tokens_agent_in_est: agentIn, tokens_agent_out_est: agentOut
  }
};
