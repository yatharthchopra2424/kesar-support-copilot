// Finds pauses in each narration clip with ffmpeg silencedetect, so on-screen cues land on sentence starts.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../assets/audio/', import.meta.url));
const out = {};
for (const f of readdirSync(dir).filter(f => f.endsWith('.wav')).sort()) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', dir + f, '-af', 'silencedetect=n=-42dB:d=0.16', '-f', 'null', '-'], { encoding: 'utf8' });
  const starts = [...r.stderr.matchAll(/silence_start: ([0-9.]+)/g)].map(m => +m[1]);
  const ends = [...r.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map(m => +m[1]);
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dir + f], { encoding: 'utf8' });
  // a "speech restart" is where each pause ends
  out[f.replace('.wav', '')] = { duration: +dur.toFixed(2), speechStarts: ends.map(e => +e.toFixed(2)) };
}
writeFileSync(fileURLToPath(new URL('../cues.json', import.meta.url)), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
