// The screenshots caught the real mouse pointer. Remove it with ffmpeg delogo (fills from the surrounding pixels).
// Originals are kept in assets/img/raw. Pointer positions were read from the captures.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const img = path.join(root, 'assets', 'img');
const raw = path.join(img, 'raw');
mkdirSync(raw, { recursive: true });
const ptr = { // file: [x, y] of the arrow tip, read from zoomed crops of each capture
  e01_trace: [768, 349], e04_trace_top: [768, 349], e07_trace: [768, 349], e12_trace: [768, 349],
  evals: [1322, 621], cost: [1399, 658], tickets_board: [1399, 658], e04_trace_bottom: [700, 402],
  wf_left: [699, 299], wf_right: [699, 299],
};
for (const [name, [x, y]] of Object.entries(ptr)) {
  const src = path.join(raw, name + '.jpg');
  if (!existsSync(src)) copyFileSync(path.join(img, name + '.jpg'), src);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `delogo=x=${x - 4}:y=${y - 4}:w=26:h=34:show=0`, '-q:v', '2', path.join(img, name + '.jpg')]);
  if (r.status !== 0) console.error(name, r.stderr.toString());
  else console.log('cleaned', name);
}
