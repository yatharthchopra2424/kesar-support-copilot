export const truthy = (v: unknown): boolean => v === true || String(v).trim().toUpperCase() === 'TRUE';
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const INTENT_LABEL: Record<string, string> = {
  order_status: 'Order status',
  product_query: 'Product query',
  return_refund: 'Return or refund',
  complaint: 'Complaint',
  other: 'Other',
};

export const ACTION_LABEL: Record<string, string> = {
  draft_reply: 'Reply drafted',
  log_only_spam: 'Logged as spam',
  log_only_thanks: 'Logged, thanks note',
  partnership_redirect_draft: 'Redirect to partnerships',
  holding_reply_escalated: 'Holding reply, escalated',
  privacy_refusal_draft: 'Privacy refusal',
  order_not_found_draft: 'Order not found reply',
  ask_order_id_draft: 'Asked for order id',
  medical_safe_reply: 'Safe reply, no medical advice',
  ticket_and_draft: 'Ticket and reply',
  ticket_denial_draft: 'Return not eligible, ticket',
  missing_item_ticket_draft: 'Missing item, ticket',
  ask_photos_ticket_draft: 'Asked for photos, ticket',
  photos_received_ticket_draft: 'Photos received, ticket',
  ticket_return_draft: 'Return approved for pickup, ticket',
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? (a ? a.replace(/_/g, ' ') : 'No action recorded');

export const REASON_LABEL: Record<string, string> = {
  privacy_mismatch: 'Sender email does not match the order',
  angry_customer: 'Customer is angry',
  high_value_refund: 'Refund at or above the high-value limit',
  prompt_injection_attempt: 'Email tried to give the copilot instructions',
  medical_question: 'Medical question',
  refund_denied_review: 'Refund denied, a person reviews it',
  not_in_faq: 'Answer is not in the FAQ',
  faq_gap: 'FAQ gap',
  order_unidentified: 'No order id or matching sender',
  order_not_found: 'Order id not found',
  photo_verification: 'Photos need checking',
  packing_record_check: 'Packing record needs checking',
  late_damage_report: 'Damage reported after 48 hours',
  low_confidence: 'Classifier confidence below the threshold',
};
export const reasonLabel = (r: string) => REASON_LABEL[r] ?? r.replace(/_/g, ' ');

/** "2026-11-20T09:41:00+05:30" -> "20 Nov, 09:41" (kept in the email's own timezone, never the viewer's). */
export function shortTime(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return `${Number(m[3])} ${mon}, ${m[4]}:${m[5]}`;
}

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const usd = (n: number, d = 4) => '$' + n.toFixed(d);
export const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
export const secs = (ms: number) => (ms / 1000).toFixed(1) + 's';

export function parseJson<T>(s: string | undefined, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
