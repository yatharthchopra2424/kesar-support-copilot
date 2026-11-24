import { Fragment, useState } from 'react';
import { DownloadSimple } from '@phosphor-icons/react';
import { useData } from '../lib/data';
import { num, shortTime, truthy } from '../lib/format';
import { setQuery, type Route } from '../lib/route';
import { HumanFlag, IntentChip, PageHead, Seg } from '../ui';
import type { AuditRow } from '../lib/types';

type Filter = 'all' | 'human' | 'flags' | 'errors';

function toCsv(rows: AuditRow[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]).filter((c) => c !== 'row_number');
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(','))].join('\r\n');
}

export function Audit({ route }: { route: Route }) {
  const { audit, version } = useData();
  const [open, setOpen] = useState<string>('');
  const f = (route.query.get('f') as Filter) || 'all';
  const rows = audit.filter((r) => {
    if (f === 'human') return truthy(r.needs_human);
    if (f === 'flags') return !!r.guard_flags;
    if (f === 'errors') return !!r.error;
    return true;
  });

  const download = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + toCsv(audit)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${version}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        title="Audit log"
        right={<button className="btn" type="button" onClick={download}><DownloadSimple size={16} /> Download CSV</button>}
      >
        One row per email, written by the workflow. This is the same table as the Google Sheet tab, with the reply draft and the full trace behind each row.
      </PageHead>
      <div className="toolbar">
        <Seg<Filter>
          label="Filter rows"
          value={f}
          onChange={(v) => setQuery(route, { f: v === 'all' ? undefined : v })}
          options={[{ v: 'all', label: 'All rows' }, { v: 'human', label: 'Needs human' }, { v: 'flags', label: 'Guard flags' }, { v: 'errors', label: 'Errors' }]}
        />
        <span className="muted" aria-live="polite">{rows.length} of {audit.length} rows</span>
      </div>
      <div className="panel scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th><th>Received</th><th>Intent</th><th>Order</th><th>Action</th><th>Review</th><th>Ticket</th>
              <th className="num">Conf.</th><th className="num">Tokens</th><th className="num">Latency</th><th>Guard flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open === r.email_id;
              return (
                <Fragment key={r.email_id}>
                  <tr className="link" onClick={() => setOpen(isOpen ? '' : r.email_id)} aria-expanded={isOpen}>
                    <td><a className="id" href={'#/trace/' + r.email_id} onClick={(e) => e.stopPropagation()}>{r.email_id}</a></td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{shortTime(r.received_at)}</td>
                    <td><IntentChip intent={r.intent} /></td>
                    <td className="mono">{r.order_id}</td>
                    <td className="mono trunc">{r.action_taken}</td>
                    <td><HumanFlag value={r.needs_human} /></td>
                    <td className="mono">{r.ticket_id}</td>
                    <td className="num">{r.confidence}</td>
                    <td className="num">{(num(r.tokens_in) + num(r.tokens_out)).toLocaleString('en-IN')}</td>
                    <td className="num">{(num(r.latency_ms) / 1000).toFixed(1)}s</td>
                    <td className="mono trunc">{r.guard_flags}</td>
                  </tr>
                  {isOpen ? (
                    <tr className="expand">
                      <td colSpan={11}>
                        <div className="two">
                          <div>
                            <b>Reply draft</b>
                            <div className="mail" style={{ marginTop: 6 }}>{r.reply_draft || 'No reply for this email.'}</div>
                          </div>
                          <div>
                            <b>Notes</b>
                            <p className="muted" style={{ margin: '6px 0 10px' }}>{r.notes || 'none'}</p>
                            <p className="muted">
                              From {r.from_email}. Model {r.model}. Processed {r.processed_at}. Error: {r.error || 'none'}.
                              <br />
                              <a href={'#/trace/' + r.email_id}>Open the full trace</a>
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="empty">No rows match this filter. Pick All rows.</div> : null}
      </div>
    </>
  );
}
