import { create } from 'zustand';
export type Tool = 'select' | 'pen' | 'text' | 'hand';
export type ClipAnimation = 'none' | 'fade' | 'slide-up' | 'slide-left' | 'zoom';
export type ClipTransform = { left: number; top: number; scaleX: number; scaleY: number; angle: number; opacity: number };
export type Clip = {
  id: string; start: number; len: number; label: string; objectId?: string; motionTemplate?: string;
  inAnimation?: ClipAnimation; outAnimation?: ClipAnimation; transitionFrames?: number; baseTransform?: ClipTransform;
};
export type Track = { id: string; kind: 'video' | 'audio' | 'text' | 'overlay'; clips: Clip[] };
export type Layer = { id: string; name: string; type: string; visible: boolean; locked: boolean };
export type Selection = {
  id: string; name: string; type: string; left: number; top: number; width: number; height: number; angle: number; opacity: number;
  fill: string; stroke: string; strokeWidth: number; radius: number; fontSize: number; fontFamily: string;
  fontWeight: string | number; fontStyle: string; textAlign: string; text: string; prototypeTarget: string;
  shadowEnabled: boolean; shadowColor: string; shadowBlur: number; shadowOffsetX: number; shadowOffsetY: number;
};
type S = {
  mode: 'design' | 'video'; tool: Tool; zoom: number; progress: number; layers: Layer[]; selection: Selection | null; prototypePreview: boolean;
  tracks: Track[]; currentFrame: number; playing: boolean; activeClipId: string | null;
  set: (p: Partial<S>) => void;
  updateClip: (id: string, p: Partial<Clip>) => void;
  addClip: (kind: Track['kind']) => void;
  addMotionClip: (clip: Omit<Clip, 'id'>) => void;
  addObjectClip: (kind: Track['kind'], objectId: string, label: string, baseTransform: ClipTransform) => string;
  removeClip: (id: string) => void;
  splitAt: (frame: number) => void;
};
export const useStore = create<S>((set, get) => ({
  mode: 'design', tool: 'select', zoom: 1, progress: 0, layers: [], selection: null, prototypePreview: false, currentFrame: 0, playing: false, activeClipId: null,
  tracks: [
    { id: 'v1', kind: 'video', clips: [] },
    { id: 'a1', kind: 'audio', clips: [] },
    { id: 't1', kind: 'text', clips: [] },
    { id: 'o1', kind: 'overlay', clips: [] },
  ],
  set: (p) => set(p),
  updateClip: (id, p) => set((s) => ({ tracks: s.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, ...p } : c)) })) })),
  addClip: (kind) => set((s) => {
    const track = s.tracks.find((t) => t.kind === kind);
    const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const label = `${kind[0].toUpperCase()}${kind.slice(1)} ${(track?.clips.length ?? 0) + 1}`;
    if (!track) return { tracks: [...s.tracks, { id: `${kind}-${Date.now()}`, kind, clips: [{ id, start: s.currentFrame, len: 96, label }] }] };
    return { tracks: s.tracks.map((t) => t.id === track.id ? { ...t, clips: [...t.clips, { id, start: s.currentFrame, len: 96, label }] } : t) };
  }),
  addMotionClip: (clip) => set((s) => {
    const id = `motion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry: Clip = { ...clip, id };
    const track = s.tracks.find((t) => t.kind === 'overlay');
    if (!track) return { tracks: [...s.tracks, { id: `overlay-${Date.now()}`, kind: 'overlay', clips: [entry] }], activeClipId: id };
    return { tracks: s.tracks.map((t) => t.id === track.id ? { ...t, clips: [...t.clips, entry] } : t), activeClipId: id };
  }),
  addObjectClip: (kind, objectId, label, baseTransform) => {
    const existing = get().tracks.flatMap((track) => track.clips).find((clip) => clip.objectId === objectId);
    if (existing) { set({ activeClipId: existing.id }); return existing.id; }
    const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clip: Clip = { id, start: get().currentFrame, len: 120, label, objectId, baseTransform, inAnimation: 'none', outAnimation: 'none', transitionFrames: 12 };
    set((s) => {
      const track = s.tracks.find((item) => item.kind === kind);
      return {
        activeClipId: id,
        tracks: track
          ? s.tracks.map((item) => item.id === track.id ? { ...item, clips: [...item.clips, clip] } : item)
          : [...s.tracks, { id: `${kind}-${Date.now()}`, kind, clips: [clip] }],
      };
    });
    return id;
  },
  removeClip: (id) => set((s) => ({ tracks: s.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) })), activeClipId: s.activeClipId === id ? null : s.activeClipId })),
  splitAt: (f) => set((s) => ({ tracks: s.tracks.map((t) => ({ ...t, clips: t.clips.flatMap((c) => {
    if (f <= c.start + 1 || f >= c.start + c.len - 1) return [c];
    return [
      { ...c, len: f - c.start },
      { ...c, id: `${c.id}_${f}_${Math.random().toString(36).slice(2, 7)}`, start: f, len: c.start + c.len - f },
    ];
  }) })) })),
}));
