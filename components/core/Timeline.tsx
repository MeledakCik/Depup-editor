'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Scissors, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useStore, type Clip } from '@/lib/store';
import type { Engine } from '@/lib/engine/fabric-engine';

const color = { video: '#22d3ee', audio: '#a855f7', text: '#3b82f6', overlay: '#f97316' } as const;
const SNAP = 6, FPS = 24;
type Kind = keyof typeof color;

export default function Timeline({ eng }: { eng: () => Engine | null }) {
  const tracks = useStore((s) => s.tracks), activeClipId = useStore((s) => s.activeClipId), updateClip = useStore((s) => s.updateClip), splitAt = useStore((s) => s.splitAt), removeClip = useStore((s) => s.removeClip);
  const frame = useStore((s) => s.currentFrame), playing = useStore((s) => s.playing), set = useStore((s) => s.set);
  const [sel, setSel] = useState<string | null>(null), [kind, setKind] = useState<Kind>('video'), [px, setPx] = useState(3);
  const drag = useRef<{ id: string; mode: 'move' | 'l' | 'r'; x: number; c: Clip } | null>(null);
  const scrubbing = useRef(false);
  const ruler = useRef<HTMLDivElement>(null);
  const duration = useMemo(() => Math.max(240, ...tracks.flatMap((t) => t.clips.map((c) => c.start + c.len))), [tracks]);
  const width = Math.max(900, (duration + 64) * px + 80);

  const setFrameFromPointer = (e: { clientX: number }) => {
    const box = ruler.current?.getBoundingClientRect(); if (!box) return;
    const next = Math.max(0, Math.round((e.clientX - box.left) / px));
    set({ currentFrame: next });
  };
  const edges = (skip: string) => [0, frame, ...tracks.flatMap((t) => t.clips.filter((c) => c.id !== skip).flatMap((c) => [c.start, c.start + c.len]))];
  const snap = (v: number, skip: string) => { const hit = edges(skip).find((e) => Math.abs(e - v) <= SNAP); return hit ?? Math.round(v); };
  const down = (e: React.PointerEvent, c: Clip, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: c.id, mode, x: e.clientX, c }; setSel(c.id); set({ activeClipId: c.id });
    if (c.objectId) eng()?.selectLayer(c.objectId);
  };
  const move = (e: React.PointerEvent) => {
    if (scrubbing.current) { setFrameFromPointer(e); return; }
    const d = drag.current; if (!d) return;
    const df = (e.clientX - d.x) / px, { c } = d;
    if (d.mode === 'move') updateClip(c.id, { start: Math.max(0, snap(c.start + df, c.id)) });
    else if (d.mode === 'r') { const end = snap(c.start + c.len + df, c.id); updateClip(c.id, { len: Math.max(5, end - c.start) }); }
    else { const s = Math.min(snap(c.start + df, c.id), c.start + c.len - 5); updateClip(c.id, { start: Math.max(0, s), len: c.start + c.len - Math.max(0, s) }); }
  };
  const up = () => { drag.current = null; scrubbing.current = false; };

  const keyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); set({ playing: !useStore.getState().playing }); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); set({ currentFrame: Math.max(0, frame + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? FPS : 1)) }); }
    if (e.key === 'Home') { e.preventDefault(); set({ currentFrame: 0 }); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (sel || activeClipId)) { e.preventDefault(); e.stopPropagation(); deleteSelectedClip(); }
  };
  const focusTimeline = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.closest('button,select,input')) e.currentTarget.focus({ preventScroll: true });
  };
  const deleteSelectedClip = () => {
    const selectedId = activeClipId ?? sel; if (!selectedId) return;
    const selected = tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedId);
    removeClip(selectedId); setSel(null);
    if (selected?.objectId && !tracks.flatMap((track) => track.clips).some((clip) => clip.id !== selectedId && clip.objectId === selected.objectId)) eng()?.removeObject(selected.objectId);
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const current = useStore.getState().currentFrame;
      const end = Math.max(1, ...useStore.getState().tracks.flatMap((t) => t.clips.map((c) => c.start + c.len)));
      if (current >= end) set({ playing: false, currentFrame: 0 });
      else set({ currentFrame: current + 1 });
    }, 1000 / FPS);
    return () => window.clearInterval(timer);
  }, [playing, set]);
  useEffect(() => { eng()?.applyAt(frame / FPS); }, [eng, frame, tracks]);
  useEffect(() => { if (sel && !tracks.some((t) => t.clips.some((c) => c.id === sel))) setSel(null); }, [sel, tracks]);

  return (
    <div data-timeline="true" tabIndex={0} className="flex h-full min-h-0 flex-col text-xs outline-none focus-visible:ring-1 focus-visible:ring-cyan-500" onKeyDown={keyDown} onPointerDownCapture={focusTimeline} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-2 py-1.5">
        <button className="btn inline-flex items-center gap-1" title="Kembali ke awal" onClick={() => set({ playing: false, currentFrame: 0 })}><SkipBack size={14} /></button>
        <button className="btn inline-flex items-center gap-1" title={playing ? 'Jeda' : 'Putar'} onClick={() => set({ playing: !playing })}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        <button className="btn inline-flex items-center gap-1" title="Maju satu frame" onClick={() => set({ currentFrame: frame + 1 })}><SkipForward size={14} /></button>
        <button className="btn inline-flex items-center gap-1" onClick={() => splitAt(frame)}><Scissors size={14} /> Pisah di playhead</button>
        {(sel || activeClipId) && <button className="btn inline-flex items-center gap-1" title="Hapus klip terpilih" onClick={deleteSelectedClip}><Trash2 size={14} /></button>}
        <span className="rounded bg-black/30 px-2 py-1 font-mono text-cyan-300">{(frame / FPS).toFixed(2)}s</span>
        <span className="ml-auto flex items-center gap-1">
          <select className="btn bg-panel" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Jenis klip baru">
            {(Object.keys(color) as Kind[]).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button className="btn inline-flex items-center gap-1" onClick={() => useStore.getState().addClip(kind)}><Plus size={14} /> Klip</button>
        </span>
        <span className="flex items-center gap-1">
          <button className="btn" aria-label="Perkecil timeline" title="Perkecil timeline" onClick={() => setPx((v) => Math.max(1.5, v / 1.25))}><ZoomOut size={14} /></button>
          <button className="btn" aria-label="Perbesar timeline" title="Perbesar timeline" onClick={() => setPx((v) => Math.min(12, v * 1.25))}><ZoomIn size={14} /></button>
        </span>
        <span className="hidden text-slate-500 md:inline">Seret klip untuk menggeser · tarik tepi untuk trim · klik ruler untuk scrub</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="relative" style={{ width }}>
          <div className="mb-1 flex h-6 items-end border-b border-slate-800 text-[10px] text-slate-500">
            <div className="w-16 shrink-0">WAKTU</div>
            <div ref={ruler} className="relative h-full flex-1 touch-none" onPointerDown={(e) => { scrubbing.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setFrameFromPointer(e); }}>
              {Array.from({ length: Math.ceil(duration / (FPS * 2)) + 1 }, (_, i) => <span key={i} className="absolute bottom-0 border-l border-slate-700 pl-1" style={{ left: i * FPS * 2 * px }}>{i * 2}s</span>)}
            </div>
          </div>
          {tracks.map((t) => (
            <div key={t.id} className="mb-1 flex h-9 items-center">
              <div className="w-16 shrink-0 capitalize text-slate-400">{t.kind}</div>
              <div className="relative h-8 flex-1 touch-none rounded bg-black/30" onPointerDown={(e) => { scrubbing.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setFrameFromPointer(e); }}>
                {t.clips.map((c) => (
                  <div key={c.id} onPointerDown={(e) => down(e, c, 'move')}
                    className="absolute top-0 h-8 cursor-grab select-none truncate rounded px-3 leading-8 touch-none"
                    style={{ left: c.start * px, width: Math.max(24, c.len * px), background: color[t.kind] + ((activeClipId ?? sel) === c.id ? '66' : '33'), border: `1px solid ${color[t.kind]}`, boxShadow: (activeClipId ?? sel) === c.id ? `0 0 0 1px ${color[t.kind]}` : undefined }}>
                    <i onPointerDown={(e) => down(e, c, 'l')} className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize" aria-label="Trim awal" />
                    {c.label}
                    <i onPointerDown={(e) => down(e, c, 'r')} className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize" aria-label="Trim akhir" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: 64 + frame * px }}><span className="absolute -left-1 -top-1 h-2 w-2 rounded-b bg-red-500" /></div>
        </div>
      </div>
    </div>
  );
}
