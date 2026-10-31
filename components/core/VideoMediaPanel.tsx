'use client';
import { useEffect, useRef, useState } from 'react';
import { FileVideo2, Image, Music2, Plus, Upload, X, WandSparkles } from 'lucide-react';
import type { Engine } from '@/lib/engine/fabric-engine';
import { MOTION_PRESETS, type MotionEnter, type MotionPosition } from '@/lib/motion-graphics';
import { useStore } from '@/lib/store';

export type MediaAsset = { id: string; name: string; url: string; kind: 'video' | 'image' | 'audio'; file: File };
type Props = { selected: string | null; onPreview: (item: MediaAsset | null) => void; eng: () => Engine | null };
type Tab = 'Media' | 'Audio' | 'Teks' | 'Stiker' | 'Motion';
const fileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Gambar tidak dapat dibaca.'));
  reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
  reader.readAsDataURL(file);
});

export default function VideoMediaPanel({ selected, onPreview, eng }: Props) {
  const [tab, setTab] = useState<Tab>('Media'), [items, setItems] = useState<MediaAsset[]>([]), [message, setMessage] = useState('');
  const [motionId, setMotionId] = useState(MOTION_PRESETS[0].id), [motionTitle, setMotionTitle] = useState(MOTION_PRESETS[0].title), [motionSubtitle, setMotionSubtitle] = useState(MOTION_PRESETS[0].subtitle);
  const [motionDuration, setMotionDuration] = useState(MOTION_PRESETS[0].duration / 24);
  const [motionEnter, setMotionEnter] = useState<MotionEnter>(MOTION_PRESETS[0].enter);
  const [motionPosition, setMotionPosition] = useState<MotionPosition>(MOTION_PRESETS[0].position);
  const currentFrame = useStore((s) => s.currentFrame);
  const input = useRef<HTMLInputElement>(null), itemsRef = useRef<MediaAsset[]>([]);
  itemsRef.current = items;
  useEffect(() => () => { itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)); }, []);

  const importFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).flatMap((file): MediaAsset[] => {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : null;
      return kind ? [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, url: URL.createObjectURL(file), kind, file }] : [];
    });
    setItems((current) => [...current, ...next]);
    setTab(next.some((item) => item.kind === 'audio') && !next.some((item) => item.kind !== 'audio') ? 'Audio' : 'Media');
    setMessage(next.length ? '' : 'Pilih file video, gambar, atau audio.');
  };
  const visible = items.filter((item) => tab === 'Audio' ? item.kind === 'audio' : tab === 'Media' ? item.kind !== 'audio' : false);
  const remove = (item: MediaAsset) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    URL.revokeObjectURL(item.url);
    if (selected === item.id) onPreview(null);
  };
  const addText = () => { const engine = eng(); if (!engine) return setMessage('Canvas belum siap.'); engine.addText(); engine.addSelectedToTimeline('text'); setMessage('Teks ditambahkan ke monitor dan timeline.'); };
  const addSticker = (value: string) => { const engine = eng(); if (!engine) return setMessage('Canvas belum siap.'); engine.addSticker(value); engine.addSelectedToTimeline('text'); setMessage('Stiker ditambahkan ke monitor dan timeline.'); };
  const addImageToCanvas = async (item: MediaAsset) => {
    const engine = eng(); if (!engine) return setMessage('Canvas belum siap.');
    try { await engine.addImage(await fileDataUrl(item.file)); engine.addSelectedToTimeline('overlay'); if (selected === item.id) onPreview(null); setMessage('Gambar ditambahkan ke monitor dan timeline.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Gambar tidak dapat ditambahkan.'); }
  };
  const chooseMotion = (presetId: string) => {
    const preset = MOTION_PRESETS.find((item) => item.id === presetId); if (!preset) return;
    setMotionId(preset.id); setMotionTitle(preset.title); setMotionSubtitle(preset.subtitle);
    setMotionDuration(preset.duration / 24); setMotionEnter(preset.enter); setMotionPosition(preset.position);
  };
  const addMotion = () => {
    const engine = eng(); if (!engine) return setMessage('Canvas belum siap.');
    const preset = MOTION_PRESETS.find((item) => item.id === motionId); if (!preset) return;
    const id = engine.addMotionGraphic(preset.id, currentFrame, Math.round(motionDuration * 24), { title: motionTitle, subtitle: motionSubtitle, enter: motionEnter, position: motionPosition });
    setMessage(id ? 'Motion graphic ditambahkan ke track Overlay.' : 'Template tidak dapat dimuat.');
  };

  return (
    <aside className="neon flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-panel text-sm" style={{ ['--c' as string]: '#303030' }}>
      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-[#3a3a3a] p-2">
        {(['Media', 'Audio', 'Teks', 'Stiker', 'Motion'] as const).map((item) => <button key={item} className="btn min-w-0 whitespace-nowrap px-1" data-on={tab === item} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {(tab === 'Media' || tab === 'Audio') && <>
          <input ref={input} className="hidden" type="file" multiple accept="video/*,image/*,audio/*" onChange={(e) => { importFiles(e.target.files); e.target.value = ''; }} />
          <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-600 bg-[#202020] px-3 py-3 text-xs text-slate-200 hover:border-slate-400 hover:bg-[#282828]" onClick={() => input.current?.click()}><Upload size={15} /> Impor media</button>
          {visible.length === 0 ? <div className="rounded-md border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-500">{tab === 'Audio' ? 'Audio yang diimpor akan muncul di sini.' : 'Impor video, gambar, atau audio untuk melihat media di monitor.'}</div> :
            <div className="grid grid-cols-2 gap-2">{visible.map((item) => <div key={item.id} className="group relative min-w-0">
              <button className="block w-full overflow-hidden rounded border border-[#383838] bg-[#1b1b1b] text-left hover:border-blue-400" data-on={selected === item.id} onClick={() => { onPreview(item); setMessage(''); }} title={item.name}>
                <div className="flex aspect-video items-center justify-center overflow-hidden bg-black">
                  {item.kind === 'image' ? <img src={item.url} alt="" className="h-full w-full object-cover" /> : item.kind === 'video' ? <video src={item.url} muted preload="metadata" className="h-full w-full object-cover" /> : <Music2 size={22} className="text-purple-300" />}
                </div>
                <span className="block truncate px-1.5 py-1 text-[10px] text-slate-300">{item.name}</span>
              </button>
              {item.kind === 'image' && <button className="absolute left-1 top-1 rounded bg-black/80 p-1.5 text-white hover:bg-blue-600" onClick={() => void addImageToCanvas(item)} title="Tambahkan gambar ke monitor dan timeline" aria-label={`Tambahkan ${item.name} ke timeline`}><Plus size={13} /></button>}
              <button className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white opacity-0 hover:bg-black group-hover:opacity-100" onClick={() => remove(item)} aria-label={`Hapus ${item.name}`}><X size={12} /></button>
            </div>)}</div>}
        </>}
        {tab === 'Teks' && <div className="space-y-2">
          <p className="mb-3 text-xs text-slate-500">Tambahkan judul langsung ke monitor canvas.</p>
          <button className="btn flex w-full items-center gap-2" onClick={addText}><Plus size={14} /> Tambah teks</button>
          <button className="btn w-full" onClick={() => { const engine = eng(); if (!engine) return setMessage('Canvas belum siap.'); engine.addCaption('Judul video'); engine.addSelectedToTimeline('text'); setMessage('Judul ditambahkan ke monitor dan timeline.'); }}>Judul video</button>
        </div>}
        {tab === 'Stiker' && <div className="space-y-2">
          <p className="mb-3 text-xs text-slate-500">Pilih stiker untuk ditambahkan ke canvas.</p>
          <div className="grid grid-cols-3 gap-1">{['🔥', '⭐', '💥', '❤️', '😂', '🎉'].map((value) => <button key={value} className="btn text-xl" onClick={() => addSticker(value)}>{value}</button>)}</div>
        </div>}
        {tab === 'Motion' && <div className="space-y-2">
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-400"><WandSparkles size={14} /> Template motion graphic</div>
          {MOTION_PRESETS.map((preset) => <button key={preset.id} className="video-motion-card block w-full rounded-md border border-[#383838] bg-[#202020] p-2.5 text-left hover:border-blue-400 hover:bg-[#272727]" data-on={motionId === preset.id} onClick={() => chooseMotion(preset.id)}>
            <span className="mb-1 block text-xs font-medium text-slate-100">{preset.name}<span className="float-right text-[10px] text-slate-500">{(preset.duration / 24).toFixed(1)}s</span></span>
            <span className="block text-[10px] text-slate-400">{preset.description}</span>
            <span className="mt-2 block truncate rounded px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: preset.fill, color: preset.text, borderLeft: `3px solid ${preset.accent}` }}>{preset.title}</span>
          </button>)}
          <div className="rounded-md border border-[#343941] bg-[#191c21] p-2.5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">Sesuaikan motion</div>
            <label className="mb-2 block text-xs text-slate-400">Judul<input className="btn mt-1 w-full" value={motionTitle} onChange={(e) => setMotionTitle(e.target.value)} /></label>
            <label className="mb-2 block text-xs text-slate-400">Subjudul<input className="btn mt-1 w-full" value={motionSubtitle} onChange={(e) => setMotionSubtitle(e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">Posisi<select className="btn mt-1 w-full" value={motionPosition} onChange={(e) => setMotionPosition(e.target.value as MotionPosition)}>
                <option value="lower-left">Bawah kiri</option><option value="lower-center">Bawah tengah</option><option value="lower-right">Bawah kanan</option><option value="center">Tengah</option><option value="top-center">Atas tengah</option>
              </select></label>
              <label className="block text-xs text-slate-400">Masuk<select className="btn mt-1 w-full" value={motionEnter} onChange={(e) => setMotionEnter(e.target.value as MotionEnter)}>
                <option value="left">Dari kiri</option><option value="right">Dari kanan</option><option value="top">Dari atas</option><option value="bottom">Dari bawah</option><option value="scale">Zoom</option>
              </select></label>
            </div>
            <label className="mt-2 block text-xs text-slate-400">Durasi: {motionDuration.toFixed(2)} dtk<input className="mt-1 w-full accent-blue-400" type="range" min={1} max={10} step={0.25} value={motionDuration} onChange={(e) => setMotionDuration(+e.target.value)} /></label>
          </div>
          <button className="btn flex w-full items-center justify-center gap-2 border-blue-500/50 bg-blue-600/20" onClick={addMotion}><Plus size={14} /> Tambahkan ke timeline</button>
        </div>}
        {message && <p role="alert" className="mt-2 text-xs text-orange-300">{message}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[#3a3a3a] px-3 py-2 text-[10px] text-slate-500"><FileVideo2 size={13} /><Image size={13} /><Music2 size={13} /> Media lokal</div>
    </aside>
  );
}
