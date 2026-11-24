import { EXPECTED, SCORES, SNAPSHOT_FETCHED } from '../lib/data';
import { INTENT_LABEL, pct, secs } from '../lib/format';
import { Bar, PageHead } from '../ui';

export function Evals() {
  const v2 = SCORES.v2;
  const v1 = SCORES.v1;
  const keys = Array.from(new Set([...v2.checks.map((c) => c.key), ...v1.checks.map((c) => c.key)]));
  const find = (s: typeof v2, k: string) => s.checks.find((c) => c.key === k);
  const name = (k: string) => (find(v2, k) ?? find(v1, k))!.name;
  const one = (k: string, s: typeof v2) => {
    const c = find(s, k);
    return c ? (
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="num" style={{ minWidth: 46 }}>{c.passed}/{c.total}</span>
          <Bar done={c.passed} total={c.total} />
        </div>
      </td>
    ) : (
      <td className="muted">not applicable</td>
    );
  };
  const r2 = v2.reliability;
  const r1 = v1.reliability;
  const failCount = (s: typeof v2) => s.emails.filter((e) => !e.ok).length;
  const mapV1 = new Map(v1.emails.map((e) => [e.id, e]));

  return (
    <>
      <PageHead title="Evals">
        Both runs scored by the same script (<span className="mono">eval/score.py</span>) against an answer key. No LLM grades another LLM here: every check is a comparison or a pattern.
        Scores are from the saved runs in <span className="mono">eval/results</span> (v2 fetched {new Date(SNAPSHOT_FETCHED.v2).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}), so they stay fixed while the live pages refresh.
      </PageHead>

      <div className="two">
        <div className="panel scroll">
          <table className="tbl">
            <thead><tr><th>Check</th><th>v2 final</th><th>v1 baseline</th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td style={{ maxWidth: 'none' }}>{name(k)}</td>
                  {one(k, v2)}
                  {one(k, v1)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel scroll">
          <table className="tbl">
            <thead><tr><th>Reliability</th><th className="num">v2 final</th><th className="num">v1 baseline</th></tr></thead>
            <tbody>
              <tr><td>Rows in the audit log</td><td className="num">{r2.rows} / 25</td><td className="num">{r1.rows} / 25</td></tr>
              <tr><td>Emails with a failing hard check</td><td className="num">{failCount(v2)}</td><td className="num">{failCount(v1)}</td></tr>
              <tr><td>Duplicate open tickets</td><td className="num">{Object.keys(r2.duplicate_open_tickets).length}</td><td className="num">{Object.keys(r1.duplicate_open_tickets).length}</td></tr>
              <tr><td>Tickets total</td><td className="num">{r2.tickets}</td><td className="num">{r1.tickets}</td></tr>
              <tr><td>Rows with an error</td><td className="num">{r2.errors.length}</td><td className="num">{r1.errors.length}</td></tr>
              <tr><td>Guard hard flags</td><td className="num">{r2.hard_flags.length}</td><td className="num">none, v1 has no guard</td></tr>
              <tr><td>Average tokens per email</td><td className="num">{Math.round(r2.avg_tokens).toLocaleString('en-IN')}</td><td className="num">{Math.round(r1.avg_tokens).toLocaleString('en-IN')}</td></tr>
              <tr><td>Average / slowest latency</td><td className="num">{secs(r2.avg_latency_ms)} / {secs(r2.max_latency_ms)}</td><td className="num">{secs(r1.avg_latency_ms)} / {secs(r1.max_latency_ms)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <section className="section">
        <h2>Email by email</h2>
        <p>A tick means every hard check passed for that email. Soft notes (such as a two-sentence reply) are shown but do not count as a failure.</p>
        <div className="panel scroll">
          <table className="tbl">
            <thead><tr><th>Email</th><th>Expected</th><th>v2</th><th>v1</th><th>What v1 got wrong</th><th>v2 soft notes</th></tr></thead>
            <tbody>
              {v2.emails.map((e) => {
                const x = EXPECTED[e.id];
                const o = mapV1.get(e.id);
                return (
                  <tr key={e.id}>
                    <td><a className="id" href={'#/trace/' + e.id}>{e.id}</a></td>
                    <td className="trunc" style={{ maxWidth: 260 }}>
                      {INTENT_LABEL[x.intent]}, {x.needs_human ? 'human' : 'automatic'}, ticket {x.ticket}{x.judgment ? ' (judgment call)' : ''}
                    </td>
                    <td><span className={'chip ' + (e.ok ? 'ok' : 'stop')}>{e.ok ? 'Pass' : 'Fail'}</span></td>
                    <td><span className={'chip ' + (o?.ok ? 'ok' : 'stop')}>{o?.ok ? 'Pass' : 'Fail'}</span></td>
                    <td className="trunc" style={{ maxWidth: 360 }} title={o?.problems.join('; ')}>{o && !o.ok ? o.problems.join('; ') : ''}</td>
                    <td className="muted">{e.soft.join('; ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          v2 passes {v2.emails.filter((e) => e.ok).length} of 25 emails ({pct(v2.emails.filter((e) => e.ok).length, 25)}%), v1 passes {v1.emails.filter((e) => e.ok).length} of 25 ({pct(v1.emails.filter((e) => e.ok).length, 25)}%).
        </p>
      </section>

      <section className="section">
        <h2>Read this before trusting the numbers</h2>
        <div className="prose">
          <p>v1 was built after v2, as a deliberately plain baseline, and run once without tuning. It is a fair comparison of two designs, not a record of how v2 improved over time.</p>
          <p>The per-email answer key (intent, ticket, needs_human) was written before building. The reply-content patterns (words a reply must or must not contain) were written after I had seen v2 replies, so they are not blind.</p>
          <p>Token counts for the reply agent are estimates (characters divided by four). Classification tokens come from the API.</p>
        </div>
      </section>
    </>
  );
}
