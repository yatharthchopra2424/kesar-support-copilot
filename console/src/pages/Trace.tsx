import { useEffect } from 'react';
import {
  Brain, CaretLeft, CaretRight, Database, EnvelopeSimple, GitBranch, Robot, Scales, ShieldCheck, Table, Ticket,
} from '@phosphor-icons/react';
import { EMAILS, useData } from '../lib/data';
import { rememberTrace } from '../lib/route';
import { buildTrace, type Step } from '../lib/trace';
import { shortTime } from '../lib/format';
import { HumanFlag, IntentChip, PageHead } from '../ui';

const ICON: Record<string, typeof Brain> = {
  receive: EnvelopeSimple, classify: Brain, lookup: Database, eligibility: Scales, decide: GitBranch, agent: Robot, guard: ShieldCheck, ticket: Ticket, log: Table,
};

function Marker({ step }: { step: Step }) {
  const Icon = ICON[step.id] ?? GitBranch;
  return (
    <span className={'marker ' + step.tone} title={step.tone}>
      <Icon size={15} />
      <span className="sr">{step.tone === 'ok' ? 'completed' : step.tone === 'stop' ? 'stopped' : step.tone === 'warn' ? 'needs attention' : 'skipped'}</span>
    </span>
  );
}

export function Trace({ id }: { id: string }) {
  const { audit, version } = useData();
  useEffect(() => rememberTrace(id), [id]);

  const i = EMAILS.findIndex((e) => e.id === id);
  const email = EMAILS[i];
  const row = audit.find((r) => r.email_id === id);
  if (!email) {
    return (
      <>
        <PageHead title="Trace" />
        <div className="panel empty">No email called {id}. Pick one from the <a href="#/inbox">Inbox</a>.</div>
      </>
    );
  }
  const prev = EMAILS[i - 1];
  const next = EMAILS[i + 1];
  const steps = row ? buildTrace(row, email, version) : [];

  return (
    <>
      <PageHead
        title={`${email.id}: ${email.subject}`}
        right={
          <div className="pager">
            <a className="btn icon" aria-label="Previous email" aria-disabled={!prev} href={prev ? '#/trace/' + prev.id : undefined}><CaretLeft size={16} /></a>
            <a className="btn icon" aria-label="Next email" aria-disabled={!next} href={next ? '#/trace/' + next.id : undefined}><CaretRight size={16} /></a>
          </div>
        }
      >
        {row ? (
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <IntentChip intent={row.intent} /> <HumanFlag value={row.needs_human} />
            <span>{version === 'v2' ? 'Every step below is read from the stored trace.' : 'v1 baseline: fewer steps because v1 has no decision code or guard.'}</span>
          </span>
        ) : (
          'This email has no audit row yet.'
        )}
      </PageHead>

      {!row ? (
        <div className="panel empty">Not processed in this run. Send it through the webhook and refresh.</div>
      ) : (
        <div className="trace-grid">
          <ol className="steps" key={id + version} aria-label="Pipeline steps">
            {steps.map((s, n) => (
              <li className="step" key={s.id} style={{ ['--i' as string]: n }}>
                <Marker step={s} />
                <div className="step-body">
                  <div className="step-title">
                    <h3>{s.title}</h3>
                    <span className={'actor ' + s.actor} title={s.actor === 'LLM' ? 'Decided by the language model' : s.actor === 'Code' ? 'Decided by plain code, same answer every time' : 'Input'}>
                      {s.actor === 'Input' ? 'Input' : s.actor}
                    </span>
                  </div>
                  <div className="step-head">{s.headline}</div>
                  <div className="kv">
                    {s.facts.map((fct) => (
                      <span key={fct.k}><b>{fct.k}</b> {fct.v}</span>
                    ))}
                  </div>
                  {s.detail?.map((d) => (
                    <div className="detail" key={d.label}><small>{d.label}</small>{d.text}</div>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          <div className="side">
            <section className="panel paper-block" aria-label="Original email">
              <h3>Original email</h3>
              <div className="mail-meta">{email.from.name} ({email.from.email}), {shortTime(email.received_at)}{email.attachments.length ? ', attached: ' + email.attachments.join(', ') : ''}</div>
              <div className="mail">{email.body}</div>
            </section>
            <section className="panel paper-block" aria-label="Reply draft">
              <h3>
                Reply draft
                <span className="chip">stored, never sent</span>
              </h3>
              {row.reply_draft ? <div className="mail">{row.reply_draft}</div> : <p className="muted">No reply for this email: {row.action_taken.replace(/_/g, ' ')}.</p>}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
