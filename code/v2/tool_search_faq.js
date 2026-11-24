// Agent tool: search_faq  (n8n "Code Tool" node)  [v2]
//
// Keyword search over the nine sections of data/faq.md. The sections are embedded
// above this code by scripts/build_workflow_v2.js as `const FAQ = [{n, title, text}]`.
// Returns the best two sections as plain text, or a clear "not covered" message so the
// agent knows to hand over to a human instead of guessing.

const STOP = new Set(('a an the and or of to in on for is are was were be it my me i we you your our do does did can could ' +
  'would will how what when where why which with at by from this that there any if as about please').split(' '));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9₹ ]/g, ' ').split(/\s+/)
  .filter((w) => w.length > 1 && !STOP.has(w)).map(stem);

const q = tokens(query);
const scored = FAQ.map((sec) => {
  const bag = new Set(tokens(sec.title + ' ' + sec.text));
  const titleBag = new Set(tokens(sec.title));
  let score = 0;
  for (const w of q) { if (bag.has(w)) score += 1; if (titleBag.has(w)) score += 2; }
  return { sec, score };
}).sort((a, b) => b.score - a.score);

if (!q.length || scored[0].score < 2) {
  return 'NOT COVERED: the FAQ has nothing on this. Do not answer it. Say a team member will follow up within 24 business hours and set grounded to false.';
}
return scored.slice(0, 2).filter((s) => s.score >= 2).map((s) => '## ' + s.sec.n + '. ' + s.sec.title + '\n' + s.sec.text).join('\n\n');
