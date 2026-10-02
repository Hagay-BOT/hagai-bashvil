// Sky tint by Israel time: night blue, dawn pink, no tint by day, golden hour orange, dusk back to blue.
// Keyframes: [hour, r, g, b, alpha]. Colour and alpha are interpolated linearly between neighbours.
const KEYS: [number, number, number, number, number][] = [
  [0, 16, 26, 78, .42], [5, 16, 26, 78, .42],
  [5.5, 255, 140, 160, .22], [6.4, 255, 165, 150, .16], [7.2, 255, 190, 150, 0],
  [16.4, 255, 150, 60, 0], [17.2, 255, 150, 60, .17], [18, 255, 120, 60, .22],
  [18.7, 24, 34, 88, .36], [19.6, 16, 26, 78, .42], [24, 16, 26, 78, .42],
];

export function skyAt(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  let i = 1;
  while (i < KEYS.length - 1 && KEYS[i][0] < h) i++;
  const a = KEYS[i - 1], b = KEYS[i], t = (h - a[0]) / ((b[0] - a[0]) || 1);
  const m = (j: number) => a[j] + (b[j] - a[j]) * t;
  return `rgba(${Math.round(m(1))},${Math.round(m(2))},${Math.round(m(3))},${m(4).toFixed(3)})`;
}
