# -*- coding: utf-8 -*-
"""Builds the close-up tiles for the whole trail.

The map area is cut into fixed cells (0.2 deg x 0.13 deg). Every cell that the trail or its
3.5 km corridor touches gets a detailed tile: public/tiles/<id>.jpg, .svg, and an index
public/tiles/index.json. Cells already built are skipped, so the script can be resumed.
"""
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

LON0, LAT0, DLON, DLAT = 34.15, 33.45, 0.2, 0.13
PAD = 0.045  # ~4-5 km
OUT = Path("public/tiles")


def main():
    pts = json.loads(Path("public/data/trail.json").read_text(encoding="utf-8"))["pts"]
    cells = set()
    for lon, lat, _ in pts[::5]:
        for dx in (-PAD, 0, PAD):
            for dy in (-PAD, 0, PAD):
                cells.add((int((lon + dx - LON0) // DLON), int((LAT0 - (lat + dy)) // DLAT)))
    cells = sorted(cells, key=lambda c: (c[1], c[0]))
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for n, (ix, iy) in enumerate(cells, 1):
        cid = f"c{ix}_{iy}"
        lon0, lat0 = LON0 + ix * DLON, LAT0 - iy * DLAT
        box = [round(lon0, 4), round(lat0, 4), round(lon0 + DLON, 4), round(lat0 - DLAT, 4)]
        if not (OUT / f"{cid}.json").exists():
            for attempt in range(1, 4):
                r = subprocess.run([sys.executable, "scripts/build_local.py", cid, *map(str, box), "5000"], capture_output=True, text=True)
                if r.returncode == 0:
                    break
                print(cid, "attempt", attempt, "failed:", r.stderr.strip().splitlines()[-1:] or r.stdout[-200:], flush=True)
                Path(f"data-raw/osm-{cid}.json").unlink(missing_ok=True)
                time.sleep(30 * attempt)
            else:
                continue
            for ext in ("jpg", "svg", "json"):
                shutil.copy(f"data-raw/local-{cid}.{ext}", OUT / f"{cid}.{ext}")
            print(f"{n}/{len(cells)}", cid, r.stdout.strip()[-80:], flush=True)
            time.sleep(4)
        meta = json.loads((OUT / f"{cid}.json").read_text())
        index.append({"id": cid, **meta})
    (OUT / "index.json").write_text(json.dumps({"cells": index}))
    print("done", len(index), "of", len(cells))


if __name__ == "__main__":
    main()
