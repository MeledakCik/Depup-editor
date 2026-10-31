'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Eye, EyeOff, LockKeyhole, Unlock, Layers3, Undo2, Redo2, Save, FolderOpen } from 'lucide-react';
import { useStore, type ClipAnimation, type ClipTransform, type Tool, type Track } from '@/lib/store';
import type { Engine } from '@/lib/engine/fabric-engine';
import { packDepup, saveDepup, openDepup, emptyProject, unpackDepup } from '@/lib/engine/depup-format';
import VideoMediaPanel, { type MediaAsset } from './VideoMediaPanel';
import VideoSourcePreview from './VideoSourcePreview';
import Timeline from './Timeline';
import SidePanels, { type ExportKind } from './SidePanels';

const UnifiedCanvas = dynamic(() => import('./UnifiedCanvas'), { ssr: false });
const dl = (href: string, name: string) => {
  const a = document.createElement('a'); a.href = href; a.download = name; a.click();
  if (href.startsWith('blob:')) window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
};
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Terjadi kesalahan yang tidak diketahui.';
const animations: ClipAnimation[] = ['none', 'fade', 'slide-up', 'slide-left', 'zoom'];
const normalizeTracks = (value: unknown): Track[] => {
  if (!Array.isArray(value)) return [];
  const kinds = ['video', 'audio', 'text', 'overlay'] as const;
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>, kind = row.kind;
    if (!kinds.includes(kind as (typeof kinds)[number])) return [];
    const clips = Array.isArray(row.clips) ? row.clips.flatMap((raw, clipIndex) => {
      if (!raw || typeof raw !== 'object') return [];
      const clip = raw as Record<string, unknown>, start = Number(clip.start), len = Number(clip.len);
      if (!Number.isFinite(start) || !Number.isFinite(len) || len <= 0) return [];
      const rawBase = clip.baseTransform && typeof clip.baseTransform === 'object' ? clip.baseTransform as Record<string, unknown> : null;
      const baseKeys = ['left', 'top', 'scaleX', 'scaleY', 'angle', 'opacity'] as const;
      const baseTransform = rawBase && baseKeys.every((key) => Number.isFinite(Number(rawBase[key])))
        ? Object.fromEntries(baseKeys.map((key) => [key, Number(rawBase[key])])) as ClipTransform
        : undefined;
      return [{
        id: String(clip.id ?? `${index}-${clipIndex}`), start: Math.max(0, start), len,
        label: String(clip.label ?? `Klip ${clipIndex + 1}`),
        ...(typeof clip.objectId === 'string' ? { objectId: clip.objectId } : {}),
        ...(typeof clip.motionTemplate === 'string' ? { motionTemplate: clip.motionTemplate } : {}),
        ...(animations.includes(clip.inAnimation as ClipAnimation) ? { inAnimation: clip.inAnimation as ClipAnimation } : {}),
        ...(animations.includes(clip.outAnimation as ClipAnimation) ? { outAnimation: clip.outAnimation as ClipAnimation } : {}),
        ...(Number.isFinite(Number(clip.transitionFrames)) ? { transitionFrames: Math.max(1, Number(clip.transitionFrames)) } : {}),
        ...(baseTransform ? { baseTransform } : {}),
      }];
    }) : [];
    return [{ id: String(row.id ?? `track-${index}`), kind: kind as Track['kind'], clips }];
  });
};

