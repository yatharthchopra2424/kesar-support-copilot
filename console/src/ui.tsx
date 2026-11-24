import type { ReactNode } from 'react';
import { INTENT_LABEL, truthy } from './lib/format';

export function IntentChip({ intent }: { intent: string }) {
  const tone = intent === 'complaint' ? 'warn' : intent === 'return_refund' ? 'accent' : '';
  return <span className={'chip ' + tone}>{INTENT_LABEL[intent] ?? intent}</span>;
}

export function HumanFlag({ value }: { value: unknown }) {
  const yes = truthy(value);
  return (
    <span className={'chip ' + (yes ? 'warn' : '')} title={yes ? 'A person must look at this before anything goes out' : 'No review needed'}>
      <span className={'dot ' + (yes ? 'warn' : '')} aria-hidden />
      {yes ? 'Needs human' : 'Automatic'}
    </span>
  );
}

export function PageHead({ title, children, right }: { title: string; children?: ReactNode; right?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {children ? <p>{children}</p> : null}
      </div>
      {right}
    </header>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ done, total }: { done: number; total: number }) {
  const p = total ? (100 * done) / total : 0;
  const cls = p >= 90 ? '' : p >= 60 ? 'mid' : 'low';
  return (
    <div className="bar" role="img" aria-label={`${Math.round(p)} percent`}>
      <i className={cls} style={{ width: p + '%' }} />
    </div>
  );
}
