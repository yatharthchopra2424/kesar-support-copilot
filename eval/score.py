#!/usr/bin/env python3
"""
Scores a run of the copilot against the answer key (eval/expected.json).

Reads the Audit Log and Tickets that the workflow wrote. Works for any version (v1, v2):
checks that do not depend on a version's internal names are scored for everyone; the
"action name" check is only meaningful for v2 and is reported on its own line.

Usage (standard library only, Python 3.8+):
  python eval/score.py --url "https://<n8n>/webhook/<data-path>"            # final system (v2)
  python eval/score.py --url "https://<n8n>/webhook/<data-path>?v=v1" --label v1
  python eval/score.py --audit audit.csv --tickets tickets.csv               # Sheet > File > Download > CSV
  add  --markdown report.md  to also write the tables for TEST_REPORT

Nothing here calls an LLM. It only reads the sheet output and compares it to the key.
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INTENTS = {"order_status", "product_query", "return_refund", "complaint", "other"}
SENTIMENTS = {"positive", "neutral", "negative", "angry"}
LANGS = {"en", "hi", "hinglish"}
SIGN = "Warm regards,\nTeam Kesar"
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")
POLICY_AMOUNTS = {999, 79, 5000, 49}


def load_url(url):
    req = urllib.request.Request(url, headers={"User-Agent": "kesar-eval/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def truthy(v):
    return str(v).strip().upper() == "TRUE"


def sentences(reply):
    body = reply.replace(SIGN, "")
    body = re.sub(r"^\s*(hi|hello|dear|namaste|नमस्ते)\b[^,\n।]{0,40}[,।]\s*", "", body, flags=re.I)
    return [s for s in re.split(r"(?<=[.!?।])\s+", body.strip()) if len(s.strip()) > 2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--run", help="a saved data-API response (JSON file with audit and tickets)")
    ap.add_argument("--json", help="also write the result as JSON (the Ops Console reads this)")
    ap.add_argument("--audit")
    ap.add_argument("--tickets")
    ap.add_argument("--label", default="v2")
    ap.add_argument("--markdown")
    ap.add_argument("--expected", default=str(ROOT / "eval" / "expected.json"))
    a = ap.parse_args()

    exp = json.loads(Path(a.expected).read_text(encoding="utf-8"))["emails"]
    orders = {o["order_id"]: o for o in json.loads((ROOT / "data" / "orders.json").read_text(encoding="utf-8"))["orders"]}
    if a.url or a.run:
        data = load_url(a.url) if a.url else json.loads(Path(a.run).read_text(encoding="utf-8"))
        audit, tickets = data["audit"], data["tickets"]
    elif a.audit and a.tickets:
        audit, tickets = load_csv(a.audit), load_csv(a.tickets)
    else:
        sys.exit("give --url, --run, or --audit and --tickets")

    by_id = {}
    for r in audit:
        by_id.setdefault(r["email_id"], []).append(r)

    # The action-name check only makes sense for a run that uses the v2 action names.
    v2_names = {x["action"] for x in exp.values()}
    uses_v2_actions = sum(1 for r in audit if r.get("action_taken") in v2_names) >= len(audit) // 2

    fails = {}      # email id -> list of problems
    soft = {}       # email id -> soft notes (not counted as failures)
    m = {k: [0, 0] for k in ["intent", "order_id", "order_found", "language", "reply_presence", "ticket", "needs_human", "action", "priority", "signoff", "no_emoji", "length_3_6", "content_must", "content_must_not", "amounts_ok", "links_ok", "schema_valid"]}

    def hit(metric, ok, eid=None, why=""):
        m[metric][1] += 1
        if ok:
            m[metric][0] += 1
        elif eid:
            fails.setdefault(eid, []).append(metric + (": " + why if why else ""))

    # ---- completeness: one row per email ----
    missing = [e for e in exp if e not in by_id]
    dupes = [e for e, rows in by_id.items() if len(rows) > 1]
    extra = [e for e in by_id if e not in exp]

    # ---- which tickets exist, per email and per order ----
    ticket_of_email = {}
    for t in tickets:
        for eid in [x.strip() for x in str(t.get("email_ids", "")).split(",") if x.strip()]:
            ticket_of_email.setdefault(eid, []).append(t["ticket_id"])
    open_by_order = {}
    for t in tickets:
        if str(t.get("status", "")).strip().lower() != "closed":
            open_by_order.setdefault(t.get("order_id", ""), []).append(t["ticket_id"])
    dup_tickets = {o: ids for o, ids in open_by_order.items() if len(ids) > 1}

    first_ticket_for = {}
    for eid in exp:
        r = by_id.get(eid, [None])[0]
        if r and r.get("ticket_id"):
            first_ticket_for.setdefault(r["ticket_id"], eid)

    for eid, x in exp.items():
        if eid not in by_id:
            fails.setdefault(eid, []).append("row missing")
            continue
        r = by_id[eid][0]
        reply = r.get("reply_draft", "") or ""
        hit("schema_valid", r["intent"] in INTENTS and r["sentiment"] in SENTIMENTS and r["language"] in LANGS
            and re.fullmatch(r"(0(\.\d+)?|1(\.0+)?)", str(r["confidence"]).strip() or "x") is not None, eid, "bad enum or confidence")
        hit("intent", r["intent"] == x["intent"], eid, f"{r['intent']} != {x['intent']}")
        hit("order_id", (r.get("order_id") or "") == x["order_id"], eid, f"'{r.get('order_id')}' != '{x['order_id']}'")
        hit("order_found", truthy(r.get("order_found")) == x["order_found"], eid, f"found {r.get('order_found')}")
        hit("language", r["language"] == x["language"], eid, f"{r['language']} != {x['language']}")
        hit("needs_human", truthy(r.get("needs_human")) == x["needs_human"], eid, f"needs_human {r.get('needs_human')} != {x['needs_human']}")

        has_reply = bool(reply.strip())
        hit("reply_presence", has_reply == x["reply"], eid, "reply present" if has_reply else "reply missing")

        tids = ticket_of_email.get(eid, [])
        if x["ticket"] == "none":
            hit("ticket", not r.get("ticket_id") and not tids, eid, f"unexpected ticket {r.get('ticket_id') or tids}")
        elif x["ticket"] == "new":
            hit("ticket", bool(r.get("ticket_id")) and first_ticket_for.get(r.get("ticket_id")) == eid, eid, "no new ticket for this email")
        else:  # update: must share the ticket of an earlier email, and no second ticket
            other = by_id.get(x["ticket_of"], [{}])[0].get("ticket_id", "")
            hit("ticket", bool(r.get("ticket_id")) and r.get("ticket_id") == other, eid, f"ticket {r.get('ticket_id')} != {x['ticket_of']}'s {other}")
        if "priority" in x and x["ticket"] == "new":
            tk = next((t for t in tickets if t["ticket_id"] == r.get("ticket_id")), {})
            hit("priority", tk.get("priority") == x["priority"], eid, f"priority {tk.get('priority')} != {x['priority']}")
        if uses_v2_actions:
            hit("action", r.get("action_taken") == x["action"], eid, f"{r.get('action_taken')} != {x['action']}")

        if has_reply:
            hit("signoff", reply.rstrip().endswith(SIGN), eid, "sign-off not exact")
            hit("no_emoji", not EMOJI.search(reply) and reply.count("!") <= 1, eid, "emoji or too many '!'")
            n = len(sentences(reply))
            hit("length_3_6", 3 <= n <= 6, None)   # soft: reported, not listed as a failure
            if not 3 <= n <= 6:
                soft.setdefault(eid, []).append(f"{n} sentences")
            for p in x.get("must", []):
                hit("content_must", re.search(p, reply, re.I) is not None, eid, f"missing /{p}/")
            for p in x.get("must_not", []):
                hit("content_must_not", re.search(p, reply, re.I) is None, eid, f"contains /{p}/")
            # every rupee amount must come from the order record, policy, or the key's extra amounts
            allowed = set(POLICY_AMOUNTS) | set(x.get("extra_amounts", []))
            # Facts the reply may use: only from orders that belong to the person who wrote in.
            mine = [o for o in orders.values() if o["customer_email"].lower() == (r.get("from_email") or "").lower()]
            for o in mine:
                for it in o["items"]:
                    allowed |= {it["unit_price"], it["unit_price"] * it["qty"]}
                allowed |= {o["subtotal"], o["shipping_fee"], o["cod_fee"], o["total"]}
            for amt in re.findall(r"(?:₹|Rs\.?|INR)\s*([\d,]+)", reply):
                hit("amounts_ok", int(amt.replace(",", "")) in allowed, eid, f"amount {amt} not in the facts")
            urls = [u.rstrip(".,;)") for u in re.findall(r"https?://\S+", reply)]
            ok_urls = {o["tracking_url"] for o in mine if o.get("tracking_url")}
            for u in urls:
                hit("links_ok", u in ok_urls or "kesarandco.example" in u, eid, f"link {u} not from the order")

    # ---- numbers from the audit rows themselves ----
    tin = sum(float(r.get("tokens_in") or 0) for r in audit)
    tout = sum(float(r.get("tokens_out") or 0) for r in audit)
    lat = [float(r["latency_ms"]) for r in audit if r.get("latency_ms")]
    errs = [r["email_id"] for r in audit if r.get("error")]
    guard = [(r["email_id"], r["guard_flags"]) for r in audit if r.get("guard_flags")]
    hard = [(e, f) for e, f in guard if "HARD" in f]

    labels = [
        ("schema_valid", "Valid structured output (enums, confidence)"), ("intent", "Intent correct"), ("order_id", "Order id correct"),
        ("order_found", "Order found / not found correct"), ("language", "Language detected"), ("reply_presence", "Reply drafted only when needed"),
        ("ticket", "Ticket decision correct (new / update / none)"), ("priority", "Ticket priority correct"), ("needs_human", "needs_human correct"),
        ("action", "Action name correct (only for runs that use v2 action names)"), ("signoff", "Exact sign-off"), ("no_emoji", "No emoji, at most one '!'"),
        ("length_3_6", "Body is 3 to 6 sentences (soft)"), ("content_must", "Reply contains required facts"), ("content_must_not", "Reply avoids forbidden content"),
        ("amounts_ok", "Every rupee amount is from the facts"), ("links_ok", "Every link is from the order")]
    lines = [f"## Score: {a.label}", "", "| Check | Passed | Rate |", "|---|---|---|"]
    for k, name in labels:
        ok, tot = m[k]
        if tot:
            lines.append(f"| {name} | {ok}/{tot} | {100 * ok / tot:.0f}% |")
    lines += ["", "| Reliability | Value |", "|---|---|",
              f"| Rows in Audit Log | {len(audit)} (expected 25) |",
              f"| Emails with no row | {', '.join(missing) or 'none'} |",
              f"| Emails with more than one row | {', '.join(dupes) or 'none'} |",
              f"| Open tickets per order, more than one (duplicates) | {json.dumps(dup_tickets) if dup_tickets else 'none'} |",
              f"| Tickets total | {len(tickets)} |",
              f"| Rows with an error | {', '.join(errs) or 'none'} |",
              f"| Guard hard flags | {', '.join(e + ' ' + f for e, f in hard) or 'none'} |",
              f"| Tokens in / out (agent part is an estimate) | {tin:.0f} / {tout:.0f} |",
              f"| Avg tokens per email | {(tin + tout) / max(len(audit), 1):.0f} |",
              f"| Avg / max latency | {sum(lat) / max(len(lat), 1) / 1000:.1f}s / {max(lat) / 1000 if lat else 0:.1f}s |"]
    if fails:
        lines += ["", "### Failures", ""] + [f"- **{e}**: " + "; ".join(v) for e, v in sorted(fails.items())]
    else:
        lines += ["", "No failures against the answer key."]
    out = "\n".join(lines)
    print(out)
    if a.markdown:
        Path(a.markdown).write_text(out + "\n", encoding="utf-8")
    if a.json:
        per_email = [{"id": e, "ok": e not in fails, "problems": fails.get(e, []), "soft": soft.get(e, [])} for e in exp]
        Path(a.json).write_text(json.dumps({
            "label": a.label,
            "checks": [{"key": k, "name": n, "passed": m[k][0], "total": m[k][1]} for k, n in labels if m[k][1]],
            "emails": per_email,
            "reliability": {"rows": len(audit), "tickets": len(tickets), "missing": missing, "multi_row": dupes,
                            "duplicate_open_tickets": dup_tickets, "errors": errs, "hard_flags": [list(h) for h in hard],
                            "tokens_in": tin, "tokens_out": tout, "avg_tokens": (tin + tout) / max(len(audit), 1),
                            "avg_latency_ms": sum(lat) / max(len(lat), 1), "max_latency_ms": max(lat) if lat else 0},
        }, indent=1), encoding="utf-8")
    hard_fail = missing or dupes or dup_tickets
    return 1 if (hard_fail or fails) else 0


if __name__ == "__main__":
    sys.exit(main())
