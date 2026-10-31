let ff: any = null;
let ffLoading: Promise<any> | null = null;
/** Client only. FFmpeg is served from /public/ffmpeg (copied on postinstall) and loaded at runtime, bypassing the bundler. */
export async function getFFmpeg() {
  if (ff) return ff;
  if (!ffLoading) ffLoading = (async () => {
    // @ts-ignore runtime URL, intentionally not bundled
    const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '/ffmpeg/index.js');
    const instance = new mod.FFmpeg();
    await instance.load({ coreURL: '/ffmpeg/core/ffmpeg-core.js', wasmURL: '/ffmpeg/core/ffmpeg-core.wasm' });
    ff = instance;
    return instance;
  })();
  try { return await ffLoading; }
  catch (e) { ffLoading = null; ff = null; throw e; }
  finally { if (ff) ffLoading = null; }
}
export async function framesToMp4(frames: Uint8Array[], fps: number, onProgress?: (p: number) => void) {
  const f = await getFFmpeg(), listener = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, progress));
  const files = frames.map((_, i) => `f${String(i + 1).padStart(4, '0')}.png`);
  f.on('progress', listener);
  try {
    for (let i = 0; i < frames.length; i++) await f.writeFile(files[i], frames[i]);
    await f.exec(['-y', '-framerate', String(fps), '-i', 'f%04d.png', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 'out.mp4']);
    return new Blob([(await f.readFile('out.mp4')) as BlobPart], { type: 'video/mp4' });
  } finally {
    f.off('progress', listener);
    await Promise.all([...files, 'out.mp4'].map((path) => f.deleteFile(path).catch(() => undefined)));
  }
}
