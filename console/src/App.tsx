import { useEffect } from 'react';
import { ArrowsClockwise, Coins, Flask, GitBranch, SlidersHorizontal, Table, Ticket, Tray, type Icon } from '@phosphor-icons/react';
import { useData } from './lib/data';
import { lastTraceId, useRoute } from './lib/route';
import { Seg } from './ui';
import { Inbox } from './pages/Inbox';
import { Trace } from './pages/Trace';
import { Tickets } from './pages/Tickets';
import { Audit } from './pages/Audit';
import { Evals } from './pages/Evals';
import { Cost } from './pages/Cost';
import { Policy } from './pages/Policy';

const PAGES: { key: string; label: string; Icon: Icon }[] = [
  { key: 'inbox', label: 'Inbox', Icon: Tray },
  { key: 'trace', label: 'Trace', Icon: GitBranch },
  { key: 'tickets', label: 'Tickets', Icon: Ticket },
  { key: 'audit', label: 'Audit log', Icon: Table },
  { key: 'evals', label: 'Evals', Icon: Flask },
  { key: 'cost', label: 'Cost', Icon: Coins },
  { key: 'policy', label: 'Policy', Icon: SlidersHorizontal },
];

export function App() {
  const route = useRoute();
  const { version, setVersion, source, loading, error, fetchedAt, refresh, audit, tickets } = useData();
  const page = route.path[0] || 'inbox';

  useEffect(() => {
    const names: Record<string, string> = { inbox: 'Inbox', trace: 'Trace ' + (route.path[1] ?? ''), tickets: 'Tickets', audit: 'Audit log', evals: 'Evals', cost: 'Cost', policy: 'Policy' };
    document.title = (names[page] ?? 'Console') + ' · Kesar Ops Console';
  }, [page, route.path]);

  // A new page or a new email starts at the top, like a normal link click.
  const where = route.path.join('/');
  useEffect(() => window.scrollTo(0, 0), [where]);

  const href = (k: string) => (k === 'trace' ? `#/trace/${lastTraceId()}` : `#/${k}`);
  const counts: Record<string, number> = { inbox: audit.length, tickets: tickets.length };

  let view;
  switch (page) {
    case 'trace': view = <Trace id={route.path[1] ?? lastTraceId()} />; break;
    case 'tickets': view = <Tickets />; break;
    case 'audit': view = <Audit route={route} />; break;
    case 'evals': view = <Evals />; break;
    case 'cost': view = <Cost />; break;
    case 'policy': view = <Policy />; break;
    default: view = <Inbox route={route} />;
  }

  const versionSwitch = (
    <Seg label="Workflow version" value={version} onChange={setVersion} options={[{ v: 'v2', label: 'v2 final' }, { v: 'v1', label: 'v1 baseline' }]} />
  );

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <GitBranch size={16} weight="bold" />
          </div>
          <div>
            <b>Kesar Ops Console</b>
            <span>Support copilot</span>
          </div>
        </div>
        <nav className="nav" aria-label="Pages">
          {PAGES.map(({ key, label, Icon }) => (
            <a key={key} href={href(key)} aria-current={page === key ? 'page' : undefined}>
              <Icon size={18} />
              {label}
              {counts[key] !== undefined ? <span className="count">{counts[key]}</span> : null}
            </a>
          ))}
        </nav>
        <div className="rail-foot">
          {versionSwitch}
          <div className="status" aria-live="polite">
            <div className="row">
              <span className={'dot ' + (source === 'live' ? 'live' : '')} aria-hidden />
              {loading ? 'Loading live data…' : source === 'live' ? 'Live from the Sheet' : 'Saved snapshot'}
            </div>
            <span>{fetchedAt ? 'Fetched ' + new Date(fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
            <button className="btn" type="button" onClick={refresh} disabled={loading}>
              <ArrowsClockwise size={14} /> Refresh
            </button>
          </div>
        </div>
      </aside>
      <main className="main" id="main">
        {error ? <div className="banner" role="status">{error}</div> : null}
        {view}
      </main>
      <nav className="tabbar" aria-label="Pages">
        {PAGES.map(({ key, label, Icon }) => (
          <a key={key} href={href(key)} aria-current={page === key ? 'page' : undefined}>
            <Icon size={20} />
            {label.replace('Audit log', 'Audit')}
          </a>
        ))}
      </nav>
    </div>
  );
}