export default function DepupHub() {
  const eng = useRef<Engine | null>(null), fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState(''), [activeMedia, setActiveMedia] = useState<MediaAsset | null>(null);
  const [mobileVideoPanel, setMobileVideoPanel] = useState<'media' | 'inspector'>('media');
  const { mode, tool, zoom, layers, selection, progress, prototypePreview, set } = useStore();
  const ready = useCallback((e: Engine) => { eng.current = e; }, []);
  const getEngine = useCallback(() => eng.current, []);

  const save = useCallback(async () => {
    if (!eng.current) throw new Error('Canvas masih disiapkan. Coba lagi sebentar.');
    const p = emptyProject(); p.pages[0].canvas = eng.current.toJSON();
    p.timeline = { tracks: useStore.getState().tracks };
    await saveDepup(packDepup(p));
  }, []);
  const loadFile = useCallback(async (file: File) => {
    if (!eng.current) throw new Error('Canvas masih disiapkan. Coba lagi sebentar.');
    const data = unpackDepup(new Uint8Array(await file.arrayBuffer()));
    const canvas = data.project?.pages?.[0]?.canvas;
    if (!canvas) throw new Error('File ini tidak berisi halaman canvas DEPUP yang valid.');
    await eng.current.load(canvas);
    const tracks = (data.project.timeline as { tracks?: unknown[] } | undefined)?.tracks;
    set({ tracks: normalizeTracks(tracks), currentFrame: 0, playing: false, activeClipId: null });
  }, [set]);
  const open = useCallback(async () => {
    const data = await openDepup();
    if (!data) { fileInput.current?.click(); return; }
    if (!eng.current) throw new Error('Canvas masih disiapkan. Coba lagi sebentar.');
    const canvas = data.project?.pages?.[0]?.canvas;
    if (!canvas) throw new Error('File ini tidak berisi halaman canvas DEPUP yang valid.');
    await eng.current.load(canvas);
    const tracks = (data.project.timeline as { tracks?: unknown[] } | undefined)?.tracks;
    set({ tracks: normalizeTracks(tracks), currentFrame: 0, playing: false, activeClipId: null });
  }, [set]);
  const action = useCallback(async (fn: () => void | Promise<void>) => {
    setMessage('');
    try { await fn(); }
    catch (e) { if ((e as { name?: string })?.name === 'AbortError') return; setMessage(errorText(e)); }
  }, []);

  const exportPdf = useCallback(async () => {
    if (!eng.current) throw new Error('Canvas belum siap.');
    const { jsPDF } = await import('jspdf'), c = eng.current.canvas;
    const pdf = new jsPDF({ orientation: c.getWidth() >= c.getHeight() ? 'landscape' : 'portrait', unit: 'px', format: [c.getWidth(), c.getHeight()] });
    pdf.addImage(eng.current.exportPNG(), 'PNG', 0, 0, c.getWidth(), c.getHeight()); pdf.save('depup.pdf');
  }, []);
  const exportPng = useCallback(() => { const engine = getEngine(); if (!engine) throw new Error('Canvas belum siap.'); dl(engine.exportPNG(), 'depup.png'); }, [getEngine]);
  const exportJpg = useCallback(() => { const engine = getEngine(); if (!engine) throw new Error('Canvas belum siap.'); dl(engine.exportJPG(), 'depup.jpg'); }, [getEngine]);
  const exportSvg = useCallback(() => { const engine = getEngine(); if (!engine) throw new Error('Canvas belum siap.'); dl(URL.createObjectURL(new Blob([engine.exportSVG()], { type: 'image/svg+xml' })), 'depup.svg'); }, [getEngine]);
  const exportMp4 = useCallback(async (uhd = false) => {
    if (!eng.current) throw new Error('Canvas belum siap.');
    if (useStore.getState().progress > 0) throw new Error('Export video sedang berjalan. Tunggu sampai selesai.');
    const engine = eng.current;
    const resumePlayback = useStore.getState().playing, restoreFrame = useStore.getState().currentFrame;
    let video: HTMLVideoElement | null = null, image: HTMLImageElement | null = null;
    set({ progress: 0.01, playing: false });
    try {
      const { framesToMp4 } = await import('@/lib/engine/ffmpeg-client');
      const endFrame = Math.max(48, ...useStore.getState().tracks.flatMap((track) => track.clips.map((clip) => clip.start + clip.len)));
      if (activeMedia?.kind === 'video') {
        video = document.createElement('video'); video.src = activeMedia.url; video.muted = true; video.preload = 'auto'; video.playsInline = true;
        await new Promise<void>((resolve, reject) => {
          const ready = () => { video?.removeEventListener('loadeddata', ready); resolve(); };
          const failed = () => { video?.removeEventListener('error', failed); reject(new Error('Video sumber tidak dapat dibaca untuk export.')); };
          video?.addEventListener('loadeddata', ready, { once: true }); video?.addEventListener('error', failed, { once: true }); video?.load();
        });
      } else if (activeMedia?.kind === 'image') {
        image = new window.Image(); image.src = activeMedia.url; await image.decode();
      }
      const frames = await engine.captureFrames(endFrame / 24, 24, uhd ? 3840 : 1280, (i) => engine.applyAt(i / 24), video ?? image);
      const blob = await framesToMp4(frames, 24, (p) => set({ progress: Math.max(0.02, p) }));
      dl(URL.createObjectURL(blob), uhd ? 'depup-4k.mp4' : 'depup.mp4');
    } finally {
      video?.pause(); if (video) { video.removeAttribute('src'); video.load(); }
      if (image) image.src = '';
      engine.applyAt(restoreFrame / 24); set({ progress: 0, playing: resumePlayback });
    }
  }, [activeMedia, set]);
  const onExport = useCallback((kind: ExportKind) => {
    const jobs: Record<ExportKind, () => void | Promise<void>> = {
      PNG: exportPng, JPG: exportJpg, SVG: exportSvg, PDF: exportPdf,
      'MP4 720p': () => exportMp4(false), 'MP4 4K': () => exportMp4(true),
    };
    void action(jobs[kind]);
  }, [action, exportJpg, exportMp4, exportPdf, exportPng, exportSvg]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 's') { e.preventDefault(); void action(save); }
      if (e.key.toLowerCase() === 'o') { e.preventDefault(); void action(open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [action, open, save]);

  const tools: [Tool, string, string][] = [['select', 'Pilih', 'V'], ['pen', 'Pen', 'P'], ['text', 'Teks', 'T'], ['hand', 'Geser', 'H']];
  const panel = (c: string) => ({ ['--c' as string]: c }) as React.CSSProperties;

  return (
    <div className="editor-shell grid h-dvh min-h-0 gap-2 p-2" data-editor-mode={mode} data-mobile-panel={mobileVideoPanel}>
      <header className="editor-header neon col-span-full flex min-w-0 flex-wrap items-center gap-3 rounded-lg bg-panel px-3 py-2" style={panel('#303030')}>
        <div className="editor-brand-group flex min-w-0 items-center gap-3">
          <b className="editor-brand mr-1 tracking-wide">DEPUP<span>.WORK</span></b>
          <span className="editor-header-divider h-5 w-px" />
          <div className="editor-mode-switch flex items-center gap-1 rounded-lg p-1">
            {(['design', 'video'] as const).map((m) => <button key={m} className="btn" data-on={mode === m} onClick={() => { if (m === 'design') setActiveMedia(null); set({ mode: m, ...(m === 'video' ? { prototypePreview: false } : { playing: false }) }); }}>{m === 'design' ? 'Design' : 'Video'}</button>)}
          </div>
        </div>
        <div className="editor-header-actions ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <button className="btn editor-icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={() => getEngine()?.undo()}><Undo2 size={15} /></button>
          <button className="btn editor-icon-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={() => getEngine()?.redo()}><Redo2 size={15} /></button>
          {mode === 'design' && <button className="btn" data-on={prototypePreview} onClick={() => set({ prototypePreview: !prototypePreview })}>{prototypePreview ? 'Keluar Preview' : '▶ Preview'}</button>}
          <button className="btn editor-primary-btn" title="Simpan proyek (Ctrl+S)" onClick={() => void action(save)}><Save size={14} /><span>Simpan</span></button>
          <button className="btn editor-open-btn" title="Buka proyek (Ctrl+O)" onClick={() => void action(open)}><FolderOpen size={14} /><span>Buka</span></button>
        </div>
        <input ref={fileInput} hidden type="file" accept=".depup,application/zip" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void action(() => loadFile(file)); }} />
      </header>

      {mode === 'video' && <nav className="editor-mobile-controls flex items-center gap-2 rounded-lg border border-[#303030] bg-panel p-1" aria-label="Panel video">
        <button className="btn flex-1" data-on={mobileVideoPanel === 'media'} aria-pressed={mobileVideoPanel === 'media'} onClick={() => setMobileVideoPanel('media')}>Media & template</button>
        <button className="btn flex-1" data-on={mobileVideoPanel === 'inspector'} aria-pressed={mobileVideoPanel === 'inspector'} onClick={() => setMobileVideoPanel('inspector')}>Properti</button>
      </nav>}

      {mode === 'design' && (
        <aside className="editor-layers neon min-h-0 overflow-auto rounded-lg bg-panel p-2 text-sm" style={panel('#3b82f6')}>
          <div className="mb-2 flex items-center gap-2 border-b border-slate-800 px-1 pb-2 font-medium"><Layers3 size={15} /> Layers <span className="ml-auto text-xs text-slate-500">{layers.length}</span></div>
          {layers.length === 0 && <p className="px-1 text-xs leading-5 text-slate-500">Belum ada objek. Tambahkan bentuk, teks, atau gambar untuk mulai.</p>}
          <div className="space-y-0.5">
            {layers.map((layer) => <div key={layer.id} className="group flex items-center rounded hover:bg-white/5" data-on={selection?.id === layer.id}>
              <button className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs" onClick={() => getEngine()?.selectLayer(layer.id)} title={`Pilih ${layer.name}`}>
                <span className="mr-2 text-slate-500">{layer.type === 'i-text' ? 'T' : '\u25c7'}</span>{layer.name}
              </button>
              <button className="p-1 text-slate-500 hover:text-white" onClick={() => getEngine()?.toggleLayerVisibility(layer.id)} title={layer.visible ? 'Sembunyikan layer' : 'Tampilkan layer'} aria-label={layer.visible ? `Sembunyikan ${layer.name}` : `Tampilkan ${layer.name}`}>{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
              <button className="p-1 pr-2 text-slate-500 hover:text-white" onClick={() => getEngine()?.toggleLayerLock(layer.id)} title={layer.locked ? 'Buka kunci layer' : 'Kunci layer'} aria-label={layer.locked ? `Buka kunci ${layer.name}` : `Kunci ${layer.name}`}>{layer.locked ? <LockKeyhole size={12} /> : <Unlock size={12} />}</button>
            </div>)}
          </div>
        </aside>
      )}
      {mode === 'video' && <div className="editor-video-media h-full min-h-0 overflow-hidden" data-mobile-active={mobileVideoPanel === 'media'}><VideoMediaPanel selected={activeMedia?.id ?? null} onPreview={setActiveMedia} eng={getEngine} /></div>}

      <main className="editor-canvas neon relative min-h-0 overflow-hidden rounded-lg bg-ink" style={panel(mode === 'design' ? '#06b6d4' : '#22d3ee')}>
        <div className={`absolute inset-0 flex ${mode === 'design' ? '' : 'items-center justify-center bg-[#181818] p-3 sm:p-5'}`}>
          <div className={mode === 'design' ? 'absolute inset-0' : 'relative aspect-video max-h-full w-full max-w-5xl overflow-hidden border border-[#3a3a3a] bg-black shadow-2xl'}>
            {mode === 'video' && activeMedia && <VideoSourcePreview asset={activeMedia} />}
            <div className="absolute inset-0 z-10"><UnifiedCanvas onReady={ready} showGrid={mode === 'design'} /></div>
            {mode === 'video' && activeMedia && <button className="absolute right-3 top-3 z-20 rounded-md border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-white hover:bg-black" onClick={() => setActiveMedia(null)}>Kembali ke canvas</button>}
          </div>
        </div>
        {prototypePreview && <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-md border border-slate-700 bg-panel/95 px-3 py-2 text-xs shadow-lg"><span className="h-2 w-2 rounded-full bg-blue-400" />Prototype preview · klik objek terhubung<button className="btn ml-1" onClick={() => set({ prototypePreview: false })}>Selesai</button></div>}
        {mode === 'design' && !prototypePreview && <div className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-[#3a3a3a] bg-[#252525]/95 p-1.5 shadow-xl backdrop-blur">
          {tools.map(([t, label, shortcut]) => <button key={t} className="btn" data-on={tool === t} title={`${label} (${shortcut})`} onClick={() => set({ tool: t })}>{label}</button>)}
          <span className="mx-1 h-6 w-px bg-slate-600" />
          <button className="btn" title="Tambah persegi panjang" onClick={() => getEngine()?.addRect()}>Rect</button>
          <button className="btn" title="Tambah ellipse" onClick={() => getEngine()?.addEllipse()}>Ellipse</button>
          <button className="btn" title="Tambah segitiga" onClick={() => getEngine()?.addTriangle()}>Segitiga</button>
          <span className="mx-1 h-6 w-px bg-slate-600" />
          <button className="btn" onClick={() => void action(() => { const engine = getEngine(); if (!engine) throw new Error('Canvas belum siap.'); if (!engine.autoLayoutSelected('row')) throw new Error('Pilih minimal dua objek untuk memakai Auto Layout.'); })}>Auto Layout</button>
        </div>}
      </main>

      <aside className="editor-inspector neon min-h-0 overflow-auto rounded-lg bg-panel p-2" data-mobile-active={mobileVideoPanel === 'inspector'} style={panel(mode === 'design' ? '#f97316' : '#a855f7')}>
        <SidePanels mode={mode} eng={getEngine} zoom={zoom} onExport={onExport} />
        {mode === 'design' && <p className="mt-3 border-t border-slate-800 pt-2 text-xs leading-5 text-slate-500">Drag untuk memilih dan memindahkan. Tahan Space untuk menggeser kanvas. Scroll untuk zoom.</p>}
      </aside>

      {mode === 'video' && <section className="editor-timeline neon col-span-full min-h-0 overflow-hidden rounded-lg bg-panel" style={panel('#a855f7')}><Timeline eng={getEngine} /></section>}

      <footer className="editor-footer col-span-full flex min-w-0 items-center justify-center gap-2">
        {progress > 0 && <div className="ml-2 h-1.5 w-32 overflow-hidden rounded bg-slate-800"><div className="h-full bg-purple-500 transition-[width]" style={{ width: `${progress * 100}%` }} /></div>}
        {message && <span role="alert" className="max-w-full truncate px-2 text-xs text-orange-300" title={message}>{message}</span>}
      </footer>
    </div>
  );
}
