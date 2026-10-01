# -*- coding: utf-8 -*-
"""Builds public/data/stages.json from the private plan sheet.

Whitelist only: from, to, km, hours, official segments, cumulative km, region.
Dates, lodging, water, food, notes, companions and warnings never leave data-private/.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

SRC = Path("data-private/plan.xlsx")
OUT = Path("public/data/stages.json")
SHEET = "תוכנית המסע"
# column indexes in the sheet
C_FROM, C_TO, C_KM, C_HOURS, C_SEGS, C_KM_INT = 2, 3, 4, 6, 7, 14

REGIONS = [("צפון", "north"), ("מרכז", "center"), ("דרום", "south")]
PHONE = re.compile(r"0\d[\d\-\s]{7,}")


def clean_place(s: str) -> str:
    s = str(s or "").strip()
    s = re.sub(r"\s*\((?:לינה|אחרי)[^)]*\)", "", s)   # lodging hints
    s = re.sub(r"\s*→.*$", "", s)                      # pickup / transfer notes
    s = re.sub(r"\s*\(סוף!\)", "", s)
    s = re.sub(r"^(?:חניון לילה|קמפינג|מלונות|חניון)\s+", "", s)    # the place, not where he sleeps
    s = s.replace("≈", "").strip(" —-")
    return s


def main() -> int:
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb[SHEET]
    region = None
    stages = []
    for row in ws.iter_rows(values_only=True):
        head = str(row[0] or "")
        if "שביל הגולן" in head:
            region = "golan"
            continue
        for he, key in REGIONS:
            if head.startswith(he + " ·"):
                region = key
        if region in (None, "golan"):
            continue
        if not re.match(r"^\d{1,2}\.\d{1,2}$", head.strip()):
            continue
        km = row[C_KM]
        if km in (None, ""):
            if stages and "מנוחה" in str(row[C_TO] or ""):
                stages[-1]["restAfter"] = True
            continue
        stages.append({
            "n": len(stages) + 1,
            "from": clean_place(row[C_FROM]),
            "to": clean_place(row[C_TO]),
            "km": round(float(km), 1),
            "hours": float(row[C_HOURS]) if row[C_HOURS] not in (None, "") else None,
            "segs": str(row[C_SEGS] or "").strip(),
            "kmEnd": round(float(row[C_KM_INT]), 1),
            "region": region,
            "restAfter": False,
        })
    for i, s in enumerate(stages):
        s["kmStart"] = stages[i - 1]["kmEnd"] if i else 0.0
    blob = json.dumps({
        "totalKm": stages[-1]["kmEnd"],
        "walkDays": len(stages),
        "restDays": sum(1 for s in stages if s["restAfter"]),
        "stages": stages,
    }, ensure_ascii=False, indent=1)
    if PHONE.search(blob):
        print("ERROR: phone-like sequence in output — refusing to write", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(blob, encoding="utf-8")
    print(f"stages={len(stages)} rest={sum(1 for s in stages if s['restAfter'])} totalKm={stages[-1]['kmEnd']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
