// Shapes of the data the Console reads. They match the Audit Log / Tickets tabs
// (the data API returns the sheet rows as JSON) and the files in /data.

export type Version = 'v2' | 'v1';

export interface AuditRow {
  email_id: string;
  received_at: string;
  from_email: string;
  intent: string;
  secondary_intent: string;
  order_id: string;
  language: string;
  sentiment: string;
  confidence: number | string;
  order_found: boolean | string;
  action_taken: string;
  needs_human: boolean | string;
  ticket_id: string;
  reply_draft: string;
  prompt_version: string;
  processed_at: string;
  error: string;
  notes: string;
  model: string;
  tokens_in: number | string;
  tokens_out: number | string;
  cost_usd: string;
  latency_ms: number | string;
  guard_flags: string;
  facts_json: string;
  trace_json: string;
}

export interface TicketRow {
  ticket_id: string;
  created_at: string;
  updated_at: string;
  order_id: string;
  customer_email: string;
  email_ids: string;
  intent: string;
  priority: string;
  status: string;
  summary: string;
  notes: string;
}

export interface RunData {
  version: string;
  fetched_at: string;
  audit: AuditRow[];
  tickets: TicketRow[];
}

export interface TestEmail {
  id: string;
  received_at: string;
  from: { name: string; email: string };
  to: string;
  subject: string;
  body: string;
  attachments: string[];
}

export interface Expected {
  intent: string;
  order_id: string;
  order_found: boolean;
  language: string;
  needs_human: boolean;
  reply: boolean;
  ticket: 'none' | 'new' | 'update';
  ticket_of?: string;
  action: string;
  priority?: string;
  judgment?: boolean;
  [k: string]: unknown;
}

export interface ScoreFile {
  label: string;
  checks: { key: string; name: string; passed: number; total: number }[];
  emails: { id: string; ok: boolean; problems: string[]; soft: string[] }[];
  reliability: {
    rows: number;
    tickets: number;
    missing: string[];
    multi_row: string[];
    duplicate_open_tickets: Record<string, string[]>;
    errors: string[];
    hard_flags: string[][];
    tokens_in: number;
    tokens_out: number;
    avg_tokens: number;
    avg_latency_ms: number;
    max_latency_ms: number;
  };
}

export interface Policy {
  return_window_days: number;
  damage_report_window_hours: number;
  free_shipping_min_inr: number;
  shipping_fee_inr: number;
  cod_limit_inr: number;
  cod_fee_inr: number;
  confidence_threshold: number;
  high_value_inr: number;
  scenario_today: string;
  [k: string]: unknown;
}

export interface TraceStep {
  name: string;
  [k: string]: unknown;
}
export interface Facts {
  lookup?: { method: string; order_id?: string; found: boolean; privacy_blocked: boolean };
  eligibility?: Record<string, unknown>;
  refund_inr?: number | null;
  refund_method?: string;
  days_since_delivery?: number | null;
  priority?: string;
  injection?: boolean;
  reasons?: string[];
}
