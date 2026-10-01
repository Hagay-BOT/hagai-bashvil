# -*- coding: utf-8 -*-
"""Builds a detailed, zoomable map tile for one area: realistic terrain, illustrated features.

  python scripts/build_local.py NAME LON0 LAT0 LON1 LAT1 [PX_PER_DEG]

Outputs data-raw/local-NAME.jpg (terrain), data-raw/local-NAME.svg (illustrated layer),
data-raw/local-NAME.json (bbox and scale). Same projection as the overview map.
Terrain: Tilezen Joerd (AWS Open Data). Features: (c) OpenStreetMap contributors, ODbL.
"""
import io
import json
import math
import random
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

Z = 13
CORRIDOR_KM = 3.5
KX = math.cos(math.radians(31.4))
TILES = Path("data-raw/tiles")
UA = {"User-Agent": "hagai-bashvil-build/0.1"}


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def tile(x, y):
    TILES.mkdir(parents=True, exist_ok=True)
    f = TILES / f"{Z}_{x}_{y}.png"
    if not f.exists():
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png"
        f.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())
    a = np.asarray(Image.open(io.BytesIO(f.read_bytes())).convert("RGB"), dtype=np.float32)
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768


def txy(lon, lat):
    n = 2 ** Z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def dem(lon0, lat0, lon1, lat1, w, h):
    x0, y0 = (int(v) for v in txy(lon0, lat0))
    x1, y1 = (int(v) for v in txy(lon1, lat1))
    mos = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.float32)
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            mos[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = tile(tx, ty)
    lon = np.linspace(lon0, lon1, w)
    lat = np.linspace(lat0, lat1, h)
    LON, LAT = np.meshgrid(lon, lat)
    n = 2 ** Z
    px = ((LON + 180) / 360 * n - x0) * 256 - .5
    py = ((1 - np.arcsinh(np.tan(np.radians(LAT))) / math.pi) / 2 * n - y0) * 256 - .5
    px = np.clip(px, 0, mos.shape[1] - 1.001)
    py = np.clip(py, 0, mos.shape[0] - 1.001)
    ix, iy = px.astype(int), py.astype(int)
    fx, fy = px - ix, py - iy
    e = (mos[iy, ix] * (1 - fx) * (1 - fy) + mos[iy, ix + 1] * fx * (1 - fy) + mos[iy + 1, ix] * (1 - fx) * fy + mos[iy + 1, ix + 1] * fx * fy)
    return e, LON, LAT


def terrain(e, LON, LAT, step_m):
    """Paper-cut terrain: flat colour bands, a darker lip on each band edge, soft hillshade."""
    green = ["#c4dd94", "#a9d083", "#8fc173", "#78b066", "#64a05d", "#558e55", "#7f9a68", "#a7ad8c"]
    arid = ["#f5e4bb", "#efd29a", "#e6bd7f", "#dba56b", "#cc8c58", "#b9744c", "#a05f45", "#8a5040"]
    rows, cols = e.shape
    gy, gx = np.gradient(e * 1.6, step_m, step_m)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(42)
    hs = np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)
    hs = np.clip((hs - math.sin(alt)) / (1 - math.sin(alt)), -1.4, 1)
    aridity = np.clip((31.62 - LAT) / 0.55, 0, 1)
    band_h = 25.0
    band = np.floor((e + 420) / band_h).astype(int)
    idx = np.clip(band * band_h / 260.0, 0, 7)
    lo = np.floor(idx).astype(int)
    hi = np.minimum(lo + 1, 7)
    fr = (idx - lo)[..., None]
    G = np.stack([hexrgb(c) for c in green])
    A = np.stack([hexrgb(c) for c in arid])
    rgb = (G[lo] * (1 - fr) + G[hi] * fr) * (1 - aridity[..., None]) + (A[lo] * (1 - fr) + A[hi] * fr) * aridity[..., None]
    b = np.pad(band, 1, mode="edge")
    lip = (b[:-2, 1:-1] > band) | (b[1:-1, :-2] > band)
    rgb = np.where(lip[..., None], rgb * 0.9, rgb)
    rgb = rgb * (1 + hs[..., None] * 0.32)
    sea = (e <= 0.5) & (LON < 35.2)
    rgb = np.where(sea[..., None], hexrgb("#7cc6da"), rgb)
    w = np.pad(sea, 3, mode="edge")
    shore = sea & ~(w[:-6, 3:-3] & w[6:, 3:-3] & w[3:-3, :-6] & w[3:-3, 6:])
    rgb = np.where(shore[..., None], hexrgb("#d9f1f3"), rgb)
    beach = ~sea & (np.pad(sea, 8, mode="edge")[:-16, 8:-8] | np.pad(sea, 8, mode="edge")[16:, 8:-8] | np.pad(sea, 8, mode="edge")[8:-8, :-16] | np.pad(sea, 8, mode="edge")[8:-8, 16:])
    rgb = np.where(beach[..., None], hexrgb("#f3e2b3"), rgb)
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def overpass(lon0, lat0, lon1, lat1):
    bb = f"{lat1},{lon0},{lat0},{lon1}"
    q = f"""[out:json][timeout:120];
(
  way["waterway"~"river|stream|wadi"]({bb});
  way["natural"="water"]({bb});
  way["landuse"~"forest|residential|orchard|farmland|vineyard"]({bb});
  way["natural"="wood"]({bb});
  way["highway"~"motorway|trunk|primary|secondary|tertiary|track"]({bb});
  node["place"~"city|town|village|kibbutz|moshav"]({bb});
  node["natural"="peak"]["name"]({bb});
  node["natural"="spring"]["name"]({bb});
);
out geom;"""
    data = urllib.parse.urlencode({"data": q}).encode()
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=data, headers=UA)
    return json.loads(urllib.request.urlopen(req, timeout=180).read())["elements"]


