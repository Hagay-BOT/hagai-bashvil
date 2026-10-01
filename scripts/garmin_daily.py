# -*- coding: utf-8 -*-
"""Daily Garmin sync: steps and distance for yesterday and today into the `days` table.

Runs in GitHub Actions. The log is public, so it prints only success or failure, never data.
Secrets: GARMIN_EMAIL, GARMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.request

from garminconnect import Garmin


def login(attempts=4):
    for i in range(1, attempts + 1):
        try:
            g = Garmin(os.environ["GARMIN_EMAIL"], os.environ["GARMIN_PASSWORD"])
            g.login()
            return g
        except Exception:  # noqa: BLE001 — the library raises many kinds
            if i == attempts:
                print("garmin login failed")
                sys.exit(1)
            time.sleep(20 * i)


def upsert(row):
    url = os.environ["SUPABASE_URL"] + "/rest/v1/days?on_conflict=date"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url, data=json.dumps(row).encode(), method="POST", headers={
        "apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"})
    urllib.request.urlopen(req, timeout=30).read()


def main():
    start = dt.date(2026, 10, 5)
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=2))).date()
    if today < start:
        print("before the start, nothing to do")
        return 0
    g = login()
    done = 0
    for d in (today - dt.timedelta(days=1), today):
        if d < start:
            continue
        s = g.get_stats(d.isoformat()) or {}
        steps, meters = s.get("totalSteps"), s.get("totalDistanceMeters")
        if steps is None:
            continue
        # km_start/km_end belong to the ingest function; Garmin fills only its own columns
        upsert({"date": d.isoformat(), "steps": int(steps), "garmin_km": round((meters or 0) / 1000, 1)})
        done += 1
    print(f"ok, {done} days updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
