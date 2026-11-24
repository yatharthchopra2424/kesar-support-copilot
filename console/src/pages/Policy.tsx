import { useMemo, useState } from 'react';
import { EMAILS, POLICY, useData } from '../lib/data';
import { parseJson, reasonLabel, truthy } from '../lib/format';
import { PageHead } from '../ui';
import type { Facts } from '../lib/types';

interface Knobs { return_window_days: number; high_value_inr: number; confidence_threshold: number }
const BASE: Knobs = { return_window_days: POLICY.return_window_days, high_value_inr: POLICY.high_value_inr, confidence_threshold: POLICY.confidence_threshold };

interface Outcome { eligible: boolean | null; reasons: string[]; needsHuman: boolean }

// Re-applies the three numeric rules to the facts stored for each email.
// It does not re-run the workflow or the model; it shows which stored decisions would flip.
function outcome(facts: Facts, confidence: number, k: Knobs): Outcome {
  const el = (facts.eligibility ?? {}) as Record<string, unknown>;
  let eligible: boolean | null = null;
  const reasons = (facts.reasons ?? []).filter((r) => r !== 'high_value_refund' && r !== 'low_confidence' && r !== 'refund_denied_review');
  if (el.path === 'return_unused') {
    const within = Number(el.days_since_delivery) <= k.return_window_days;
    const used = el.item_condition === 'opened_or_used';
    eligible = within && !used;
    if (!eligible) reasons.push('refund_denied_review');
    else if (facts.refund_inr != null && facts.refund_inr >= k.high_value_inr) reasons.push('high_value_refund');
  }
  if (confidence < k.confidence_threshold) reasons.push('low_confidence');
  return { eligible, reasons, needsHuman: reasons.length > 0 };
}

export function Policy() {
  const { runs } = useData();
  const [k, setK] = useState<Knobs>(BASE);
  const rows = runs.v2.audit;

  const changes = useMemo(() => {
    return rows.flatMap((r) => {
      const facts = parseJson<Facts>(r.facts_json, {});
      const was = outcome(facts, Number(r.confidence), BASE);
      const now = outcome(facts, Number(r.confidence), k);
      const out: string[] = [];
      if (was.eligible !== now.eligible) out.push(now.eligible ? 'return becomes eligible (refund amount is not stored for it, so the high-value check is skipped here)' : 'return becomes not eligible');
      if (was.needsHuman !== now.needsHuman) out.push(now.needsHuman ? 'now needs a human: ' + now.reasons.map(reasonLabel).join('; ') : 'no longer needs a human');
      return out.length ? [{ id: r.email_id, text: out.join('; ') }] : [];
    });
  }, [rows, k]);

  // Sanity: under the saved policy this rule set must agree with what the workflow stored.
  const mismatch = rows.filter((r) => outcome(parseJson<Facts>(r.facts_json, {}), Number(r.confidence), BASE).needsHuman !== truthy(r.needs_human)).length;
  const dirty = (Object.keys(BASE) as (keyof Knobs)[]).filter((x) => k[x] !== BASE[x]);
  const set = (key: keyof Knobs) => (e: React.ChangeEvent<HTMLInputElement>) => setK({ ...k, [key]: Number(e.target.value) });

  return (
    <>
      <PageHead title="Policy">
        Every number the rules use lives in <span className="mono">config/policy.json</span>. Change one here to preview which of the 25 emails would be handled differently.
      </PageHead>

      <div className="panel form-grid" role="group" aria-label="Policy values">
        <label className="field"><span>Return window, days after delivery</span>
          <input className="input" type="number" min={0} max={60} value={k.return_window_days} onChange={set('return_window_days')} /></label>
        <label className="field"><span>High-value refund, INR (at or above goes to a human)</span>
          <input className="input" type="number" min={0} step={100} value={k.high_value_inr} onChange={set('high_value_inr')} /></label>
        <label className="field"><span>Confidence threshold (below goes to a human)</span>
          <input className="input" type="number" min={0} max={1} step={0.05} value={k.confidence_threshold} onChange={set('confidence_threshold')} /></label>
        <div className="field">
          <span>&nbsp;</span>
          <button className="btn" type="button" onClick={() => setK(BASE)} disabled={!dirty.length}>Reset to saved values</button>
        </div>
      </div>

      <section className="section" aria-live="polite">
        <h2>{dirty.length ? `${changes.length} ${changes.length === 1 ? 'email changes' : 'emails change'}` : 'Showing the saved policy'}</h2>
        {!dirty.length ? <p>Edit a value above to see what moves.</p> : null}
        {dirty.length && !changes.length ? <p>No email changes outcome with these values. The 25 test emails do not sit near that limit.</p> : null}
        {changes.length ? (
          <div className="panel scroll">
            <table className="tbl">
              <thead><tr><th>Email</th><th>Subject</th><th>What changes</th></tr></thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id}>
                    <td><a className="id" href={'#/trace/' + c.id}>{c.id}</a></td>
                    <td className="trunc">{EMAILS.find((e) => e.id === c.id)?.subject}</td>
                    <td style={{ maxWidth: 'none', whiteSpace: 'normal', padding: '8px 12px' }}>{c.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {dirty.length ? (
          <p className="muted" style={{ marginTop: 10 }}>
            To make it real, change {dirty.map((d) => d.replace(/_/g, ' ')).join(', ')} in <span className="mono">config/policy.json</span>, rebuild the workflow with{' '}
            <span className="mono">node scripts/build_workflow_v2.js</span>, and re-import it into n8n.
          </p>
        ) : null}
      </section>

      <section className="section">
        <h2>What this preview is, and is not</h2>
        <div className="prose">
          <p>It re-applies the return-window, high-value and confidence rules to the facts the workflow stored for each email. It does not call the model or re-run n8n, so wording and tickets are not recomputed.</p>
          <p>
            {mismatch === 0
              ? 'Check: under the saved values these three rules reproduce the stored needs_human answer for all 25 emails.'
              : `Check: under the saved values these three rules disagree with the stored needs_human answer on ${mismatch} emails, because other rules also set it. Read the list as hints.`}
          </p>
          <p>Known gap: <span className="mono">damage_report_window_hours</span> is in the file, but the code uses a fixed 2 days for damage reports, so it is not editable here yet.</p>
        </div>
      </section>
    </>
  );
}
