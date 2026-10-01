# -*- coding: utf-8 -*-
"""Builds elevation data from open terrain tiles (Terrarium PNG, AWS Open Data).

Outputs:
  data-raw/dem.npy             float32 grid, north to south, equirectangular
  data-raw/dem.json            {lon0, lat0, step, cols, rows}
  public/data/profile.json     {step, ele[], gain[]} sampled every 100 m along the trail

Terrain tiles: Mapzen/Tilezen Joerd on AWS (SRTM, GMTED and others) — attribution required.
"""
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

Z = 10
LON0, LON1, LAT0, LAT1, STEP = 34.15, 36.0, 33.45, 29.40, 0.002
TILES = Path("data-raw/tiles")
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def load_tile(x, y):
    TILES.mkdir(parents=True, exist_ok=True)
    f = TILES / f"{Z}_{x}_{y}.png"
    if not f.exists():
        req = urllib.request.Request(URL.format(z=Z, x=x, y=y), headers={"User-Agent": "hagai-bashvil-build/0.1"})
        f.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    a = np.asarray(Image.open(io.BytesIO(f.read_bytes())).convert("RGB"), dtype=np.float32)
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768


def main():
    x0, y0 = (int(v) for v in tile_xy(LON0, LAT0, Z))
    x1, y1 = (int(v) for v in tile_xy(LON1, LAT1, Z))
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype=np.float32)
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            mosaic[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = load_tile(tx, ty)
    print("tiles", (x1 - x0 + 1) * (y1 - y0 + 1), "mosaic", mosaic.shape)

    def sample(lon, lat):
        """Bilinear sample of the mosaic at arrays of lon/lat."""
        n = 2 ** Z
        px = ((lon + 180) / 360 * n - x0) * 256 - 0.5
        py = ((1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n - y0) * 256 - 0.5
        px = np.clip(px, 0, mosaic.shape[1] - 1.001)
        py = np.clip(py, 0, mosaic.shape[0] - 1.001)
        ix, iy = px.astype(int), py.astype(int)
        fx, fy = px - ix, py - iy
        return (mosaic[iy, ix] * (1 - fx) * (1 - fy) + mosaic[iy, ix + 1] * fx * (1 - fy)
                + mosaic[iy + 1, ix] * (1 - fx) * fy + mosaic[iy + 1, ix + 1] * fx * fy)

    cols = int(round((LON1 - LON0) / STEP)) + 1
    rows = int(round((LAT0 - LAT1) / STEP)) + 1
    lon = LON0 + np.arange(cols) * STEP
    lat = LAT0 - np.arange(rows) * STEP
    grid = sample(np.tile(lon, (rows, 1)), np.tile(lat[:, None], (1, cols))).astype(np.float32)
    np.save("data-raw/dem.npy", grid)
    Path("data-raw/dem.json").write_text(json.dumps({"lon0": LON0, "lat0": LAT0, "step": STEP, "cols": cols, "rows": rows}))
    print("grid", cols, "x", rows, "min", float(grid.min()), "max", float(grid.max()))

    trail = json.loads(Path("public/data/trail.json").read_text(encoding="utf-8"))
    pts = np.array(trail["pts"], dtype=np.float64)
    step = 0.1
    kms = np.arange(0, trail["totalKm"], step)
    slon = np.interp(kms, pts[:, 2], pts[:, 0])
    slat = np.interp(kms, pts[:, 2], pts[:, 1])
    ele = sample(slon, slat)
    sm = np.convolve(np.pad(ele, 2, mode="edge"), np.ones(5) / 5, mode="valid")
    gain, ref, total = [0], sm[0], 0.0
    for v in sm[1:]:
        d = v - ref
        if d >= 3:
            total += d
            ref = v
        elif d <= -3:
            ref = v
        gain.append(int(round(total)))
    Path("public/data/profile.json").write_text(json.dumps({"step": step, "ele": [int(round(v)) for v in ele], "gain": gain}))
    print("profile samples", len(ele), "min", int(ele.min()), "max", int(ele.max()), "totalGain", int(total))
    return 0


if __name__ == "__main__":
    sys.exit(main())
