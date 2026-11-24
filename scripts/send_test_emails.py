#!/usr/bin/env python3
"""
Send the Kesar & Co. test emails to your workflow's webhook, one at a time.

Uses only the Python standard library (Python 3.8+). No pip install needed.

Examples
--------
  # Send all 25 emails, 5 seconds apart
  python scripts/send_test_emails.py --url https://your-n8n-host/webhook/support-email

  # Send only a few emails
  python scripts/send_test_emails.py --url <WEBHOOK_URL> --only E01,E07,E12

  # Preview what would be sent, without sending
  python scripts/send_test_emails.py --url <WEBHOOK_URL> --dry-run

  # Add a header (e.g. if your webhook uses header auth)
  python scripts/send_test_emails.py --url <WEBHOOK_URL> --header "X-Webhook-Secret: abc123"

Each request is an HTTP POST with Content-Type: application/json and the body
set to ONE email object exactly as it appears in data/test_emails.json, e.g.:

  {
    "id": "E01",
    "received_at": "2026-11-20T09:02:00+05:30",
    "from": {"name": "Ananya Rao", "email": "ananya.rao@example.com"},
    "to": "support@kesarandco.example",
    "subject": "...",
    "body": "...",
    "attachments": []
  }
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_FILE = Path(__file__).resolve().parent.parent / "data" / "test_emails.json"


def parse_args():
    p = argparse.ArgumentParser(description="POST test emails to a webhook, one by one.")
    p.add_argument("--url", required=True, help="Your workflow's webhook URL")
    p.add_argument("--file", default=str(DEFAULT_FILE), help="Path to test_emails.json")
    p.add_argument("--delay", type=float, default=5.0,
                   help="Seconds to wait between emails (default: 5). Keep this > 0 to respect API rate limits.")
    p.add_argument("--only", default="", help="Comma-separated email IDs to send, e.g. E01,E07")
    p.add_argument("--header", action="append", default=[],
                   help='Extra HTTP header, e.g. "X-Webhook-Secret: abc". Can be repeated.')
    p.add_argument("--timeout", type=float, default=60.0, help="Request timeout in seconds (default: 60)")
    p.add_argument("--dry-run", action="store_true", help="Print what would be sent without sending")
    return p.parse_args()


def load_emails(path, only):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    emails = data["emails"] if isinstance(data, dict) else data
    if only:
        wanted = {x.strip().upper() for x in only.split(",") if x.strip()}
        missing = wanted - {e["id"] for e in emails}
        if missing:
            sys.exit(f"Unknown email IDs: {', '.join(sorted(missing))}")
        emails = [e for e in emails if e["id"] in wanted]
    return emails


def build_headers(extra):
    headers = {"Content-Type": "application/json; charset=utf-8", "User-Agent": "kesar-test-sender/1.0"}
    for h in extra:
        if ":" not in h:
            sys.exit(f'Bad --header value (expected "Name: value"): {h}')
        name, value = h.split(":", 1)
        headers[name.strip()] = value.strip()
    return headers


def send(url, email, headers, timeout):
    body = json.dumps(email, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(300).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(300).decode("utf-8", errors="replace")
    except Exception as e:  # network errors, timeouts
        return None, str(e)


def main():
    args = parse_args()
    emails = load_emails(args.file, args.only)
    headers = build_headers(args.header)

    print(f"Sending {len(emails)} email(s) to {args.url} (delay {args.delay}s)\n")
    ok = failed = 0
    for i, email in enumerate(emails, 1):
        label = f"[{i}/{len(emails)}] {email['id']}  {email['subject'][:60]}"
        if args.dry_run:
            print(f"{label}  -> DRY RUN")
            continue
        status, text = send(args.url, email, headers, args.timeout)
        if status and 200 <= status < 300:
            ok += 1
            print(f"{label}  -> {status} OK")
        else:
            failed += 1
            print(f"{label}  -> FAILED ({status}): {text.strip()[:200]}")
        if i < len(emails):
            time.sleep(args.delay)

    if not args.dry_run:
        print(f"\nDone. {ok} succeeded, {failed} failed.")
        sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
