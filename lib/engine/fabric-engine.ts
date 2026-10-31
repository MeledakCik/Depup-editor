import { Canvas, FabricObject, Group, Rect, Ellipse, Triangle, Path, Point, IText, FabricImage, Shadow, filters, util } from 'fabric';
import { anchorsToPath, type Anchor } from '@/lib/pen-tool';
import { computeAutoLayout } from '@/lib/auto-layout';
import { MOTION_PRESETS } from '@/lib/motion-graphics';
import { useStore } from '@/lib/store';

export function createEngine(el: HTMLCanvasElement, onView: (zoom: number, x: number, y: number) => void) {
  const c = new Canvas(el, { selection: true, preserveObjectStacking: true, backgroundColor: 'transparent' });
  FabricObject.customProperties = [...new Set([...(FabricObject.customProperties ?? []), 'data'])];
  let panning = false, spacePan = false, last = { x: 0, y: 0 }, anchors: Anchor[] = [], drag = false, preview: Path | null = null;
  let busy = false, transient = false, idSeq = 0;
  const undo: string[] = [], redo: string[] = [];
  const stateJSON = () => JSON.stringify(c.toJSON());
  const record = () => {
    if (busy || transient) return;
    const json = stateJSON();
    if (undo[undo.length - 1] === json) return;
    undo.push(json);
    if (undo.length > 100) undo.shift();
    redo.length = 0;
  };
  const restore = async (direction: 'undo' | 'redo') => {
    if (busy) return;
    const from = direction === 'undo' ? undo : redo;
    const to = direction === 'undo' ? redo : undo;
    if ((direction === 'undo' && from.length < 2) || (direction === 'redo' && !from.length)) return;
    let target: string | undefined;
    if (direction === 'undo') { to.push(from.pop()!); target = from[from.length - 1]; }
    else { target = from.pop()!; to.push(target); }
    if (!target) return;
    busy = true;
    try { await c.loadFromJSON(JSON.parse(target)); c.requestRenderAll(); }
    finally { busy = false; sync(); reconcileMotionClips(); applyAt(useStore.getState().currentFrame / 24); }
  };
  const view = () => { const v = c.viewportTransform!; onView(v[0], v[4], v[5]); };
  const zoomBy = (factor: number) => { const z = Math.min(10, Math.max(0.05, c.getZoom() * factor)); c.zoomToPoint(new Point(c.getWidth() / 2, c.getHeight() / 2), z); view(); };
  const resetView = () => { c.setViewportTransform([1, 0, 0, 1, 0, 0]); view(); c.requestRenderAll(); };
  const sync = () => {
    const layers = [...c.getObjects()].reverse().map((o: any) => {
      const data = o.data ?? {};
      if (!data.id) data.id = `layer-${++idSeq}`;
      if (!data.name) data.name = o.type;
      o.data = data;
      return { id: data.id, name: data.name, type: o.type, visible: o.visible !== false, locked: !!o.lockMovementX && !!o.lockMovementY };
    });
    const active: any = c.getActiveObject();
    const selection = active ? {
      id: active.data?.id ?? '', name: active.data?.name ?? active.type, type: active.type,
      left: Math.round(active.left ?? 0), top: Math.round(active.top ?? 0),
      width: Math.round(active.getScaledWidth?.() ?? active.width ?? 0), height: Math.round(active.getScaledHeight?.() ?? active.height ?? 0),
      angle: Math.round(active.angle ?? 0), opacity: active.opacity ?? 1,
      fill: typeof active.fill === 'string' ? active.fill : '#3b82f6',
      stroke: typeof active.stroke === 'string' ? active.stroke : '#111827', strokeWidth: active.strokeWidth ?? 0,
      radius: Math.round(Math.max(active.rx ?? 0, active.ry ?? 0)), fontSize: active.fontSize ?? 28,
      fontFamily: active.fontFamily ?? 'Arial', fontWeight: active.fontWeight ?? 'normal',
      fontStyle: active.fontStyle ?? 'normal', textAlign: active.textAlign ?? 'left', text: active.text ?? '',
      prototypeTarget: active.data?.prototype?.targetId ?? '',
      shadowEnabled: !!active.shadow, shadowColor: active.shadow?.color ?? '#000000', shadowBlur: active.shadow?.blur ?? 8,
      shadowOffsetX: active.shadow?.offsetX ?? 0, shadowOffsetY: active.shadow?.offsetY ?? 4,
    } : null;
    useStore.getState().set({ layers, selection });
  };
  const syncTimelineBase = (object: any) => {
    const id = object?.data?.id; if (!id) return;
    const state = useStore.getState();
    const hasClip = state.tracks.some((track) => track.clips.some((clip) => clip.objectId === id && clip.baseTransform));
    if (!hasClip) return;
    const baseTransform = { left: object.left ?? 0, top: object.top ?? 0, scaleX: object.scaleX ?? 1, scaleY: object.scaleY ?? 1, angle: object.angle ?? 0, opacity: object.opacity ?? 1 };
    state.set({ tracks: state.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.objectId === id ? { ...clip, baseTransform } : clip) })) });
  };
  const navigateTo = (id: string) => {
    const target: any = c.getObjects().find((o: any) => o.data?.id === id);
    if (!target) return false;
    const center = target.getCenterPoint(), zoom = c.getZoom();
    c.setViewportTransform([zoom, 0, 0, zoom, c.getWidth() / 2 - center.x * zoom, c.getHeight() / 2 - center.y * zoom]);
    c.discardActiveObject(); c.requestRenderAll(); view(); return true;
  };
  const reconcileMotionClips = () => {
    const ids = new Set(c.getObjects().map((o: any) => o.data?.id).filter(Boolean));
    const state = useStore.getState(), tracks = state.tracks;
    let changed = false;
    let next = tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => {
      const keep = !clip.motionTemplate || !clip.objectId || ids.has(clip.objectId);
      if (!keep) changed = true;
      return keep;
    }) }));
    for (const object of c.getObjects() as any[]) {
      const meta = object.data?.motion;
      if (!meta?.templateId || !object.data?.id || next.some((track) => track.clips.some((clip) => clip.objectId === object.data.id))) continue;
      const clip = { id: `motion-${object.data.id}`, objectId: object.data.id, motionTemplate: meta.templateId, start: meta.startFrame ?? 0, len: meta.durationFrames ?? 96, label: object.data.name ?? 'Motion graphic' };
      let overlay = next.find((track) => track.kind === 'overlay');
      if (!overlay) { overlay = { id: `overlay-${Date.now()}`, kind: 'overlay', clips: [] }; next = [...next, overlay]; }
      next = next.map((track) => track.id === overlay!.id ? { ...track, clips: [...track.clips, clip] } : track);
      changed = true;
    }
    if (changed) useStore.getState().set({ tracks: next });
  };

  const setToolBehavior = () => {
    const state = useStore.getState(), tool = state.tool, preview = state.prototypePreview, hand = tool === 'hand' || spacePan;
    c.selection = !hand && !preview;
    (c as any).skipTargetFind = hand;
    c.defaultCursor = preview ? 'pointer' : hand ? 'grab' : tool === 'pen' ? 'crosshair' : tool === 'text' ? 'text' : 'default';
    c.hoverCursor = preview ? 'pointer' : tool === 'text' ? 'text' : hand ? 'grab' : 'move';
    c.upperCanvasEl.style.cursor = c.defaultCursor;
    if (preview && c.getActiveObject()) { c.discardActiveObject(); sync(); c.requestRenderAll(); }
  };
  const unsubscribeTool = useStore.subscribe((s, prev) => { if (s.tool !== prev.tool || s.prototypePreview !== prev.prototypePreview) setToolBehavior(); });

  c.on('mouse:wheel', (o) => {
    const e = o.e as WheelEvent; e.preventDefault();
    const z = Math.min(10, Math.max(0.05, c.getZoom() * 0.999 ** e.deltaY));
    c.zoomToPoint(new Point(e.offsetX, e.offsetY), z); view();
  });
  c.on('mouse:down', (o) => {
    const e = o.e as MouseEvent, tool = useStore.getState().tool;
    if (useStore.getState().prototypePreview) {
      const target: any = o.target;
      const destination = target?.data?.prototype?.targetId;
      if (destination) navigateTo(destination);
      else c.discardActiveObject();
      c.requestRenderAll(); sync(); return;
    }
    if (tool === 'hand' || spacePan || e.button === 1 || e.altKey) { panning = true; c.selection = false; c.upperCanvasEl.style.cursor = 'grabbing'; last = { x: e.clientX, y: e.clientY }; return; }
    const p = c.getScenePoint(e);
    if (tool === 'pen') {
      if (anchors.length > 2 && Math.hypot(p.x - anchors[0].x, p.y - anchors[0].y) < 12 / c.getZoom()) { finishPath(true); return; }
      anchors.push({ x: p.x, y: p.y, hx: 0, hy: 0 }); drag = true; redraw(false);
    } else if (tool === 'text') {
      const target: any = o.target;
      if (target instanceof IText) { target.enterEditing(); target.selectAll(); }
      else { const text = addText(p.x, p.y); c.setActiveObject(text); text.enterEditing(); }
      c.requestRenderAll();
    }
  });
  c.on('mouse:move', (o) => {
    const e = o.e as MouseEvent;
    if (panning) { const v = c.viewportTransform!; v[4] += e.clientX - last.x; v[5] += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; c.requestRenderAll(); view(); }
    else if (drag && anchors.length) { const p = c.getScenePoint(e), a = anchors[anchors.length - 1]; a.hx = p.x - a.x; a.hy = p.y - a.y; redraw(false); }
  });
  c.on('mouse:up', () => { panning = false; drag = false; setToolBehavior(); });
  c.on('mouse:dblclick', () => { if (useStore.getState().tool === 'pen') finishPath(true); });
  c.on('selection:created', sync); c.on('selection:updated', sync); c.on('selection:cleared', sync);
  c.on('object:added', () => { if (!transient) { sync(); record(); } });
  c.on('object:modified', (event) => { if (!transient) { syncTimelineBase(event.target); sync(); record(); } });
  c.on('object:removed', () => { if (!transient) { sync(); record(); if (!busy) reconcileMotionClips(); } });
  c.on('text:changed', () => { sync(); record(); });
  c.on('text:editing:exited', sync);

  function redraw(closed: boolean) {
    transient = true;
    if (preview) c.remove(preview);
    preview = new Path(anchorsToPath(anchors, closed), { fill: closed ? 'rgba(249,115,22,.25)' : '', stroke: '#f97316', strokeWidth: 2, selectable: false, evented: false, objectCaching: false });
    (preview as any).data = { id: 'pen-preview', name: 'Pen preview' };
    c.add(preview); transient = false; c.requestRenderAll();
  }
  function finishPath(closed: boolean) {
    if (anchors.length < 2) {
      transient = true; if (preview) c.remove(preview); transient = false;
      preview = null; anchors = []; return;
    }
    redraw(closed); preview!.set({ selectable: true, evented: true });
    (preview as any).data = { id: `path-${++idSeq}`, name: 'Path' };
    preview = null; anchors = []; sync(); record();
  }
  const isTyping = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    return !!target?.isContentEditable || !!target?.closest('input,textarea,select,[contenteditable="true"],[data-timeline="true"]') || ((c.getActiveObject() as any)?.isEditing ?? false);
  };
  const keyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !isTyping(e)) { e.preventDefault(); spacePan = true; c.selection = false; (c as any).skipTargetFind = true; }
    if (isTyping(e)) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); void restore(e.shiftKey ? 'redo' : 'undo'); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); void restore('redo'); return; }
    if ((e.ctrlKey || e.metaKey) && (key === '+' || key === '=' || key === '-')) { e.preventDefault(); zoomBy(key === '-' ? 1 / 1.1 : 1.1); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tools: Record<string, 'select' | 'pen' | 'text' | 'hand'> = { v: 'select', p: 'pen', t: 'text', h: 'hand' };
    if (tools[key]) useStore.getState().set({ tool: tools[key] });
    if (e.key === 'Enter' && anchors.length) finishPath(false);
    if (e.key === 'Escape') {
      if (anchors.length) { transient = true; if (preview) c.remove(preview); transient = false; anchors = []; preview = null; c.requestRenderAll(); }
      else c.discardActiveObject();
      sync(); c.requestRenderAll();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!c.getActiveObjects().length) return;
      e.preventDefault(); c.getActiveObjects().forEach((o) => c.remove(o)); c.discardActiveObject(); sync(); record();
    }
  };
  const keyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    spacePan = false; panning = false; setToolBehavior();
  };
  undo.push(stateJSON());
  window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);

  const sel = () => c.getActiveObject() as any;
  const addText = (left = 120, top = 120) => {
    const t = new IText('Teks', { left, top, fill: '#fff', fontSize: 28 });
    (t as any).data = { id: `text-${++idSeq}`, name: 'Text' }; c.add(t); c.setActiveObject(t); sync(); return t;
  };
  const comps: Record<string, any> = {};
  const FX: Record<string, (v: number) => any> = {
    brightness: (v) => new filters.Brightness({ brightness: v }), contrast: (v) => new filters.Contrast({ contrast: v }),
    saturation: (v) => new filters.Saturation({ saturation: v }), hue: (v) => new filters.HueRotation({ rotation: v }),
    blur: (v) => new filters.Blur({ blur: v }), vhs: (v) => new filters.Noise({ noise: v * 200 }),
  };
  const applyProps = (props: Record<string, unknown>) => {
    const o = sel(); if (!o) return false;
    o.set(props);
    if ('text' in props) o.initDimensions?.();
    o.setCoords();
    if (['left', 'top', 'scaleX', 'scaleY', 'angle', 'opacity'].some((key) => key in props)) syncTimelineBase(o);
    c.requestRenderAll(); sync(); record(); return true;
  };
  const addSelectedToTimeline = (kind?: 'text' | 'overlay') => {
    const o = sel(); if (!o?.data?.id) return false;
    const objectKind = kind ?? (o.type === 'i-text' || o.type === 'textbox' ? 'text' : 'overlay');
    return useStore.getState().addObjectClip(objectKind, o.data.id, o.data.name ?? o.type, {
      left: o.left ?? 0, top: o.top ?? 0, scaleX: o.scaleX ?? 1, scaleY: o.scaleY ?? 1,
      angle: o.angle ?? 0, opacity: o.opacity ?? 1,
    });
  };
  const applyAt = (t: number) => {
    const frame = t * 24, clips = useStore.getState().tracks.flatMap((track) => track.clips);
    c.getObjects().forEach((o: any) => {
      const motion = o.data?.motion;
      if (motion?.keyframes?.length) {
        const related = clips.filter((clip) => clip.objectId === o.data?.id && clip.motionTemplate);
        const clip = related.find((item) => frame >= item.start && frame <= item.start + item.len);
        if (!clip) { o.set('opacity', 0); o.setCoords(); return; }
        const phase = Math.min(1, Math.max(0, (frame - clip.start) / Math.max(1, clip.len)));
        let a = motion.keyframes[0], b = motion.keyframes[motion.keyframes.length - 1];
        if (phase <= a.phase) b = a;
        else if (phase >= b.phase) a = b;
        else { const index = motion.keyframes.findIndex((item: any) => item.phase > phase); a = motion.keyframes[index - 1]; b = motion.keyframes[index]; }
        const amount = a === b ? 0 : (phase - a.phase) / (b.phase - a.phase);
        (['left', 'top', 'scaleX', 'scaleY', 'opacity'] as const).forEach((key) => o.set(key, a[key] + (b[key] - a[key]) * amount));
        o.setCoords(); return;
      }
      const linked = clips.filter((clip) => clip.objectId === o.data?.id && !clip.motionTemplate);
      if (linked.length) {
        const clip = linked.find((item) => frame >= item.start && frame <= item.start + item.len);
        const base = clip?.baseTransform;
        if (!clip || !base) { o.set('opacity', 0); o.setCoords(); return; }
        const duration = Math.min(Math.max(1, clip.transitionFrames ?? 12), Math.max(1, Math.floor(clip.len / 2)));
        const elapsed = frame - clip.start;
        const variant = (type: string | undefined, direction: 'in' | 'out') => {
          const target = { ...base };
          if (type === 'fade') target.opacity = 0;
          if (type === 'slide-up') { target.top += direction === 'in' ? 64 : -64; target.opacity = 0; }
          if (type === 'slide-left') { target.left += direction === 'in' ? -80 : 80; target.opacity = 0; }
          if (type === 'zoom') { target.scaleX *= 0.72; target.scaleY *= 0.72; target.opacity = 0; }
          return target;
        };
        let from = base, to = base, amount = 1;
        if (clip.inAnimation && clip.inAnimation !== 'none' && elapsed < duration) {
          from = variant(clip.inAnimation, 'in'); to = base; amount = Math.max(0, elapsed / duration);
        } else if (clip.outAnimation && clip.outAnimation !== 'none' && elapsed > clip.len - duration) {
          from = base; to = variant(clip.outAnimation, 'out'); amount = Math.min(1, (elapsed - (clip.len - duration)) / duration);
        }
        o.set({
          left: from.left + (to.left - from.left) * amount,
          top: from.top + (to.top - from.top) * amount,
          scaleX: from.scaleX + (to.scaleX - from.scaleX) * amount,
          scaleY: from.scaleY + (to.scaleY - from.scaleY) * amount,
          angle: from.angle + (to.angle - from.angle) * amount,
          opacity: from.opacity + (to.opacity - from.opacity) * amount,
        });
        o.setCoords(); return;
      }
      const keyframes = o.data?.kf; if (!keyframes || keyframes.length < 2) return;
      let a = keyframes[0], b = keyframes[keyframes.length - 1];
      if (t <= a.t) b = a; else if (t >= b.t) a = b; else { const index = keyframes.findIndex((item: any) => item.t > t); a = keyframes[index - 1]; b = keyframes[index]; }
      const amount = a === b ? 0 : (t - a.t) / (b.t - a.t);
      (['left', 'top', 'scaleX', 'scaleY', 'angle', 'opacity'] as const).forEach((key) => o.set(key, a[key] + (b[key] - a[key]) * amount));
      o.setCoords();
    });
    c.requestRenderAll();
  };
  return {
    canvas: c,
    selected: () => sel(),
    setProp: (k: string, v: any) => { applyProps({ [k]: v }); },
    setProps: applyProps,
    setPrototypeTarget: (targetId: string) => {
      const o = sel(); if (!o) return false;
      o.data = { ...(o.data ?? {}), prototype: targetId ? { trigger: 'click', action: 'navigate', targetId } : undefined };
      sync(); record(); return true;
    },
    setShadow: (enabled: boolean, props?: { color?: string; blur?: number; offsetX?: number; offsetY?: number }) => {
      const o = sel(); if (!o) return false;
      const current = o.shadow;
      o.set('shadow', enabled ? new Shadow({
        color: props?.color ?? current?.color ?? '#000000',
        blur: props?.blur ?? current?.blur ?? 8,
        offsetX: props?.offsetX ?? current?.offsetX ?? 0,
        offsetY: props?.offsetY ?? current?.offsetY ?? 4,
      }) : null);
      o.setCoords(); c.requestRenderAll(); sync(); record(); return true;
    },
    addMotionGraphic: (presetId: string, startFrame: number, durationFrames?: number, overrides?: { title?: string; subtitle?: string }) => {
      const preset = MOTION_PRESETS.find((item) => item.id === presetId); if (!preset) return false;
      const titleText = overrides?.title?.trim() || preset.title, subtitleText = overrides?.subtitle?.trim() || preset.subtitle;
      const len = Math.max(24, durationFrames ?? preset.duration), finalLeft = Math.max(24, c.getWidth() / 2 - preset.width / 2);
      const finalTop = Math.max(24, c.getHeight() * (preset.id === 'end-card' ? 0.5 : 0.72) - preset.height / 2);
      const background = new Rect({ left: 0, top: 0, width: preset.width, height: preset.height, fill: preset.fill, rx: preset.id === 'subscribe' ? 30 : 14, ry: preset.id === 'subscribe' ? 30 : 14 });
      const accent = new Rect({ left: 0, top: 0, width: 9, height: preset.height, fill: preset.accent, rx: 4, ry: 4 });
      const title = new IText(titleText, { left: 30, top: preset.height > 160 ? 40 : 20, fontSize: preset.id === 'title-reveal' ? 46 : 30, fill: preset.text, fontWeight: 'bold', fontFamily: 'Arial' });
      const subtitle = new IText(subtitleText, { left: 31, top: preset.height > 160 ? 112 : 69, fontSize: 16, fill: preset.text, fontFamily: 'Arial', opacity: 0.82 });
      const group = new Group([background, accent, title, subtitle], { subTargetCheck: false, objectCaching: true });
      group.set({ left: finalLeft, top: finalTop, originX: 'left', originY: 'top', opacity: 0 });
      group.setCoords();
      const objectId = `motion-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
      const direction = preset.enter === 'left' ? -1 : preset.enter === 'right' ? 1 : 0;
      const initialLeft = finalLeft + direction * 150, initialTop = finalTop + (preset.enter === 'bottom' ? 100 : 0);
      const initialScale = preset.enter === 'scale' ? 0.72 : 0.92;
      const exitLeft = finalLeft - direction * 80, exitTop = finalTop + (preset.enter === 'bottom' ? -60 : 0);
      (group as any).data = { id: objectId, name: preset.name, motionTemplate: preset.id, motion: { templateId: preset.id, startFrame: Math.max(0, startFrame), durationFrames: len, keyframes: [
        { phase: 0, left: initialLeft, top: initialTop, scaleX: initialScale, scaleY: initialScale, opacity: 0 },
        { phase: 0.16, left: finalLeft, top: finalTop, scaleX: 1, scaleY: 1, opacity: 1 },
        { phase: 0.82, left: finalLeft, top: finalTop, scaleX: 1, scaleY: 1, opacity: 1 },
        { phase: 1, left: exitLeft, top: exitTop, scaleX: 0.96, scaleY: 0.96, opacity: 0 },
      ] } };
      c.add(group); c.setActiveObject(group); sync();
      useStore.getState().addMotionClip({ start: Math.max(0, startFrame), len, label: preset.name, objectId, motionTemplate: preset.id });
      applyAt(useStore.getState().currentFrame / 24); c.requestRenderAll(); return objectId;
    },
    removeObject: (id: string) => { const o: any = c.getObjects().find((item: any) => item.data?.id === id); if (!o) return false; c.remove(o); c.discardActiveObject(); sync(); return true; },
    navigateTo,
    setSize: (width: number, height: number) => {
      const o = sel(); if (!o) return;
      o.set({ scaleX: Math.max(1, width) / Math.max(1, o.width ?? 1), scaleY: Math.max(1, height) / Math.max(1, o.height ?? 1) });
      o.setCoords(); syncTimelineBase(o); c.requestRenderAll(); sync(); record();
    },
    renameSelected: (name: string) => { const o = sel(); if (o) { o.data = { ...(o.data ?? {}), name: name || o.type }; sync(); record(); } },
    zoomBy,
    resetView,
    selectLayer: (id: string) => { const o: any = c.getObjects().find((item: any) => item.data?.id === id); if (o) { c.setActiveObject(o); sync(); c.requestRenderAll(); } },
    toggleLayerVisibility: (id: string) => { const o: any = c.getObjects().find((item: any) => item.data?.id === id); if (o) { o.set('visible', !o.visible); c.requestRenderAll(); sync(); record(); } },
    toggleLayerLock: (id: string) => { const o: any = c.getObjects().find((item: any) => item.data?.id === id); if (o) { const locked = !(o.lockMovementX && o.lockMovementY); o.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked }); c.requestRenderAll(); sync(); record(); } },
    addImage: async (url: string) => { const i = await FabricImage.fromURL(url); i.scaleToWidth(320); i.set({ left: 100, top: 100 }); (i as any).data = { id: `image-${++idSeq}`, name: 'Image' }; c.add(i); c.setActiveObject(i); sync(); return (i as any).data.id as string; },
    /** Color grading, effects and chroma key: image objects only. */
    setFx: (key: string, v: number) => {
      const o = sel(); if (!(o instanceof FabricImage)) return false;
      const fx = ((o.filters as any[]) ?? []).filter((f) => f.__k !== key);
      if (v !== 0) { const f = FX[key](v); f.__k = key; fx.push(f); }
      o.filters = fx; o.applyFilters(); c.requestRenderAll(); record(); return true;
    },
    chromaKey: (on: boolean) => {
      const o = sel(); if (!(o instanceof FabricImage)) return false;
      const fx = ((o.filters as any[]) ?? []).filter((f) => f.__k !== 'chroma');
      if (on) { const f: any = new filters.RemoveColor({ color: '#00ff00', distance: 0.35 }); f.__k = 'chroma'; fx.push(f); }
      o.filters = fx; o.applyFilters(); c.requestRenderAll(); record(); return true;
    },
    addSticker: (emoji: string) => { const t = new IText(emoji, { left: 160, top: 160, fontSize: 64 }); (t as any).data = { id: `sticker-${++idSeq}`, name: 'Sticker' }; c.add(t); c.setActiveObject(t); sync(); },
    addCaption: (text: string) => { const t = new IText(text, { left: 80, top: Math.max(0, c.getHeight() - 120), fill: '#fff', fontSize: 30, backgroundColor: 'rgba(0,0,0,.6)' }); (t as any).data = { id: `caption-${++idSeq}`, name: 'Caption' }; c.add(t); c.setActiveObject(t); sync(); },
    /** Select one text object and one path object (shift+click), then call. */
    textOnPath: () => {
      const a = c.getActiveObjects(); const t = a.find((o) => o instanceof IText) as any, p = a.find((o) => o instanceof Path) as any;
      if (!t || !p) return false; c.discardActiveObject(); c.remove(p); t.set({ path: p, pathSide: 'left' }); t.setCoords(); c.requestRenderAll(); sync(); record(); return true;
    },
    makeComponent: (name: string) => { const o = sel(); if (!o) return false; comps[name] = o.toObject(); return true; },
    componentNames: () => Object.keys(comps),
    instance: async (name: string, text?: string) => {
      const [o] = (await util.enlivenObjects([comps[name]])) as any[]; o.set({ left: o.left + 40, top: o.top + 40 });
      if (text && o.text !== undefined) o.set('text', text); o.data = { id: `instance-${++idSeq}`, name: `Instance of ${name}` }; c.add(o); sync();
    },
    addKeyframe: (t: number) => {
      const o = sel(); if (!o) return false; o.data ??= {}; const k = (o.data.kf ??= []).filter((x: any) => x.t !== t);
      k.push({ t, left: o.left, top: o.top, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, opacity: o.opacity });
      o.data.kf = k.sort((a: any, b: any) => a.t - b.t); record(); return k.length;
    },
    /** Evaluate regular keyframes and motion-template clips at timeline time. */
    applyAt,
    resize: (w: number, h: number) => { c.setDimensions({ width: w, height: h }); },
    addRect: () => { const r = new Rect({ left: 80, top: 80, width: 160, height: 100, fill: '#3b82f6', rx: 8, ry: 8 }); (r as any).data = { id: `rect-${++idSeq}`, name: 'Rectangle' }; c.add(r); c.setActiveObject(r); sync(); },
    addEllipse: () => { const o = new Ellipse({ left: 110, top: 110, rx: 60, ry: 42, fill: '#22d3ee' }); (o as any).data = { id: `ellipse-${++idSeq}`, name: 'Ellipse' }; c.add(o); c.setActiveObject(o); sync(); },
    addTriangle: () => { const o = new Triangle({ left: 130, top: 130, width: 110, height: 100, fill: '#f97316' }); (o as any).data = { id: `triangle-${++idSeq}`, name: 'Triangle' }; c.add(o); c.setActiveObject(o); sync(); },
    addText: () => { const text = addText(); return (text as any).data.id as string; },
    addSelectedToTimeline,
    autoLayoutSelected: (direction: 'row' | 'column' = 'row') => {
      const objs = c.getActiveObjects(); if (objs.length < 2) return false;
      const { pos } = computeAutoLayout(objs.map((o) => ({ w: o.getScaledWidth(), h: o.getScaledHeight() })), { direction, gap: 16, padding: 16, mode: 'hug' });
      const ox = Math.min(...objs.map((o) => o.left)), oy = Math.min(...objs.map((o) => o.top));
      objs.forEach((o, i) => o.set({ left: ox + pos[i].x, top: oy + pos[i].y }).setCoords()); c.requestRenderAll(); sync(); record();
      return true;
    },
    undo: () => restore('undo'), redo: () => restore('redo'),
    /** Capture PNG frames. width>0 scales output (3840 = 4K). onFrame(i,n) lets keyframes/effects update the scene first. */
    captureFrames: async (seconds: number, fps: number, width: number, onFrame?: (i: number, n: number) => void, background?: HTMLVideoElement | HTMLImageElement | null) => {
      const n = Math.round(seconds * fps), mult = width ? width / c.getWidth() : 1, out: Uint8Array[] = [];
      for (let i = 0; i < n; i++) {
        if (background instanceof HTMLVideoElement && background.readyState >= HTMLMediaElement.HAVE_METADATA) {
          const time = Math.min(i / fps, Math.max(0, background.duration - 0.02));
          if (Math.abs(background.currentTime - time) > 0.04) {
            const seeked = new Promise<void>((resolve) => {
              let timer = 0;
              const done = () => { window.clearTimeout(timer); background.removeEventListener('seeked', done); resolve(); };
              background.addEventListener('seeked', done, { once: true });
              timer = window.setTimeout(done, 1200);
            });
            background.currentTime = time;
            await seeked;
          }
        }
        onFrame?.(i, n); c.renderAll();
        let url: string;
        if (background) {
          const layer = c.toCanvasElement(mult), output = document.createElement('canvas');
          output.width = layer.width; output.height = layer.height;
          const ctx = output.getContext('2d');
          if (!ctx) throw new Error('Canvas ekspor tidak dapat dibuat.');
          ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, output.width, output.height);
          const sourceWidth = background instanceof HTMLVideoElement ? background.videoWidth : background.naturalWidth;
          const sourceHeight = background instanceof HTMLVideoElement ? background.videoHeight : background.naturalHeight;
          if (sourceWidth && sourceHeight) {
            const scale = Math.min(output.width / sourceWidth, output.height / sourceHeight);
            const drawnWidth = sourceWidth * scale, drawnHeight = sourceHeight * scale;
            ctx.drawImage(background, (output.width - drawnWidth) / 2, (output.height - drawnHeight) / 2, drawnWidth, drawnHeight);
          }
          ctx.drawImage(layer, 0, 0); url = output.toDataURL('image/png');
        } else url = c.toDataURL({ format: 'png', multiplier: mult });
        out.push(Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0)));
        if (i % 5 === 0) await new Promise((r) => setTimeout(r));
      }
      return out;
    },
    toJSON: () => c.toJSON(),
    load: async (json: any) => {
      busy = true;
      try { await c.loadFromJSON(json); }
      finally { busy = false; }
      undo.length = 0; redo.length = 0; sync(); reconcileMotionClips(); undo.push(stateJSON()); c.requestRenderAll();
    },
    exportPNG: () => c.toDataURL({ format: 'png', multiplier: 2 }),
    exportJPG: () => c.toDataURL({ format: 'jpeg', quality: 0.92, multiplier: 2 }),
    exportSVG: () => c.toSVG(),
    destroy: () => { unsubscribeTool(); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); useStore.getState().set({ layers: [], selection: null }); c.dispose(); },
  };
}
export type Engine = ReturnType<typeof createEngine>;
