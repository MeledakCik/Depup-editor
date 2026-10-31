'use client';
import { useEffect, useRef } from 'react';
import { createEngine, type Engine } from '@/lib/engine/fabric-engine';
import { createPixi } from '@/lib/engine/pixi-renderer';
import { useStore } from '@/lib/store';

export default function UnifiedCanvas({ onReady, showGrid = true }: { onReady: (e: Engine) => void; showGrid?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const gridVisible = useRef(showGrid), redrawGrid = useRef<() => void>(() => {});
  gridVisible.current = showGrid;
  useEffect(() => {
    const el = host.current!;
    const pixi = createPixi(el);
    const view = pixi.app.view as HTMLCanvasElement;
    view.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';
    let currentView = { zoom: 1, x: 0, y: 0 };
    const drawGrid = () => pixi.draw(currentView.zoom, currentView.x, currentView.y, gridVisible.current);
    redrawGrid.current = drawGrid;
    const eng = createEngine(cv.current!, (z, x, y) => { currentView = { zoom: z, x, y }; drawGrid(); useStore.getState().set({ zoom: z }); });
    const fit = () => { eng.resize(el.clientWidth, el.clientHeight); drawGrid(); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    const wrap = cv.current!.parentElement!; wrap.style.cssText = 'position:absolute;inset:0;z-index:1;';
    onReady(eng);
    return () => { ro.disconnect(); eng.destroy(); pixi.destroy(); };
  }, [onReady]);
  useEffect(() => { redrawGrid.current(); }, [showGrid]);
  return <div ref={host} className="relative h-full w-full overflow-hidden"><canvas ref={cv} /></div>;
}
