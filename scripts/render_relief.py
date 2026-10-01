# -*- coding: utf-8 -*-
"""Renders the illustrated relief base map from the elevation grid.

Paper-cut look: elevation is quantised into bands, each band a flat colour, with a soft
hillshade and a darker lip where bands meet. Green in the north fades to desert in the south.

Usage: python scripts/render_relief.py [theme] [out.jpg] [px_per_deg]
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

THEMES = {
    "day": {
        "green": ["#b9d98a", "#9ccb78", "#7fb968", "#62a25b", "#4a8a52", "#3b7449", "#6f8a5e", "#9aa28a"],
        "arid":  ["#f5e4bb", "#efd29a", "#e6bd7f", "#dba56b", "#cc8c58", "#b9744c", "#a05f45", "#8a5040"],
        "sea":   ["#a6dbe3", "#83c9da", "#62b3cf", "#4a9cc2", "#3a86b2"],
        "lake":  "#5fb4d2", "shade": 0.55, "lip": 0.86,
    },
    "gold": {
        "green": ["#e6c777", "#d3b565", "#b9a35a", "#9c9053", "#7f7c50", "#6a694c", "#7a6a58", "#94806f"],
        "arid":  ["#f7cf93", "#f2b678", "#ea9c66", "#dd835b", "#c96c56", "#b05a55", "#944c55", "#7a4152"],
        "sea":   ["#b79fcf", "#9a88c6", "#7f74bb", "#6763ad", "#55549b"],
        "lake":  "#8a7cc0", "shade": 0.6, "lip": 0.85,
    },
}


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def main():
    theme = THEMES[sys.argv[1] if len(sys.argv) > 1 else "day"]
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "public/map/relief-day.jpg")
    ppd = float(sys.argv[3]) if len(sys.argv) > 3 else 500

    meta = json.loads(Path("data-raw/dem.json").read_text())
    e = np.load("data-raw/dem.npy")
    rows, cols = e.shape
    lon = meta["lon0"] + np.arange(cols) * meta["step"]
    lat = meta["lat0"] - np.arange(rows) * meta["step"]
    LON, LAT = np.meshgrid(lon, lat)

    med = (e <= 0.5) & (LON < 35.2) & (LAT > 31.0)
    red = (e <= 0.5) & (LAT < 29.60) & (LON > 34.6) & (LON < 35.15)
    sea = med | red
    # lakes: flat and far below sea level (Kinneret, Dead Sea)
    pad = np.pad(e, 1, mode="edge")
    stack = np.stack([pad[1 + dy:1 + dy + rows, 1 + dx:1 + dx + cols] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    flat = (stack.max(0) - stack.min(0)) < 0.7
    lake = flat & (e < -150) & ~sea
    lake |= (e < -207) & (LON > 35.5) & (LON < 35.67) & (LAT > 32.69) & (LAT < 32.92)      # Kinneret
    lake |= (e < -405) & (LON > 35.33) & (LON < 35.62) & (LAT > 31.0) & (LAT < 31.78)       # Dead Sea

    # hillshade, light from the north-west
    cell_y = meta["step"] * 111195.0
    cell_x = cell_y * math.cos(math.radians(31.4))
    gy, gx = np.gradient(e * 2.2, cell_y, cell_x)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(45)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    hs = np.clip(hs, 0, 1)
    hs = (hs - math.sin(alt)) / (1 - math.sin(alt))  # 0 on flat ground, + lit, - shaded
    hs = np.clip(hs, -1.4, 1)

    # climate: 0 = green, 1 = desert
    arid = np.clip((31.62 - LAT) / 0.55, 0, 1)
    rain_shadow = np.clip((LON - 35.24) / 0.10, 0, 1) * np.clip((32.45 - LAT) / 0.35, 0, 1)
    arid = np.maximum(arid, rain_shadow)
    east = np.clip((LON - 35.72) / 0.2, 0, 1) * np.clip((33.0 - LAT) / 0.4, 0, 1)   # Jordanian plateau, Hauran
    arid = np.maximum(arid, east * 0.8)
    arid = np.clip(arid + (np.random.default_rng(7).random(e.shape) - 0.5) * 0.06, 0, 1)

    band_h = 90.0
    rel = e + 420                                        # the rift sits far below sea level
    band = np.clip(np.floor(rel / band_h), 0, 30).astype(int)
    idx = np.clip(band * band_h / 260.0, 0, 7)           # -420 m -> 0, 880 m -> 5, 1400 m -> 7
    lo, hi = np.floor(idx).astype(int), np.minimum(np.floor(idx).astype(int) + 1, 7)
    frac = (idx - lo)[..., None]
    G = np.stack([hexrgb(c) for c in theme["green"]])
    A = np.stack([hexrgb(c) for c in theme["arid"]])
    green = G[lo] * (1 - frac) + G[hi] * frac
    desert = A[lo] * (1 - frac) + A[hi] * frac
    rgb = green * (1 - arid[..., None]) + desert * arid[..., None]

    # darker lip on the low side of each band edge (paper-cut shadow)
    b = np.pad(band, 1, mode="edge")
    higher_nw = (b[:-2, 1:-1] > band) | (b[1:-1, :-2] > band) | (b[:-2, :-2] > band)
    rgb = np.where(higher_nw[..., None], rgb * theme["lip"], rgb)

    rgb = rgb * (1 + hs[..., None] * theme["shade"] * 0.5)

    S = np.stack([hexrgb(c) for c in theme["sea"]])
    depth = np.select([e > -25, e > -120, e > -500, e > -1100], [0, 1, 2, 3], 4)
    rgb = np.where(sea[..., None], S[depth], rgb)
    rgb = np.where(lake[..., None], hexrgb(theme["lake"]), rgb)
    # shoreline: lighten water next to land
    water = sea | lake
    w = np.pad(water, 2, mode="edge")
    near_land = ~(w[:-4, 2:-2] & w[4:, 2:-2] & w[2:-2, :-4] & w[2:-2, 4:])
    rgb = np.where((water & near_land)[..., None], rgb * 0.4 + 255 * 0.6, rgb)

    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")
    width = int(round((lon[-1] - lon[0]) * math.cos(math.radians(31.4)) * ppd))
    height = int(round((lat[0] - lat[-1]) * ppd))
    img = img.resize((width, height), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, quality=84, optimize=True, progressive=True)
    print(out, img.size, round(out.stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
