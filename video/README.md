# Walkthrough video

The 5-minute recording the brief asks for, built as an animated screen walkthrough with [HyperFrames](https://hyperframes.heygen.com) (HTML and GSAP rendered to MP4). Every number on screen is read from the saved runs in `eval/results`. Every screen is a real capture of the n8n workflow, the Ops Console or the Google Sheet.

| What | Where |
|---|---|
| Narration text | `walkthrough/narration.json` |
| Voice (offline Windows voice, no network) | `walkthrough/scripts/make-voice.ps1` |
| Pause detection (sets scene length) | `walkthrough/scripts/pauses.mjs` |
| Word start times (from the speech engine, rescaled to the WAV clock) | `assets/audio/*.words.json`, read in `build.mjs` |
| Scene builder (reads the narration, the cues and the saved runs) | `walkthrough/scripts/build.mjs` |
| Pointer removal from the captures | `walkthrough/scripts/clean-shots.mjs` |
| Captures | `walkthrough/assets/img` (raw copies in `raw/`) |

Rebuild and render (needs Node 20+ and ffmpeg):

```powershell
cd video/walkthrough
./scripts/make-voice.ps1      # writes assets/audio/*.wav
node scripts/pauses.mjs       # writes cues.json
node scripts/build.mjs        # writes index.html and compositions/*.html
npx hyperframes check
npx hyperframes render -o out/kesar-walkthrough.mp4 -q standard
```

To use your own voice, record one clip per scene named `s01.wav` to `s10.wav` in `assets/audio`, then run `pauses.mjs` and `build.mjs` again. The scene lengths and cues follow the audio.
