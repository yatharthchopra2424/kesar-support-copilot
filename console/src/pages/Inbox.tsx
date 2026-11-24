import { MagnifyingGlass } from '@phosphor-icons/react';
import { actionLabel, shortTime, truthy } from '../lib/format';
import { EMAILS, useData } from '../lib/data';
import { setQuery, type Route } from '../lib/route';
import { HumanFlag, IntentChip, PageHead, Seg } from '../ui';

type Filter = 'all' | 'human' | 'ticket' | 'auto';

export function Inbox({ route }: { route: Route }) {
  const { audit, version } = useData();
  const f = (route.query.get('f') as Filter) || 'all';
  const q = (route.query.get('q') ?? '').toLowerCase();
  const byId = new Map(audit.map((r) => [r.email_id, r]));

  const rows = EMAILS.map((e) => ({ e, r: byId.get(e.id) })).filter(({ e, r }) => {
    if (f === 'human' && !(r && truthy(r.needs_human))) return false;
    if (f === 'ticket' && !r?.ticket_id) return false;
    if (f === 'auto' && !(r && !truthy(r.needs_human))) return false;
    return !q || (e.id + e.subject + e.from.email + e.body).toLowerCase().includes(q);
  });

  const human = audit.filter((r) => truthy(r.needs_human)).length;
  return (
    <>
      <PageHead title="Inbox">
        {EMAILS.length} test emails received 20 Nov 2026. Open any row to see each step the copilot took, in order. {human} of {audit.length} were sent to a person
        {version === 'v1' ? ' (v1 baseline shown: it missed several that v2 catches)' : ''}.
      </PageHead>
      <div className="toolbar">
        <Seg<Filter>
          label="Filter emails"
          value={f}
          onChange={(v) => setQuery(route, { f: v === 'all' ? undefined : v })}
          options={[{ v: 'all', label: 'All' }, { v: 'human', label: 'Needs human' }, { v: 'ticket', label: 'Has ticket' }, { v: 'auto', label: 'Automatic' }]}
        />
        <label className="field grow">
          <span className="sr">Search emails</span>
          <span style={{ position: 'relative', display: 'block' }}>
            <MagnifyingGlass size={16} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} aria-hidden />
            <input
              className="input"
              style={{ paddingLeft: 32, width: '100%' }}
              type="search"
              placeholder="Search emails"
              value={route.query.get('q') ?? ''}
              onChange={(ev) => setQuery(route, { q: ev.target.value || undefined })}
            />
          </span>
        </label>
        <span className="muted" aria-live="polite">{rows.length} shown</span>
      </div>
      <div className="panel scroll">
        <table className="tbl">
          <thead>
            <tr><th>Email</th><th className="hide-m">Received</th><th className="hide-m">From</th><th>Subject</th><th className="hide-m">Intent</th><th className="hide-m">What the copilot did</th><th>Review</th><th className="hide-m">Ticket</th></tr>
          </thead>
          <tbody>
            {rows.map(({ e, r }) => (
              <tr key={e.id} className="link" onClick={() => (location.hash = '#/trace/' + e.id)}>
                <td><a className="id" href={'#/trace/' + e.id} onClick={(ev) => ev.stopPropagation()}>{e.id}</a></td>
                <td className="muted hide-m" style={{ whiteSpace: 'nowrap' }}>{shortTime(e.received_at)}</td>
                <td className="trunc hide-m">{e.from.email}</td>
                <td className="trunc subject">{e.subject}</td>
                <td className="hide-m">{r ? <IntentChip intent={r.intent} /> : <span className="muted">Not processed</span>}</td>
                <td className="trunc hide-m">{r ? actionLabel(r.action_taken) : ''}</td>
                <td>{r ? <HumanFlag value={r.needs_human} /> : null}</td>
                <td className="mono hide-m">{r?.ticket_id ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="empty">No email matches this filter. Clear the search or pick All.</div> : null}
      </div>
    </>
  );
}
