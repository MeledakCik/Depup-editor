'use client';
import { useEffect, useRef, useState } from 'react';
import type { Engine } from '@/lib/engine/fabric-engine';
import { useStore, type ClipAnimation } from '@/lib/store';

export type ExportKind = 'PNG' | 'JPG' | 'SVG' | 'PDF' | 'MP4 720p' | 'MP4 4K';
const exportKinds: ExportKind[] = ['PNG', 'JPG', 'SVG', 'PDF', 'MP4 720p', 'MP4 4K'];
type Props = { mode: 'design' | 'video'; eng: () => Engine | null; zoom: number; onExport: (kind: ExportKind) => void };
const Row = ({ l, children }: { l: string; children: React.ReactNode }) => <label className="mb-2 block text-xs text-slate-400">{l}{children}</label>;
const Section = ({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) => <details open={open} className="border-b border-[#3a3a3a]">
  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between py-2 text-sm font-medium text-slate-100 hover:text-white">{title}<span className="text-lg font-light text-slate-400">＋</span></summary>
  <div className="pb-3">{children}</div>
</details>;
const Range = ({ l, min, max, step, init = 0, value, on }: { l: string; min: number; max: number; step: number; init?: number; value?: number; on: (v: number) => void }) => {
  const [v, setV] = useState(value ?? init);
  useEffect(() => { if (value !== undefined) setV(value); }, [value]);
  return <Row l={`${l}: ${Number(v.toFixed(2))}`}><input className="w-full" type="range" min={min} max={max} step={step} value={v} onChange={(e) => { setV(+e.target.value); on(+e.target.value); }} /></Row>;
};
const NumberField = ({ label, value, min, max, step = 1, on }: { label: string; value: number; min?: number; max?: number; step?: number; on: (v: number) => void }) => {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const commit = () => { const next = Number(raw); if (Number.isFinite(next) && next !== value) on(next); else if (!Number.isFinite(next)) setRaw(String(value)); };
  return <label className="block min-w-0 text-[11px] text-slate-400">{label}<input className="mt-1 h-8 w-full rounded border border-slate-700 bg-[#111722] px-2 text-xs text-slate-100 outline-none focus:border-cyan-500" type="number" min={min} max={max} step={step} value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>;
};
const toDataURL = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Gambar tidak dapat dibaca.'));
  reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
  reader.readAsDataURL(file);
});

