#!/usr/bin/env python3
"""
Build kesar_support.xlsx with the two tabs the assignment asks for.

  Audit Log  = columns from sheet/audit_log_template.csv  + extra columns
  Tickets    = columns from sheet/tickets_template.csv    + extra columns

Import the file into Google Sheets (File > Import, or upload to Drive).
The original template columns are kept first and in order, as required.
Standard library only, no pip install.

Usage: python scripts/make_sheet_xlsx.py [output_path]
"""

import csv
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent

# Extra columns I add after the template ones (see README, "Key decisions").
AUDIT_EXTRA = ["model", "tokens_in", "tokens_out", "cost_usd", "latency_ms",
               "guard_flags", "facts_json", "trace_json"]
TICKETS_EXTRA = ["reply_summary", "sla_due"]


def read_header(csv_path):
    with open(csv_path, newline="", encoding="utf-8") as f:
        return next(csv.reader(f))


def col_letter(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def sheet_xml(headers):
    cells = "".join(
        f'<c r="{col_letter(i)}1" t="inlineStr" s="1"><is><t>{escape(h)}</t></is></c>'
        for i, h in enumerate(headers)
    )
    cols = "".join(
        f'<col min="{i + 1}" max="{i + 1}" width="{max(14, len(h) + 4)}" customWidth="1"/>'
        for i, h in enumerate(headers)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '</sheetView></sheetViews>'
        f'<cols>{cols}</cols>'
        f'<sheetData><row r="1">{cells}</row></sheetData>'
        '</worksheet>'
    )


STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
    '<fills count="3"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/></patternFill></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
    '</styleSheet>'
)


def build(out_path):
    audit = read_header(ROOT / "sheet" / "audit_log_template.csv") + AUDIT_EXTRA
    tickets = read_header(ROOT / "sheet" / "tickets_template.csv") + TICKETS_EXTRA

    files = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            '</Types>'
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Audit Log" sheetId="1" r:id="rId1"/>'
            '<sheet name="Tickets" sheetId="2" r:id="rId2"/></sheets></workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
            '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '</Relationships>'
        ),
        "xl/styles.xml": STYLES,
        "xl/worksheets/sheet1.xml": sheet_xml(audit),
        "xl/worksheets/sheet2.xml": sheet_xml(tickets),
    }
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(name, content)
    print(f"Wrote {out_path}")
    print(f"  Audit Log: {len(audit)} columns")
    print(f"  Tickets:   {len(tickets)} columns")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "kesar_support.xlsx")
