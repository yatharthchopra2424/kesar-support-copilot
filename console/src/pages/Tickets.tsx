import { useData } from '../lib/data';
import { shortTime } from '../lib/format';
import { PageHead } from '../ui';
import type { TicketRow } from '../lib/types';

const COLS = ['High', 'Medium', 'Low'];

function Card({ t }: { t: TicketRow }) {
  const ids = String(t.email_ids).split(',').map((s) => s.trim()).filter(Boolean);
  const merged = ids.length > 1;
  return (
    <article className={'panel ticket' + (merged ? ' merged' : '')}>
      <div className="top">
        <b className="mono">{t.ticket_id}</b>
        <span className="chip">{t.order_id}</span>
        <span className="chip">{String(t.intent).replace(/_/g, ' ')}</span>
        {merged ? <span className="chip accent">{ids.length} emails, one ticket</span> : null}
      </div>
      <p>{t.summary}</p>
      <div className="ids">
        <span>From emails</span>
        {ids.map((id) => <a key={id} href={'#/trace/' + id}>{id}</a>)}
        <span style={{ marginLeft: 'auto' }}>{t.status}, updated {shortTime(t.updated_at)}</span>
      </div>
      {merged ? (
        <p className="muted" style={{ fontSize: 12.5 }}>
          Later emails about the same order were added to this ticket instead of opening a second one.
        </p>
      ) : null}
    </article>
  );
}

export function Tickets() {
  const { tickets, audit } = useData();
  const withTicket = audit.filter((r) => r.ticket_id).length;
  const orders = new Set(tickets.filter((t) => String(t.status).toLowerCase() !== 'closed').map((t) => t.order_id));
  const dupes = tickets.filter((t) => String(t.status).toLowerCase() !== 'closed').length - orders.size;
  const merged = tickets.filter((t) => String(t.email_ids).split(',').length > 1);

  return (
    <>
      <PageHead title="Tickets">
        One open ticket per order. A second email about the same order updates the ticket that already exists.
      </PageHead>
      <div className="panel summary-strip">
        <div><b>{withTicket}</b><span>emails needed a ticket</span></div>
        <div><b>{tickets.length}</b><span>tickets exist</span></div>
        <div><b>{merged.length}</b><span>{merged.length === 1 ? 'ticket merged' : 'tickets merged'}{merged.length ? ' (' + merged.map((t) => t.ticket_id).join(', ') + ')' : ''}</span></div>
        <div><b style={{ color: dupes ? 'var(--stop)' : 'var(--ok)' }}>{dupes}</b><span>duplicate open tickets</span></div>
      </div>
      {tickets.length === 0 ? (
        <div className="panel empty">No tickets in this run yet. Process the return and complaint emails and refresh.</div>
      ) : (
        <div className="board">
          {COLS.map((p) => {
            const list = tickets.filter((t) => t.priority === p);
            return (
              <section className="col" key={p} aria-label={p + ' priority'}>
                <h2><span className={'dot ' + (p === 'High' ? 'stop' : p === 'Medium' ? 'warn' : '')} aria-hidden />{p} priority <span className="muted">{list.length}</span></h2>
                <div className="stack">
                  {list.map((t) => <Card key={t.ticket_id} t={t} />)}
                  {list.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No {p.toLowerCase()} priority tickets.</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
