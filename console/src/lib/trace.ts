// Turns one Audit Log row (plus the original email) into the steps shown on the Trace page.
// Everything comes from stored fields (trace_json, facts_json); nothing is re-computed here.
import { actionLabel, num, parseJson, reasonLabel, truthy } from './format';
import type { AuditRow, Facts, TestEmail, TraceStep } from './types';

export type Actor = 'LLM' | 'Code' | 'Input';
export interface Fact {
  k: string;
  v: string;
}
export interface Step {
  id: string;
  title: string;
  actor: Actor;
  tone: 'ok' | 'warn' | 'stop' | 'skip';
  headline: string;
  facts: Fact[];
  detail?: { label: string; text: string }[];
}

type Raw = Record<string, any>;
const f = (k: string, v: unknown): Fact => ({ k, v: v === undefined || v === null || v === '' ? 'none' : String(v) });

export function buildTrace(row: AuditRow, email: TestEmail | undefined, version: 'v1' | 'v2'): Step[] {
  const trace = parseJson<{ steps: TraceStep[] }>(row.trace_json, { steps: [] });
  const facts = parseJson<Facts>(row.facts_json, {});
  const step = (n: string) => trace.steps.find((s) => s.name === n) as Raw | undefined;
  const cls = step('classify');
  const agent = step('agent');
  const guard = step('guard');
  const tk = step('ticket');
  const out: Step[] = [];

  out.push({
    id: 'receive',
    title: 'Email received',
    actor: 'Input',
    tone: 'ok',
    headline: email ? email.subject : row.email_id,
    facts: [
      f('From', email?.from.email ?? row.from_email),
      f('Attachments', email?.attachments.length ? email.attachments.join(', ') : 'none'),
      f('Treated as', 'untrusted text'),
    ],
  });

  out.push({
    id: 'classify',
    title: 'Classify',
    actor: 'LLM',
    tone: row.error ? 'stop' : 'ok',
    headline: `${row.intent}${row.secondary_intent ? ' + ' + row.secondary_intent : ''}, ${row.sentiment}, ${row.language}`,
    facts: [
      f('Order id found in email', row.order_id || 'none'),
      f('Confidence', row.confidence),
      f('Model', cls?.model ?? row.model),
      ...(cls?.ms !== undefined ? [f('Time', num(cls.ms) + ' ms')] : []),
      ...(cls?.valid_first_try !== undefined
        ? [f('Valid JSON first try', cls.valid_first_try ? 'yes' : 'no, repaired'), f('Fallback used', cls.fallback ? 'yes' : 'no')]
        : []),
      ...(cls?.tokens_out !== undefined ? [f('Tokens in / out', `${cls.tokens_in} / ${cls.tokens_out}`)] : [f('Tokens in', cls?.tokens_in)]),
    ],
    detail: row.notes ? [{ label: 'Summary written by the model', text: row.notes.split(' | ')[0] }] : undefined,
  });

  if (version === 'v2') {
    const lk = facts.lookup;
    if (lk) {
      const how = lk.method === 'by_id' ? 'by order id' : lk.method === 'by_email' ? 'by sender email' : 'not matched';
      out.push({
        id: 'lookup',
        title: 'Look up order',
        actor: 'Code',
        tone: lk.privacy_blocked ? 'stop' : lk.found ? 'ok' : 'warn',
        headline: lk.privacy_blocked ? 'Blocked: sender is not the order owner' : lk.found ? `${lk.order_id} found ${how}` : 'No order to look up',
        facts: [f('Method', lk.method), f('Found', lk.found ? 'yes' : 'no'), f('Privacy block', lk.privacy_blocked ? 'yes, no order details shared' : 'no')],
      });
    }
    const el = facts.eligibility as Raw | undefined;
    if (el && Object.keys(el).length) {
      const status = String(el.status);
      out.push({
        id: 'eligibility',
        title: 'Check eligibility',
        actor: 'Code',
        tone: status === 'ineligible' ? 'warn' : 'ok',
        headline: status.replace(/_/g, ' '),
        facts: [
          f('Path', String(el.path).replace(/_/g, ' ')),
          f('Days since delivery', el.days_since_delivery),
          ...(el.within_7_day_window !== undefined
            ? [f('Within 7-day window', el.within_7_day_window ? 'yes' : 'no'), f('Item condition', el.item_condition)]
            : []),
          ...(el.within_48h_window !== undefined
            ? [f('Within 48 hours', el.within_48h_window ? 'yes' : 'no'), f('Photos attached', el.photos_attached ? 'yes' : 'no')]
            : []),
          ...(Array.isArray(el.reasons) ? [f('Why not', (el.reasons as string[]).map((r) => r.replace(/_/g, ' ')).join(', '))] : []),
          ...(facts.refund_inr ? [f('Refund on record', '₹' + facts.refund_inr + ' (not approved)')] : []),
        ],
      });
    }
    const reasons = facts.reasons ?? [];
    out.push({
      id: 'decide',
      title: 'Decide',
      actor: 'Code',
      tone: truthy(row.needs_human) ? 'warn' : 'ok',
      headline: actionLabel(row.action_taken),
      facts: [
        f('Action', row.action_taken),
        f('Needs a human', truthy(row.needs_human) ? 'yes' : 'no'),
        f('Ticket priority', facts.priority),
        f('Injection spotted', facts.injection ? 'yes, ignored' : 'no'),
      ],
      detail: reasons.length ? [{ label: 'Why a person should look', text: reasons.map(reasonLabel).join('; ') }] : undefined,
    });
  }

  if (agent) {
    const tools = (agent.tools as string[] | undefined) ?? [];
    out.push({
      id: 'agent',
      title: 'Draft reply',
      actor: 'LLM',
      tone: row.reply_draft ? 'ok' : 'skip',
      headline: tools.length ? `Agent used ${tools.join(' and ')}` : 'Agent used no tools',
      facts: [
        f('Tools called', tools.join(', ') || 'none'),
        f('Tokens in / out (estimate)', `${agent.tokens_in_est} / ${agent.tokens_out_est}`),
        f('Draft stored, not sent', 'yes'),
      ],
    });
  } else if (version === 'v2') {
    out.push({
      id: 'agent',
      title: 'Draft reply',
      actor: 'LLM',
      tone: 'skip',
      headline: 'Skipped, no reply needed',
      facts: [f('Reason', 'the decision step logged this email without a reply')],
    });
  }

  if (guard) {
    const g = (guard.flags ?? {}) as { hard?: string[]; soft?: string[]; repaired?: string[] };
    const hard = g.hard ?? [];
    const soft = g.soft ?? [];
    const rep = g.repaired ?? [];
    const rejected = (guard.rejected_draft as string | undefined) ?? '';
    out.push({
      id: 'guard',
      title: 'Output guard',
      actor: 'Code',
      tone: hard.length ? 'stop' : soft.length || rep.length ? 'warn' : 'ok',
      headline: hard.length ? 'Draft rejected, safe holding reply used' : soft.length || rep.length ? 'Passed with notes' : 'Passed, no flags',
      facts: [f('Hard flags', hard.join(', ') || 'none'), f('Soft flags', soft.join(', ') || 'none'), f('Auto-repaired', rep.join(', ') || 'none')],
      detail: rejected
        ? [
            { label: 'Rejected draft', text: rejected },
            { label: 'Replaced by', text: row.reply_draft },
          ]
        : undefined,
    });
  } else if (version === 'v1') {
    out.push({
      id: 'guard',
      title: 'Output guard',
      actor: 'Code',
      tone: 'skip',
      headline: 'v1 has no guard: the draft goes straight to the log',
      facts: [f('Checks run', 'none')],
    });
  }

  const mode = (tk?.mode as string | undefined) ?? (row.ticket_id ? 'recorded' : 'none');
  const modeText: Record<string, string> = {
    create: 'New ticket opened',
    update: 'Added to the open ticket for this order',
    noop: 'Already on the ticket (re-run, nothing duplicated)',
    none: 'No ticket needed',
    recorded: 'Ticket recorded',
  };
  out.push({
    id: 'ticket',
    title: 'Ticket',
    actor: 'Code',
    tone: row.ticket_id ? 'ok' : 'skip',
    headline: row.ticket_id ? `${row.ticket_id}: ${modeText[mode] ?? mode}` : modeText.none,
    facts: [f('Ticket', row.ticket_id), f('Mode', mode), f('Rule', 'one open ticket per order')],
  });

  out.push({
    id: 'log',
    title: 'Audit log',
    actor: 'Code',
    tone: row.error ? 'stop' : 'ok',
    headline: row.error ? 'Row written with an error' : 'One row written, keyed on email id',
    facts: [
      f('Written at', row.processed_at),
      f('Latency', num(row.latency_ms) + ' ms'),
      f('Prompt version', row.prompt_version || version),
      f('Error', row.error || 'none'),
    ],
  });
  return out;
}
