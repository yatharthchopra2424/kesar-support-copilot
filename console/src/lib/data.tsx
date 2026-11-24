import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DATA_API } from '../config';
import type { AuditRow, Expected, Policy, RunData, ScoreFile, TestEmail, TicketRow, Version } from './types';
import v2Snapshot from '../data/v2.json';
import v1Snapshot from '../data/v1.json';
import scoreV2 from '../data/score_v2.json';
import scoreV1 from '../data/score_v1.json';
import emailsFile from '../data/emails.json';
import expectedFile from '../data/expected.json';
import policyFile from '../data/policy.json';

export const EMAILS = (emailsFile as { emails: TestEmail[] }).emails;
export const EXPECTED = (expectedFile as { emails: Record<string, Expected> }).emails;
export const POLICY = policyFile as unknown as Policy;
export const SCORES: Record<Version, ScoreFile> = { v2: scoreV2 as ScoreFile, v1: scoreV1 as ScoreFile };
const SNAPSHOT: Record<Version, RunData> = { v2: v2Snapshot as unknown as RunData, v1: v1Snapshot as unknown as RunData };

/** When the bundled runs (the ones the Evals scores were computed from) were fetched from the Sheet. */
export const SNAPSHOT_FETCHED = { v2: SNAPSHOT.v2.fetched_at, v1: SNAPSHOT.v1.fetched_at };

export type Source = 'snapshot' | 'live';
interface Slot {
  run: RunData;
  source: Source;
  loading: boolean;
  error: string;
}

interface Ctx {
  version: Version;
  setVersion: (v: Version) => void;
  audit: AuditRow[];
  tickets: TicketRow[];
  runs: Record<Version, RunData>;
  source: Source;
  loading: boolean;
  error: string;
  fetchedAt: string;
  refresh: () => void;
}
const DataCtx = createContext<Ctx | null>(null);

async function fetchLive(version: Version): Promise<RunData> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(version === 'v1' ? DATA_API + '?v=v1' : DATA_API, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = (await res.json()) as RunData;
    if (!Array.isArray(data.audit) || data.audit.length === 0) throw new Error('empty response');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState<Version>('v2');
  const [slots, setSlots] = useState<Record<Version, Slot>>({
    v2: { run: SNAPSHOT.v2, source: 'snapshot', loading: false, error: '' },
    v1: { run: SNAPSHOT.v1, source: 'snapshot', loading: false, error: '' },
  });

  const load = useCallback((v: Version) => {
    setSlots((s) => ({ ...s, [v]: { ...s[v], loading: true, error: '' } }));
    fetchLive(v)
      .then((run) => setSlots((s) => ({ ...s, [v]: { run, source: 'live', loading: false, error: '' } })))
      .catch((e: Error) =>
        setSlots((s) => ({
          ...s,
          [v]: { ...s[v], loading: false, error: 'Live data unavailable (' + e.message + '). Showing the saved snapshot.' },
        })),
      );
  }, []);

  // Show the snapshot at once, then try the live data in the background.
  useEffect(() => {
    load('v2');
  }, [load]);

  const cur = slots[version];
  const value = useMemo<Ctx>(
    () => ({
      version,
      setVersion,
      audit: cur.run.audit,
      tickets: cur.run.tickets,
      runs: { v2: slots.v2.run, v1: slots.v1.run },
      source: cur.source,
      loading: cur.loading,
      error: cur.error,
      fetchedAt: cur.run.fetched_at,
      refresh: () => load(version),
    }),
    [version, cur, slots.v2.run, slots.v1.run, load],
  );
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData outside DataProvider');
  return c;
}
