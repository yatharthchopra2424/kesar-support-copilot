// Node: "Assemble result"  (n8n Code node, run once for each item)  [v2]
//
// Joins the two paths (reply written / no reply needed) into one result and makes
// the final needs_human call: the rules from "Resolve order and decide" plus anything
// the output guard found.
//
// AGENT_PROMPT_CHARS is added above this code by scripts/build_workflow_v2.js.

const ctx = $('Resolve order and decide').first().json;
let g = null;
try { g = $('Output guard').first().json; } catch (e) { g = null; }   // not run when no reply was needed

const reasons = ctx.decision.escalation_reasons.slice();
let reply = '';
let tokensAgentIn = 0;
let tokensAgentOut = 0;
if (g) {
  reply = g.reply;
  g.guard.hard.forEach((h) => reasons.push('guard:' + h));
  if (g.grounded === false) reasons.push('faq_gap');
  // The n8n agent does not report token usage, so this is an estimate (about 4 characters per token).
  tokensAgentIn = Math.ceil((AGENT_PROMPT_CHARS + String(ctx.agent_input).length + g.tool_observation_chars) / 4);
  tokensAgentOut = Math.ceil(g.agent_output_chars / 4);
}

return {
  json: {
    ctx, guard: g ? g.guard : null, tools_used: g ? g.tools_used : [],
    reply, original_reply: g ? g.original_reply : '', reasons: Array.from(new Set(reasons)),
    needs_human: reasons.length > 0,
    tokens_agent_in_est: tokensAgentIn, tokens_agent_out_est: tokensAgentOut
  }
};
