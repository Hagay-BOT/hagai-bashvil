// Current weather from Open-Meteo (no key). Called for a point on the trail, never a raw phone position.
export interface Wx { temp: number; code: number; wind: number; isDay: boolean }
export type WxKind = 'clear' | 'part' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

/** Which light CSS effect a WMO weather code gets. */
export function wxKind(code: number): WxKind {
  if (code === 2) return 'part';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'clear';
}

export function wxLabel(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'שמשי' : 'בהיר';
  if (code === 1) return isDay ? 'שמשי ברובו' : 'בהיר ברובו';
  if (code === 2) return 'מעונן חלקית';
  if (code === 3) return 'מעונן';
  if (code === 45 || code === 48) return 'ערפל';
  if (code >= 51 && code <= 57) return 'טפטוף';
  if (code === 66 || code === 67) return 'גשם קפוא';
  if (code >= 61 && code <= 65) return 'גשם';
  if (code >= 80 && code <= 82) return 'ממטרים';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'שלג';
  if (code >= 95) return 'סופת רעמים';
  return 'מעונן';
}

const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** One request. Coordinates are rounded to about 10 km, which is all the model resolves anyway. */
export async function fetchWeather(lat: number, lon: number): Promise<Wx | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${r1(lat)}&longitude=${r1(lon)}&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=auto`;
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) return null;
    const c = (await r.json()).current;
    if (!c || typeof c.temperature_2m !== 'number') return null;
    return { temp: c.temperature_2m, code: c.weather_code, wind: c.wind_speed_10m ?? 0, isDay: c.is_day === 1 };
  } catch { return null; } finally { clearTimeout(timer); }
}
