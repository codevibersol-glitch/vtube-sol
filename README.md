# vtube-sol

A browser-based VTuber camera app with real-time MediaPipe Holistic tracking.
No server required — everything runs in the browser.

## Features

- Real-time webcam tracking (face, pose, hands) via MediaPipe Holistic
- **Overlay** — live camera with skeleton overlay
- **2D** — cartoon avatar
- **3D** — wireframe avatar with 4 styles: Neon, Ghost, Robot, Matrix
- **VRM** — load any `.vrm` model and drive it with your body
- Fullscreen + keyboard shortcuts

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Overlay mode |
| `2` | 2D avatar mode |
| `3` | 3D avatar mode |
| `R` | VRM mode |
| `F` | Toggle fullscreen |

## Local Development

```bash
npm install
npm run dev
```

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Select your repo — Render reads `render.yaml` automatically
4. Click **Apply** → deploys as a Static Site

Or manually: New → Static Site → Build Command: `npm ci && npm run build` → Publish Dir: `dist`

## Tech Stack

- **Vite** — build tool
- **MediaPipe Holistic** — body tracking (runs in-browser)
- **Three.js + @pixiv/three-vrm** — VRM model rendering
- **kalidokit** — pose/face rigging math
- **Tailwind CSS** — styles
