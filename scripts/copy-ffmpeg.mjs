import { cpSync, mkdirSync, existsSync } from 'node:fs';
const jobs = [['node_modules/@ffmpeg/ffmpeg/dist/esm', 'public/ffmpeg'], ['node_modules/@ffmpeg/core/dist/esm', 'public/ffmpeg/core']];
for (const [from, to] of jobs) {
  if (!existsSync(from)) { console.warn('[copy-ffmpeg] missing', from); continue; }
  mkdirSync(to, { recursive: true }); cpSync(from, to, { recursive: true });
}
console.log('[copy-ffmpeg] done');
