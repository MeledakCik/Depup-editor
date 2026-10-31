export type Anchor = { x: number; y: number; hx: number; hy: number }; // hx/hy = outgoing handle offset
/** Build an SVG path string from anchors using cubic Beziers. */
export function anchorsToPath(a: Anchor[], closed: boolean) {
  if (!a.length) return '';
  let d = `M ${a[0].x} ${a[0].y}`;
  const seg = (p: Anchor, q: Anchor) =>
    ` C ${p.x + p.hx} ${p.y + p.hy} ${q.x - q.hx} ${q.y - q.hy} ${q.x} ${q.y}`;
  for (let i = 1; i < a.length; i++) d += seg(a[i - 1], a[i]);
  if (closed && a.length > 2) d += seg(a[a.length - 1], a[0]) + ' Z';
  return d;
}
