export type AutoLayout = { direction: 'row' | 'column'; gap: number; padding: number; mode: 'hug' | 'fixed' };
export type Box = { w: number; h: number };
/** Returns child positions relative to the frame, plus the hugged frame size. */
export function computeAutoLayout(children: Box[], o: AutoLayout) {
  let cursor = o.padding, cross = 0;
  const pos = children.map((c) => {
    const p = o.direction === 'row' ? { x: cursor, y: o.padding } : { x: o.padding, y: cursor };
    cursor += (o.direction === 'row' ? c.w : c.h) + o.gap;
    cross = Math.max(cross, o.direction === 'row' ? c.h : c.w);
    return p;
  });
  const main = Math.max(0, cursor - o.gap + o.padding), side = cross + o.padding * 2;
  const size = o.direction === 'row' ? { w: main, h: side } : { w: side, h: main };
  return { pos, size };
}
