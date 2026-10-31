import { Application, Graphics } from 'pixi.js';
/** Pixi v7 layer under Fabric: draws the infinite grid; chroma-key/filters attach here later. */
export function createPixi(host: HTMLElement) {
  const app = new Application({ backgroundAlpha: 0, antialias: true, resizeTo: host });
  const grid = new Graphics(); app.stage.addChild(grid);
  host.appendChild(app.view as unknown as HTMLCanvasElement);
  const draw = (zoom: number, ox: number, oy: number, enabled = true) => {
    grid.clear();
    if (!enabled) return;
    const step = 40 * zoom; grid.lineStyle(1, 0x1b2640, 0.7);
    const w = app.screen.width, h = app.screen.height;
    for (let x = ((ox % step) + step) % step; x < w; x += step) { grid.moveTo(x, 0); grid.lineTo(x, h); }
    for (let y = ((oy % step) + step) % step; y < h; y += step) { grid.moveTo(0, y); grid.lineTo(w, y); }
  };
  return { app, draw, destroy: () => app.destroy(true, { children: true }) };
}
