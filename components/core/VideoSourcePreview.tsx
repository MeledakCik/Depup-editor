'use client';
import { useEffect, useRef } from 'react';
import { AudioLines } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { MediaAsset } from './VideoMediaPanel';

export default function VideoSourcePreview({ asset }: { asset: MediaAsset }) {
  const media = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const frame = useStore((s) => s.currentFrame), playing = useStore((s) => s.playing), set = useStore((s) => s.set);
  useEffect(() => {
    const el = media.current;
    if (!el || asset.kind === 'image') return;
    const time = frame / 24;
    if (Number.isFinite(el.duration) && el.duration > 0 && Math.abs(el.currentTime - time) > 0.2) el.currentTime = Math.min(time, el.duration);
  }, [asset.id, asset.kind, frame]);
  useEffect(() => {
    const el = media.current;
    if (!el || asset.kind === 'image') return;
    if (playing) void el.play().catch(() => set({ playing: false }));
    else el.pause();
  }, [asset.id, asset.kind, playing, set]);
  const onTimeUpdate = (el: HTMLVideoElement | HTMLAudioElement) => set({ currentFrame: Math.round(el.currentTime * 24) });

  return <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black">
    {asset.kind === 'image' ? <img src={asset.url} alt={asset.name} className="max-h-full max-w-full object-contain" /> : asset.kind === 'video' ?
      <video ref={media as React.RefObject<HTMLVideoElement>} src={asset.url} playsInline className="h-full w-full bg-black object-contain" onPlay={() => set({ playing: true })} onPause={() => set({ playing: false })} onTimeUpdate={(e) => onTimeUpdate(e.currentTarget)} onEnded={() => set({ playing: false })} /> :
      <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-xl border border-white/10 bg-[#171717] p-8 text-slate-300"><AudioLines size={32} className="text-purple-300" /><span className="max-w-full truncate text-sm">{asset.name}</span><audio ref={media as React.RefObject<HTMLAudioElement>} src={asset.url} className="hidden" onPlay={() => set({ playing: true })} onPause={() => set({ playing: false })} onTimeUpdate={(e) => onTimeUpdate(e.currentTarget)} onEnded={() => set({ playing: false })} /></div>}
  </div>;
}
