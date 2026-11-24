import { useState } from 'react';
import { useData } from '../lib/data';
import { inr, num, parseJson, secs, usd } from '../lib/format';
import { PageHead } from '../ui';
import type { AuditRow, TraceStep, Version } from '../lib/types';

// Gemini 2.5 Flash-Lite list price per 1M tokens, from Google's developer blog.
// Our model id is "gemini-flash-lite-latest", an alias that may point at a different version, so
// treat these as an assumption and check https://ai.google.dev/gemini-api/docs/pricing.
const DEFAULT_IN = 0.1;
const DEFAULT_OUT = 0.4;

interface Totals { n: number; inTok: number; outTok: number; agentIn: number; agentOut: number; agentCalls: number; latency: number }

function totals(rows: AuditRow[]): Totals {
  const t: Totals = { n: rows.length, inTok: 0, outTok: 0, agentIn: 0, agentOut: 0, agentCalls: 0, latency: 0 };
  for (const r of rows) {
    t.inTok += num(r.tokens_in);
    t.outTok += num(r.tokens_out);
    t.latency += num(r.latency_ms);
    const agent = parseJson<{ steps: TraceStep[] }>(r.trace_json, { steps: [] }).steps.find((s) => s.name === 'agent') as Record<string, number> | undefined;
    if (agent) {
      t.agentCalls += 1;
      t.agentIn += num(agent.tokens_in_est);
      t.agentOut += num(agent.tokens_out_est);
    }
  }
  return t;
}

export function Cost() {
  const { runs } = useData();
  const [perDay, setPerDay] = useState(1000);
  const [pin, setPin] = useState(DEFAULT_IN);
  const [pout, setPout] = useState(DEFAULT_OUT);
  const [fx, setFx] = useState('');
  const rate = Number(fx);
  const versions: Version[] = ['v2', 'v1'];

  const rows = versions.map((v) => {
    const t = totals(runs[v].audit);
    const perIn = t.inTok / t.n;
    const perOut = t.outTok / t.n;
    const usdEmail = (perIn * pin + perOut * pout) / 1e6;
    return { v, t, perIn, perOut, usdEmail, measuredShare: 1 - (t.agentIn + t.agentOut) / (t.inTok + t.outTok) };
  });

  return (
    <>
      <PageHead title="Cost">
        Tokens per email are measured from the 25-email runs. Prices are inputs you can change. Today the Gemini free tier is used, so real spend is zero.
      </PageHead>

      <div className="panel form-grid" role="group" aria-label="Cost assumptions">
        <label className="field"><span>Emails per day</span>
          <input className="input" type="number" min={1} inputMode="numeric" value={perDay} onChange={(e) => setPerDay(Math.max(1, Number(e.target.value) || 1))} /></label>
        <label className="field"><span>Input price, USD per 1M tokens</span>
          <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={pin} onChange={(e) => setPin(Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className="field"><span>Output price, USD per 1M tokens</span>
          <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={pout} onChange={(e) => setPout(Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className="field"><span>USD to INR rate (enter to see rupees)</span>
          <input className="input" type="number" min={0} step="0.01" inputMode="decimal" placeholder="your rate" value={fx} onChange={(e) => setFx(e.target.value)} /></label>
      </div>

      <div className="panel scroll" style={{ marginTop: 16 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Version</th><th className="num">Tokens in / email</th><th className="num">Tokens out / email</th><th className="num">Reply agent calls</th>
              <th className="num">Avg latency</th><th className="num">USD / email</th><th className="num">{rate > 0 ? 'INR / email' : 'INR / email'}</th>
              <th className="num">USD / month</th><th className="num">INR / month</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, t, perIn, perOut, usdEmail }) => (
              <tr key={v}>
                <td><b>{v === 'v2' ? 'v2 final' : 'v1 baseline'}</b></td>
                <td className="num">{Math.round(perIn).toLocaleString('en-IN')}</td>
                <td className="num">{Math.round(perOut).toLocaleString('en-IN')}</td>
                <td className="num">{t.agentCalls} of {t.n}</td>
                <td className="num">{secs(t.latency / t.n)}</td>
                <td className="num">{usd(usdEmail)}</td>
                <td className="num">{rate > 0 ? inr(usdEmail * rate).replace(/^₹0$/, '₹' + (usdEmail * rate).toFixed(2)) : 'enter rate'}</td>
                <td className="num">{usd(usdEmail * perDay * 30, 2)}</td>
                <td className="num">{rate > 0 ? inr(usdEmail * perDay * 30 * rate) : 'enter rate'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Month = 30 days at {perDay.toLocaleString('en-IN')} emails a day. Default prices are Gemini 2.5 Flash-Lite list prices from{' '}
        <a href="https://developers.googleblog.com/gemini-25-flash-lite-is-now-stable-and-generally-available/" target="_blank" rel="noreferrer">Google's announcement</a>.
        The model id used here is the alias <span className="mono">gemini-flash-lite-latest</span>, so confirm the current price on the official pricing page before quoting it.
      </p>

      <section className="section">
        <h2>What the numbers are made of</h2>
        <div className="panel scroll">
          <table className="tbl">
            <thead><tr><th>Version</th><th className="num">Tokens in total</th><th className="num">Tokens out total</th><th className="num">Share measured by the API</th><th>Where the rest comes from</th></tr></thead>
            <tbody>
              {rows.map(({ v, t, measuredShare }) => (
                <tr key={v}>
                  <td><b>{v}</b></td>
                  <td className="num">{t.inTok.toLocaleString('en-IN')}</td>
                  <td className="num">{t.outTok.toLocaleString('en-IN')}</td>
                  <td className="num">{Math.round(100 * measuredShare)}%</td>
                  <td>The reply agent: n8n does not report its tokens, so they are estimated as characters divided by four.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Why v2 costs more than v1, and why that is fine</h2>
        <div className="prose">
          <p>v2 sends the model a longer prompt: the facts the code already decided (order, eligibility, refund) go in, so the model writes instead of guessing. That is more input tokens per email in exchange for replies that follow the rules.</p>
          <p>Spam and thank-you emails skip the reply agent entirely in v2, which is why its agent call count is below 25.</p>
        </div>
      </section>
    </>
  );
}
