# Lumen Multi-Agent Studio

Free, fully local multi-modal AI video studio that runs in the browser.

**No API keys. No tokens. No credits. No cloud model calls.**

## Features

- **Text → Video** — prompt-driven cinematic scene planning + local canvas render
- **Image → Video** — animate a reference still with Ken Burns motion + generative overlay
- **Text → Image** — still-frame export as PNG
- **Face Composite** — local oval face/subject layer with blend modes (not a neural identity deepfake)
- **Video Reference** — sample an uploaded video for temporal texture
- **Multi-agent profiles** — free local style profiles inspired by modern model looks (Seedance-style, Grok-style, Sora-style, Runway-style, Kling-style)
- **Export** — WebM video via `MediaRecorder`, or PNG stills

## Important honesty note

This app **cannot** unlock real proprietary cloud models (Seedance, Grok, Sora, Runway, Kling, etc.) for free.

Those services require their own paid APIs/accounts. What Lumen provides instead:

1. Free **local agent profiles** that blend motion, color, grain, and bloom
2. Real multi-modal workflow (prompt + image/video/face refs)
3. On-device face **composite** (mask + blend), not a neural face-swap model
4. Offline render + download with zero usage cost

## Quick start

### Option A — open locally

1. Clone this repo
2. Open `index.html` in a modern browser (Chrome/Edge recommended for WebM recording)
3. Or serve it:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Then visit `http://localhost:8080`

### Option B — GitHub Pages (live site)

This repo includes `.github/workflows/pages.yml`.

1. Open **Settings → Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Open the **Actions** tab and re-run **Deploy GitHub Pages** if needed

Live URL after deploy:

`https://kichu110.github.io/lumen-ai-video-studio/`

### Option C — other static hosts

Deploy the folder to Netlify, Vercel, Cloudflare Pages, or any static host.

## Project structure

```
.
├── index.html                      # App shell
├── styles.css                      # Dark cinematic UI
├── app.js                          # Planner + renderer + exports
├── README.md
├── LICENSE
└── .github/workflows/pages.yml     # GitHub Pages deploy
```

## How it works

1. **Prompt planner** detects theme/mood and builds timed camera beats
2. **Agent profiles** blend motion/color/grain/bloom settings
3. **Canvas renderer** draws procedural scenes or composites uploaded media
4. **MediaRecorder** captures frames into a downloadable WebM (or PNG for stills)

All uploads stay in the browser via object URLs. Nothing is uploaded to a server.

## Browser support

| Feature | Notes |
|---|---|
| Preview | Any modern browser with Canvas |
| WebM export | Best in Chromium (Chrome/Edge). Safari support varies |
| File uploads | Images + video via local file picker |

## Controls

- Modes: Text→Video, Image→Video, Text→Image, Face Composite, Video Reference
- Agents: multi-select local style profiles
- Duration 4–20s, FPS 12–30, quality draft/standard/high
- Aspect ratios: 16:9, 9:16, 1:1
- Face composite: strength, scale, X/Y, blend mode
- Seed randomize for variation

## License

MIT — free to use, modify, and share.

## Disclaimer

Lumen is a **local generative/cinematic synthesizer**, not a substitute for large neural video models. Output quality is procedural/composited, not photoreal diffusion video.