export default function SidePanels({ mode, eng, zoom, onExport }: Props) {
  const videoTabs = ['Properti', 'Animasi', 'Warna', 'Keyframe', 'Caption', 'Stiker', 'Audio'];
  const [inspectorTab, setInspectorTab] = useState<'design' | 'prototype'>('design');
  const [tab, setTab] = useState(videoTabs[0]), [msg, setMsg] = useState(''), [name, setName] = useState('Tombol'), [time, setTime] = useState(0), [recording, setRecording] = useState(false), [hasAudio, setHasAudio] = useState(false), [audioPlaying, setAudioPlaying] = useState(false);
  const selection = useStore((s) => s.selection);
  const tracks = useStore((s) => s.tracks), activeClipId = useStore((s) => s.activeClipId), updateClip = useStore((s) => s.updateClip);
  const activeClip = tracks.flatMap((track) => track.clips).find((clip) => clip.id === activeClipId) ?? null;
  const layers = useStore((s) => s.layers), prototypePreview = useStore((s) => s.prototypePreview);
  const file = useRef<HTMLInputElement>(null), audio = useRef<HTMLInputElement>(null), wave = useRef<HTMLCanvasElement>(null);
  const recog = useRef<any>(null), audioContext = useRef<AudioContext | null>(null), audioBuffer = useRef<AudioBuffer | null>(null), source = useRef<AudioBufferSourceNode | null>(null), gain = useRef<GainNode | null>(null);
  useEffect(() => { setTab(videoTabs[0]); setInspectorTab('design'); setMsg(''); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { recog.current?.stop(); source.current?.stop(); void audioContext.current?.close(); }, []);

  const run = async (fn: (engine: Engine) => unknown | Promise<unknown>, failure = '') => {
    const engine = eng();
    if (!engine) { setMsg('Editor masih disiapkan. Coba lagi sebentar.'); return; }
    try {
      const result = await fn(engine);
      setMsg(result === false ? failure : '');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Aksi tidak dapat diselesaikan.'); }
  };
  const caption = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return setMsg('Browser ini tidak mendukung Web Speech API. Gunakan Chrome atau Edge.');
    if (recording) { recog.current?.stop(); setRecording(false); return; }
    const r = new SR(); r.lang = 'id-ID'; r.continuous = true;
    r.onresult = (ev: any) => { const result = ev.results[ev.results.length - 1]; if (result.isFinal) void run((engine) => engine.addCaption(result[0].transcript)); };
    r.onerror = () => { setRecording(false); setMsg('Mikrofon tidak dapat digunakan. Periksa izin browser.'); };
    r.onend = () => setRecording(false);
    try { r.start(); recog.current = r; setRecording(true); setMsg(''); } catch { setMsg('Perekaman caption tidak dapat dimulai.'); }
  };
  const loadAudio = async (f: File) => {
    const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx;
    const buf = await ctx.decodeAudioData(await f.arrayBuffer()); audioBuffer.current = buf; setHasAudio(true);
    const cv = wave.current, g = cv?.getContext('2d'); if (!cv || !g) return;
    const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / cv.width));
    g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#a855f7';
    for (let x = 0; x < cv.width; x++) {
      let peak = 0;
      for (let i = 0; i < step; i += Math.max(1, Math.floor(step / 64))) peak = Math.max(peak, Math.abs(d[Math.min(d.length - 1, x * step + i)] || 0));
      g.fillRect(x, cv.height / 2 - peak * cv.height / 2, 1, peak * cv.height);
    }
  };
  const playAudio = async () => {
    const ctx = audioContext.current, buf = audioBuffer.current;
    if (source.current) { source.current.stop(); source.current = null; setAudioPlaying(false); return; }
    if (!ctx || !buf) return;
    await ctx.resume();
    const src = ctx.createBufferSource(); src.buffer = buf; gain.current = ctx.createGain(); src.connect(gain.current).connect(ctx.destination);
    src.onended = () => { source.current = null; setAudioPlaying(false); };
    source.current = src; setAudioPlaying(true); src.start();
  };
  const apply = (key: string, value: unknown) => void run((engine) => engine.setProp(key, value));

  const body: Record<string, React.ReactNode> = {
    Animasi: <div className="space-y-3">
      {!selection && !activeClip && <p className="rounded-md border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-400">Pilih teks atau gambar di monitor untuk menambahkan animasi.</p>}
      {selection && !activeClip && <>
        <p className="text-xs leading-5 text-slate-400">Tambahkan objek terpilih sebagai klip untuk mengatur animasi masuk dan keluar.</p>
        <button className="btn w-full" onClick={() => void run((engine) => engine.addSelectedToTimeline(), 'Pilih objek di monitor dulu.')}>Tambahkan ke timeline</button>
      </>}
      {activeClip && !activeClip.objectId && <p className="rounded-md border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-400">Pilih klip yang terhubung ke teks atau gambar untuk mengedit animasinya.</p>}
      {activeClip?.objectId && <>
        <div className="rounded-md border border-slate-700 bg-[#1a1d22] p-2.5">
          <div className="text-xs font-medium text-slate-100">{activeClip.label}</div>
          <div className="mt-1 text-[10px] text-slate-500">Mulai {(activeClip.start / 24).toFixed(2)}s · Durasi {(activeClip.len / 24).toFixed(2)}s</div>
        </div>
        {activeClip.motionTemplate ? <p className="rounded-md border border-slate-700 bg-[#1a1d22] p-2 text-xs leading-5 text-slate-400">Template motion ini sudah memiliki animasi masuk dan keluar. Geser ujung klip di timeline untuk mengatur durasinya.</p> : <>
          <Row l="Animasi masuk"><select className="btn mt-1 w-full" value={activeClip.inAnimation ?? 'fade'} onChange={(e) => updateClip(activeClip.id, { inAnimation: e.target.value as ClipAnimation })}>
            <option value="none">Tanpa animasi</option><option value="fade">Fade</option><option value="slide-up">Geser dari bawah</option><option value="slide-left">Geser dari kiri</option><option value="zoom">Zoom</option>
          </select></Row>
          <Row l="Animasi keluar"><select className="btn mt-1 w-full" value={activeClip.outAnimation ?? 'fade'} onChange={(e) => updateClip(activeClip.id, { outAnimation: e.target.value as ClipAnimation })}>
            <option value="none">Tanpa animasi</option><option value="fade">Fade</option><option value="slide-up">Geser ke atas</option><option value="slide-left">Geser ke kanan</option><option value="zoom">Zoom</option>
          </select></Row>
          <Range l="Durasi transisi (detik)" min={0.1} max={Math.max(0.1, Math.min(1.5, activeClip.len / 48))} step={0.05} value={(activeClip.transitionFrames ?? 12) / 24} on={(v) => updateClip(activeClip.id, { transitionFrames: Math.max(1, Math.round(v * 24)) })} />
        </>}
        <button className="btn w-full" onClick={() => useStore.getState().set({ currentFrame: activeClip.start, playing: false })}>Ke awal klip</button>
      </>}
    </div>,
    Prototype: <div className="space-y-3">
      {!selection && <p className="rounded-md border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-400">Pilih objek yang akan menjadi tombol, lalu tentukan tujuan interaksinya.</p>}
      {selection && <>
        <div className="rounded-md bg-[#252525] p-3">
          <div className="mb-2 font-medium text-slate-100">Interaksi</div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Row l="Saat"><select className="btn mt-1 w-full" value="click" disabled><option value="click">Diklik</option></select></Row>
            <Row l="Aksi"><select className="btn mt-1 w-full" value="navigate" disabled><option value="navigate">Navigasi</option></select></Row>
          </div>
          <Row l="Tujuan"><select className="btn w-full" value={selection.prototypeTarget} onChange={(e) => void run((engine) => engine.setPrototypeTarget(e.target.value))}>
            <option value="">Pilih layer tujuan…</option>
            {layers.filter((layer) => layer.id !== selection.id).map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </select></Row>
          {selection.prototypeTarget && <button className="btn w-full" onClick={() => void run((engine) => engine.setPrototypeTarget(''))}>Hapus interaksi</button>}
        </div>
        <p className="text-xs leading-5 text-slate-400">Tekan <b>Preview</b>, lalu klik objek ini untuk berpindah ke layer tujuan.</p>
        {prototypePreview && <p className="rounded bg-blue-500/10 p-2 text-xs text-blue-200">Preview aktif. Klik objek yang memiliki interaksi untuk mencobanya.</p>}
      </>}
    </div>,
    Properti: selection ? <div className="space-y-3">
      <section className="border-b border-slate-800 pb-3">
        <div className="mb-2 flex items-center justify-between"><span className="font-medium text-slate-100">{selection.type === 'i-text' ? 'Teks' : selection.type[0].toUpperCase() + selection.type.slice(1)}</span><span className="text-[10px] text-slate-500">{selection.type}</span></div>
        <Row l="Nama layer"><input className="btn w-full text-left" value={selection.name} onChange={(e) => void run((engine) => engine.renameSelected(e.target.value))} /></Row>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={selection.left} on={(v) => apply('left', v)} />
          <NumberField label="Y" value={selection.top} on={(v) => apply('top', v)} />
          <NumberField label="W" min={1} value={selection.width} on={(v) => void run((engine) => engine.setSize(v, selection.height))} />
          <NumberField label="H" min={1} value={selection.height} on={(v) => void run((engine) => engine.setSize(selection.width, v))} />
        </div>
        <Range l="Rotasi" min={0} max={360} step={1} value={((selection.angle % 360) + 360) % 360} on={(v) => apply('angle', v)} />
        <Range l="Opasitas" min={0} max={1} step={0.05} value={selection.opacity} on={(v) => apply('opacity', v)} />
      </section>

      {selection.type !== 'image' && <>
        <section className="border-b border-slate-800 pb-3">
          <h3 className="mb-2 font-medium text-slate-100">Fill</h3>
          <Row l="Warna isi"><input className="mt-1 h-8 w-full rounded border border-slate-700 bg-[#111722] p-1" type="color" value={selection.fill} onChange={(e) => apply('fill', e.target.value)} /></Row>
          {selection.type === 'rect' && <NumberField label="Radius sudut" min={0} value={selection.radius} on={(v) => void run((engine) => engine.setProps({ rx: v, ry: v }))} />}
        </section>
        <section className="border-b border-slate-800 pb-3">
          <h3 className="mb-2 font-medium text-slate-100">Stroke</h3>
          <div className="grid grid-cols-2 gap-2">
            <Row l="Warna garis"><input className="mt-1 h-8 w-full rounded border border-slate-700 bg-[#111722] p-1" type="color" value={selection.stroke} onChange={(e) => apply('stroke', e.target.value)} /></Row>
            <NumberField label="Tebal garis" min={0} value={selection.strokeWidth} on={(v) => apply('strokeWidth', v)} />
          </div>
        </section>
      </>}

      {selection.type === 'i-text' || selection.type === 'textbox' ? <section>
        <h3 className="mb-2 font-medium text-slate-100">Tipografi</h3>
        <Row l="Konten"><textarea className="mt-1 w-full rounded border border-slate-700 bg-[#111722] p-2 text-xs text-slate-100 outline-none focus:border-cyan-500" rows={3} value={selection.text} onChange={(e) => apply('text', e.target.value)} /></Row>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Ukuran" min={1} value={selection.fontSize} on={(v) => apply('fontSize', v)} />
          <Row l="Ketebalan"><select className="btn mt-1 w-full" value={String(selection.fontWeight)} onChange={(e) => apply('fontWeight', e.target.value)}><option value="normal">Normal</option><option value="500">Medium</option><option value="600">Semi bold</option><option value="bold">Bold</option></select></Row>
          <Row l="Font"><select className="btn w-full" value={selection.fontFamily} onChange={(e) => apply('fontFamily', e.target.value)}>{['Arial', 'Inter', 'Georgia', 'Times New Roman', 'Courier New', 'sans-serif'].map((font) => <option key={font}>{font}</option>)}</select></Row>
          <Row l="Perataan"><select className="btn w-full" value={selection.textAlign} onChange={(e) => apply('textAlign', e.target.value)}><option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option><option value="justify">Rata kiri-kanan</option></select></Row>
        </div>
        <div className="mt-1 flex gap-1"><button className="btn flex-1" data-on={selection.fontStyle === 'italic'} onClick={() => apply('fontStyle', selection.fontStyle === 'italic' ? 'normal' : 'italic')}><i>I</i></button><button className="btn flex-1" data-on={String(selection.fontWeight) === 'bold' || Number(selection.fontWeight) >= 600} onClick={() => apply('fontWeight', String(selection.fontWeight) === 'bold' || Number(selection.fontWeight) >= 600 ? 'normal' : 'bold')}><b>B</b></button></div>
      </section> : null}
    </div> : <div className="rounded-md border border-dashed border-slate-700 p-3 text-xs leading-5 text-slate-500">Pilih objek di kanvas atau panel Layers untuk melihat dan mengedit propertinya.</div>,
    Komponen: <>
      <Row l="Nama komponen"><input className="btn w-full" value={name} onChange={(e) => setName(e.target.value)} /></Row>
      <button className="btn mr-1" onClick={() => void run((engine) => engine.makeComponent(name), 'Pilih objek dulu.')}>Buat komponen</button>
      <button className="btn" onClick={() => void run(async (engine) => { if (!engine.componentNames().includes(name)) return false; await engine.instance(name, 'Override'); return true; }, 'Komponen belum ada.')}>Tambah instance</button>
      <p className="mt-2 text-xs text-slate-500">Instance memakai salinan komponen. Teks bisa diubah setelah ditambahkan.</p>
    </>,
    Teks: <>
      <button className="btn" onClick={() => void run((engine) => engine.textOnPath(), 'Pilih satu teks dan satu path (tahan Shift).')}>Teks mengikuti path</button>
      <p className="mt-2 text-xs text-slate-500">Pilih alat Teks, lalu klik kanvas untuk mulai mengetik.</p>
    </>,
    Template: <>{['Judul besar', 'Kartu produk'].map((n) => <button key={n} className="btn mb-1 mr-1" onClick={() => void run((engine) => { if (n === 'Judul besar') engine.addCaption('JUDUL BESAR'); else { engine.addRect(); engine.addText(); } })}>{n}</button>)}</>,
    Warna: <>
      <button className="btn mb-2" onClick={() => file.current?.click()}>Impor gambar</button>
      <input ref={file} hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void toDataURL(f).then((url) => run(async (engine) => { await engine.addImage(url); if (mode === 'video') engine.addSelectedToTimeline('overlay'); })).catch((err) => setMsg(err.message)); }} />
      {([['brightness', -1, 1], ['contrast', -1, 1], ['saturation', -1, 1], ['hue', -1, 1], ['blur', 0, 1], ['vhs', 0, 1]] as const).map(([key, min, max]) => (
        <Range key={key} l={key === 'vhs' ? 'VHS noise' : key} min={min} max={max} step={0.05} on={(v) => void run((engine) => engine.setFx(key, v), 'Pilih gambar dulu.')} />
      ))}
      <label className="text-xs"><input type="checkbox" onChange={(e) => void run((engine) => engine.chromaKey(e.target.checked), 'Pilih gambar dulu.')} /> Green screen (chroma key)</label>
    </>,
    Keyframe: <>
      <Range l="Waktu (detik)" min={0} max={2} step={0.05} value={time} on={(v) => { setTime(v); void run((engine) => engine.applyAt(v)); }} />
      <button className="btn" onClick={() => void run((engine) => engine.addKeyframe(time), 'Pilih objek dulu.')}>Tambah keyframe di {time}s</button>
      <p className="mt-2 text-xs text-slate-500">Atur posisi, skala, atau opasitas lalu simpan keyframe pada waktu yang berbeda.</p>
    </>,
    Caption: <><button className="btn" data-on={recording} onClick={caption}>{recording ? 'Berhenti' : 'Mulai auto caption'}</button><p className="mt-2 text-xs text-slate-500">Bahasa: Indonesia. Hasil muncul sebagai teks di kanvas.</p></>,
    Stiker: <div className="flex flex-wrap gap-1">{['🔥', '⭐', '💥', '❤️', '😂', '🎉'].map((s) => <button key={s} className="btn text-lg" onClick={() => void run((engine) => engine.addSticker(s))}>{s}</button>)}</div>,
    Audio: <>
      <button className="btn mb-2" onClick={() => audio.current?.click()}>Impor audio</button>
      <input ref={audio} hidden type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadAudio(f).catch((err) => setMsg(err.message)); }} />
      <canvas ref={wave} width={240} height={60} className="mb-2 w-full rounded bg-black/30" />
      {hasAudio && <button className="btn mb-2" onClick={() => void playAudio()}>{audioPlaying ? 'Hentikan audio' : 'Putar preview'}</button>}
      <Range l="Volume preview" min={0} max={1.5} step={0.05} init={1} on={(v) => { if (gain.current) gain.current.gain.value = v; }} />
    </>,
  };

  return (
    <div className="text-sm">
      {mode === 'design' ? <>
        <div className="mb-2 flex items-center gap-1 border-b border-[#3a3a3a] pb-2">
          <button className="btn" data-on={inspectorTab === 'design'} onClick={() => setInspectorTab('design')}>Design</button>
          <button className="btn" data-on={inspectorTab === 'prototype'} onClick={() => setInspectorTab('prototype')}>Prototype</button>
          <div className="ml-auto flex items-center gap-1 text-xs text-slate-300">
            <button className="btn px-2" title="Perkecil zoom" onClick={() => eng()?.zoomBy(1 / 1.1)}>−</button>
            <span className="min-w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button className="btn px-2" title="Perbesar zoom" onClick={() => eng()?.zoomBy(1.1)}>+</button>
          </div>
        </div>
        {inspectorTab === 'prototype' ? body.Prototype : <>
          {body.Properti}
          <Section title="Effects">
            {selection ? <>
              <label className="mb-2 flex items-center gap-2 text-xs text-slate-200"><input type="checkbox" checked={selection.shadowEnabled} onChange={(e) => void run((engine) => engine.setShadow(e.target.checked))} /> Drop shadow</label>
              {selection.shadowEnabled && <div className="grid grid-cols-2 gap-2">
                <Row l="Warna bayangan"><input className="mt-1 h-8 w-full rounded border border-slate-700 bg-[#111722] p-1" type="color" value={selection.shadowColor} onChange={(e) => void run((engine) => engine.setShadow(true, { color: e.target.value }))} /></Row>
                <NumberField label="Blur" min={0} value={selection.shadowBlur} on={(v) => void run((engine) => engine.setShadow(true, { blur: v }))} />
                <NumberField label="Offset X" value={selection.shadowOffsetX} on={(v) => void run((engine) => engine.setShadow(true, { offsetX: v }))} />
                <NumberField label="Offset Y" value={selection.shadowOffsetY} on={(v) => void run((engine) => engine.setShadow(true, { offsetY: v }))} />
              </div>}
            </> : <p className="text-xs text-slate-500">Pilih objek untuk mengatur efeknya.</p>}
          </Section>
          <Section title="Komponen">{body.Komponen}</Section>
          <Section title="Teks"><button className="btn mb-2 w-full" onClick={() => void run((engine) => engine.addText())}>Tambah teks</button>{body.Teks}</Section>
          <Section title="Template">{body.Template}</Section>
          <Section title="Export"><div className="grid grid-cols-2 gap-1.5">{exportKinds.map((kind) => <button key={kind} className="btn" onClick={() => onExport(kind)}>{kind}</button>)}</div></Section>
        </>}
      </> : <>
        <div className="mb-2 flex flex-wrap gap-1">{videoTabs.map((x) => <button key={x} className="btn" data-on={tab === x} onClick={() => setTab(x)}>{x}</button>)}</div>
        {body[tab]}
        <Section title="Export"><div className="grid grid-cols-2 gap-1.5">{exportKinds.map((kind) => <button key={kind} className="btn" onClick={() => onExport(kind)}>{kind}</button>)}</div></Section>
      </>}
      {msg && <p role="alert" className="mt-2 text-xs text-orange-400">{msg}</p>}
    </div>
  );
}
