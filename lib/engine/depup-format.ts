import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
export type DepupProject = {
  version: 1; pages: { id: string; name: string; canvas: unknown }[];
  components: unknown[]; assets: { id: string; name: string; path: string }[]; timeline: unknown;
};
export const emptyProject = (): DepupProject => ({ version: 1, pages: [{ id: 'p1', name: 'Page 1', canvas: null }], components: [], assets: [], timeline: { tracks: [] } });
export function packDepup(p: DepupProject, assets: Record<string, Uint8Array> = {}) {
  const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(p)) };
  for (const [k, v] of Object.entries(assets)) files[`assets/${k}`] = v;
  return zipSync(files);
}
export function unpackDepup(buf: Uint8Array) {
  const f = unzipSync(buf);
  return { project: JSON.parse(strFromU8(f['project.json'])) as DepupProject, files: f };
}
export async function saveDepup(bytes: Uint8Array, name = 'project.depup') {
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const w = window as any;
  if (w.showSaveFilePicker) {
    const h = await w.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Depup', accept: { 'application/zip': ['.depup'] } }] });
    const s = await h.createWritable(); await s.write(blob); await s.close(); return;
  }
  const href = URL.createObjectURL(blob), a = document.createElement('a'); a.href = href; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
export async function openDepup() {
  const w = window as any;
  if (!w.showOpenFilePicker) return null;
  const [h] = await w.showOpenFilePicker({ types: [{ accept: { 'application/zip': ['.depup'] } }] });
  return unpackDepup(new Uint8Array(await (await h.getFile()).arrayBuffer()));
}