def main():
    name = sys.argv[1]
    lon0, lat0, lon1, lat1 = (float(v) for v in sys.argv[2:6])
    ppd = float(sys.argv[6]) if len(sys.argv) > 6 else 5000
    W = int(round((lon1 - lon0) * KX * ppd))
    H = int(round((lat0 - lat1) * ppd))
    X = lambda lon: (lon - lon0) * KX * ppd
    Y = lambda lat: (lat0 - lat) * ppd

    e, LON, LAT = dem(lon0, lat0, lon1, lat1, W, H)
    step_m = 111195.0 / ppd
    img = terrain(e, LON, LAT, step_m).filter(ImageFilter.UnsharpMask(radius=1.0, percent=40))
    # corridor: CORRIDOR_KM on each side of the trail
    trail = json.loads(Path("public/data/trail.json").read_text(encoding="utf-8"))["pts"]
    tp, last = [], None
    for lon_, lat_, _ in trail:
        x_, y_ = X(lon_), Y(lat_)
        if -400 < x_ < W + 400 and -400 < y_ < H + 400 and (last is None or (x_ - last[0]) ** 2 + (y_ - last[1]) ** 2 > 16):
            tp.append((x_, y_)); last = (x_, y_)
    tp = np.array(tp, np.float32)
    gx_, gy_ = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    dist = np.full((H, W), 1e9, np.float32)
    for k in range(0, len(tp), 64):
        c = tp[k:k + 64]
        d2 = (gx_[..., None] - c[:, 0]) ** 2 + (gy_[..., None] - c[:, 1]) ** 2
        dist = np.minimum(dist, d2.min(-1))
    dist = np.sqrt(dist)
    R = CORRIDOR_KM / 111.195 * ppd
    mask = Image.fromarray((np.clip((R - dist) / 5, 0, 1) * 255).astype(np.uint8), "L")
    buf = io.BytesIO(); mask.save(buf, "PNG", optimize=True)
    import base64
    mask_uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    near = lambda x, y: 0 <= int(x) < W and 0 <= int(y) < H and dist[int(y), int(x)] <= R + 8
    img.save(f"data-raw/local-{name}.jpg", quality=84, optimize=True, progressive=True)

    cache = Path(f"data-raw/osm-{name}.json")
    if not cache.exists():
        cache.write_text(json.dumps(overpass(lon0, lat0, lon1, lat1)))
    els = json.loads(cache.read_text())
    rnd = random.Random(4)
    placed = []

    def pts(el):
        return [(X(g["lon"]), Y(g["lat"])) for g in el.get("geometry", [])]

    def d(p, close=False):
        return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in p) + (" Z" if close else "")

    def scatter(poly, spacing):
        def inside(px, py):
            hit = False
            j = len(poly) - 1
            for i in range(len(poly)):
                xi, yi = poly[i]
                xj, yj = poly[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / ((yj - yi) or 1e-9) + xi:
                    hit = not hit
                j = i
            return hit
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        out = []
        y = min(ys)
        row = 0
        while y < max(ys):
            x = min(xs) + (spacing / 2 if row % 2 else 0)
            while x < max(xs):
                jx, jy = x + rnd.uniform(-spacing * .3, spacing * .3), y + rnd.uniform(-spacing * .3, spacing * .3)
                if inside(jx, jy):
                    out.append((jx, jy))
                x += spacing
            y += spacing * .8
            row += 1
        return out

    layers = {k: [] for k in ("fields", "water", "forest", "town", "roads", "tracks", "streams", "labels")}
    els.sort(key=lambda el: 0 if "place" in el.get("tags", {}) else 1)
    for el in els:
        t = el.get("tags", {})
        if el["type"] == "way":
            p = pts(el)
            if len(p) < 2:
                continue
            closed = el["geometry"][0] == el["geometry"][-1]
            if t.get("landuse") in ("orchard", "vineyard", "farmland") and closed:
                fill = {"orchard": "#9fca6d", "vineyard": "#b6c46a", "farmland": "#e6dc9a"}[t["landuse"]]
                layers["fields"].append(f'<path d="{d(p, True)}" fill="{fill}" opacity=".55"/>')
                if t["landuse"] in ("orchard", "vineyard"):
                    for x, y in scatter(p, 9)[:400]:
                        layers["fields"].append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.2" fill="#5f9a45"/>')
            elif (t.get("landuse") == "forest" or t.get("natural") == "wood") and closed:
                layers["forest"].append(f'<path d="{d(p, True)}" fill="#5f9e57" opacity=".35"/>')
                for x, y in scatter(p, 13)[:900]:
                    r = rnd.uniform(4.5, 6.5)
                    c = rnd.choice(["#3f8a4f", "#4c9a55", "#357a45", "#5aa65c"])
                    layers["forest"].append(f'<g><ellipse cx="{x:.1f}" cy="{y + r * .9:.1f}" rx="{r * .8:.1f}" ry="{r * .3:.1f}" fill="#1f3d26" opacity=".25"/><circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{c}"/><circle cx="{x - r * .3:.1f}" cy="{y - r * .3:.1f}" r="{r * .45:.1f}" fill="#8cc977" opacity=".55"/></g>')
            elif t.get("landuse") == "residential" and closed:
                layers["town"].append(f'<path d="{d(p, True)}" fill="#efe3cf" opacity=".85"/>')
                for x, y in [q for q in scatter(p, 11) if near(*q)][:500]:
                    roof = rnd.choice(["#d0583e", "#c44d36", "#dd6a46", "#b9b3a6"])
                    layers["town"].append(f'<g><rect x="{x - 4:.1f}" y="{y - 2:.1f}" width="8" height="6" fill="#f7f1e6" stroke="#9c8f7a" stroke-width=".6"/><path d="M{x - 5:.1f} {y - 1.5:.1f} L{x:.1f} {y - 6:.1f} L{x + 5:.1f} {y - 1.5:.1f}Z" fill="{roof}"/></g>')
            elif t.get("natural") == "water" and closed:
                layers["water"].append(f'<path d="{d(p, True)}" fill="#6fbfd6" stroke="#e3f6f8" stroke-width="1.6"/>')
            elif "waterway" in t:
                wdt = 3.2 if t["waterway"] == "river" else 1.6
                layers["streams"].append(f'<path d="{d(p)}" fill="none" stroke="#5fb0d0" stroke-width="{wdt}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>')
            elif "highway" in t:
                hw = t["highway"].replace("_link", "")
                if hw == "track":
                    layers["tracks"].append(f'<path d="{d(p)}" fill="none" stroke="#a88f6a" stroke-width="1.3" stroke-dasharray="4 3" opacity=".8"/>')
                else:
                    wdt = {"motorway": 5, "trunk": 4.5, "primary": 4, "secondary": 3.2, "tertiary": 2.4}[hw]
                    col = "#f6c95c" if hw in ("motorway", "trunk", "primary") else "#fff8ea"
                    layers["roads"].append(f'<path d="{d(p)}" fill="none" stroke="#8a7a5f" stroke-width="{wdt + 2}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><path d="{d(p)}" fill="none" stroke="{col}" stroke-width="{wdt}" stroke-linecap="round" stroke-linejoin="round"/>')
        elif el["type"] == "node":
            x, y = X(el["lon"]), Y(el["lat"])
            if not (0 <= x <= W and 0 <= y <= H):
                continue
            label = t.get("name:he") or t.get("name")
            if not label:
                continue
            main = t.get("place") in ("city", "town")
            if not near(x, y) and not main:
                continue
            if t.get("natural") == "spring":
                layers["labels"].append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.2" fill="#3fa7d6" stroke="#fff" stroke-width="1.3"/>')
                continue
            # keep the map readable: no label closer than 60 px to another one
            if any((x - px) ** 2 + (y - py) ** 2 < 60 ** 2 for px, py in placed):
                continue
            if t.get("natural") == "peak" and not t.get("ele"):
                continue
            placed.append((x, y))
            halo = 'stroke="#2a3a2e" stroke-width="3.4" stroke-linejoin="round" paint-order="stroke"'
            if t.get("natural") == "peak":
                ele = t.get("ele", "").split(".")[0]
                layers["labels"].append(f'<path d="M{x - 7:.1f} {y + 5:.1f} L{x:.1f} {y - 7:.1f} L{x + 7:.1f} {y + 5:.1f}Z" fill="#7b6a58" stroke="#fff" stroke-width="1.4"/><text x="{x:.1f}" y="{y + 18:.1f}" font-size="12" font-weight="700" text-anchor="middle" fill="#fff" {halo}>{label}{" · " + ele + " מ׳" if ele else ""}</text>')
            elif t.get("natural") == "spring":
                layers["labels"].append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#3fa7d6" stroke="#fff" stroke-width="1.5"/><text x="{x + 7:.1f}" y="{y + 4:.1f}" font-size="11" font-weight="700" fill="#fff" {halo}>{label}</text>')
            else:
                size = 15 if t.get("place") in ("city", "town") else 12.5
                layers["labels"].append(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="800" text-anchor="middle" fill="#fff" {halo}>{label}</text>')

    order = ["fields", "water", "forest", "town", "streams", "tracks", "roads", "labels"]
    body = "".join(f'<g class="l-{k}">' + "".join(layers[k]) + "</g>" for k in order if k != "labels")
    svg = body + '<g class="l-labels">' + "".join(layers["labels"]) + "</g>"
    Path(f"data-raw/local-{name}.svg").write_text(svg, encoding="utf-8")
    Path(f"data-raw/local-{name}.json").write_text(json.dumps({"lon0": lon0, "lat0": lat0, "lon1": lon1, "lat1": lat1, "ppd": ppd, "w": W, "h": H}))
    print(name, W, "x", H, {k: len(v) for k, v in layers.items()}, round(len(svg) / 1024), "KB svg")


if __name__ == "__main__":
    main()
