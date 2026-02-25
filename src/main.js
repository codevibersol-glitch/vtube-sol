import {
  Holistic,
  FACEMESH_TESSELATION,
  HAND_CONNECTIONS,
  POSE_CONNECTIONS,
} from '@mediapipe/holistic'
import { Camera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'
import { VRMAvatar } from './vrmAvatar.js'

// ─── DOM ──────────────────────────────────────────────────────────────────────
const video     = document.getElementById('video')
const canvas    = document.getElementById('canvas')
const vrmCanvas = document.getElementById('vrm-canvas')
const ctx       = canvas.getContext('2d')

// Declared early so resizeAll() can reference them safely
let vrmAvatarInst = null
let vrmLoaded     = false

function resizeAll() {
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
  vrmAvatarInst?.resize(window.innerWidth, window.innerHeight)
}
resizeAll()
window.addEventListener('resize', resizeAll)

// ─── VRM Avatar instance (lazy-init on first VRM mode enter) ──────────────────
function getVRMAvatar() {
  if (!vrmAvatarInst) {
    vrmAvatarInst = new VRMAvatar(vrmCanvas)
  }
  return vrmAvatarInst
}

// ─── Mode management ──────────────────────────────────────────────────────────
let mode          = 'overlay'
let avatar3dStyle = 'neon'
let mirrorMode    = false

// ─── FPS tracking ─────────────────────────────────────────────────────────────
let _fpsFrames = 0, _fpsLast = performance.now()
function updateFPS() {
  _fpsFrames++
  const now = performance.now()
  if (now - _fpsLast >= 1000) {
    const fps = Math.round(_fpsFrames * 1000 / (now - _fpsLast))
    document.getElementById('fps-counter').textContent = `${fps} fps`
    _fpsFrames = 0
    _fpsLast   = now
  }
}

function setMode(m) {
  mode = m
  document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'))
  document.getElementById(`btn-${m}`).classList.add('active')

  // Canvas visibility
  const isVRM = (m === 'vrm')
  canvas.classList.toggle('hidden', isVRM)
  vrmCanvas.classList.toggle('hidden', !isVRM)
  document.getElementById('vrm-toolbar').classList.toggle('hidden', !isVRM)
  document.getElementById('vrm-controls').classList.toggle('hidden', !isVRM)
  document.getElementById('vrm-drop').classList.toggle('hidden', !isVRM || vrmLoaded)
  document.getElementById('avatar3d-toolbar').classList.toggle('hidden', m !== '3d')

  if (isVRM) {
    getVRMAvatar().active = true
  } else if (vrmAvatarInst) {
    vrmAvatarInst.active = false
  }
}

document.getElementById('btn-overlay').addEventListener('click', () => setMode('overlay'))
document.getElementById('btn-2d').addEventListener('click',      () => setMode('2d'))
document.getElementById('btn-3d').addEventListener('click',      () => setMode('3d'))
document.getElementById('btn-vrm').addEventListener('click',     () => setMode('vrm'))

document.querySelectorAll('.btn-3d-style').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-3d-style').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    avatar3dStyle = btn.dataset.style
  })
})

document.addEventListener('keydown', e => {
  if (e.key === 'v' || e.key === 'V') setMode('overlay')
  if (e.key === '2') setMode('2d')
  if (e.key === '3') setMode('3d')
  if (e.key === 'r' || e.key === 'R') setMode('vrm')
  if (e.key === 'm' || e.key === 'M') toggleMirror()
  if (e.key === 's' || e.key === 'S') takeScreenshot()
  if (e.key === 'f' || e.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen()
    else document.exitFullscreen()
  }
})

// ─── VRM file upload ──────────────────────────────────────────────────────────
document.getElementById('vrm-upload').addEventListener('change', async e => {
  const file = e.target.files?.[0]
  if (!file) return
  setStatus('Loading VRM…', '#ffaa00')
  try {
    await getVRMAvatar().load(file)
    vrmLoaded = true
    document.getElementById('vrm-drop').classList.add('hidden')
    setStatus('VRM loaded ✓', '#00ff88')
  } catch (err) {
    console.error(err)
    setStatus('Failed to load VRM', '#ff4444')
  }
  e.target.value = ''   // allow re-selecting same file
})

// ─── VRM transform controls ───────────────────────────────────────────────────
const vrmRotateSlider = document.getElementById('vrm-rotate')
const vrmScaleSlider  = document.getElementById('vrm-scale')
const vrmRotateVal    = document.getElementById('vrm-rotate-val')
const vrmScaleVal     = document.getElementById('vrm-scale-val')

vrmRotateSlider.addEventListener('input', () => {
  const deg = Number(vrmRotateSlider.value)
  vrmRotateVal.textContent = `${deg}°`
  getVRMAvatar().setModelRotation(deg * Math.PI / 180)
})

vrmScaleSlider.addEventListener('input', () => {
  const pct = Number(vrmScaleSlider.value)
  vrmScaleVal.textContent = `${(pct / 100).toFixed(1)}×`
  getVRMAvatar().setModelScale(pct / 100)
})

document.getElementById('vrm-reset-btn').addEventListener('click', () => {
  vrmRotateSlider.value    = 180
  vrmScaleSlider.value     = 100
  vrmRotateVal.textContent = '180°'
  vrmScaleVal.textContent  = '1.0×'
  const av = getVRMAvatar()
  av.setModelRotation(Math.PI)
  av.setModelScale(1)
})

// ─── Mirror mode ──────────────────────────────────────────────────────────────
function toggleMirror() {
  mirrorMode = !mirrorMode
  const t = mirrorMode ? 'scaleX(-1)' : ''
  canvas.style.transform    = t
  vrmCanvas.style.transform = t
  document.getElementById('btn-mirror').classList.toggle('active', mirrorMode)
}

document.getElementById('btn-mirror').addEventListener('click', toggleMirror)

// ─── Screenshot ───────────────────────────────────────────────────────────────
function takeScreenshot() {
  // Flash feedback
  const flash = document.getElementById('screenshot-flash')
  const btn   = document.getElementById('btn-screenshot')
  flash.classList.add('active')
  btn.classList.add('flash-btn')
  setTimeout(() => { flash.classList.remove('active'); btn.classList.remove('flash-btn') }, 80)

  const srcCanvas = (mode === 'vrm') ? vrmCanvas : canvas

  // When mirrored, composite a flipped copy so the file matches what you see
  let outCanvas = srcCanvas
  if (mirrorMode) {
    outCanvas        = document.createElement('canvas')
    outCanvas.width  = srcCanvas.width
    outCanvas.height = srcCanvas.height
    const oc = outCanvas.getContext('2d')
    oc.translate(outCanvas.width, 0)
    oc.scale(-1, 1)
    oc.drawImage(srcCanvas, 0, 0)
  }

  const ts   = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const link = document.createElement('a')
  link.download = `vtube-${ts}.png`
  link.href     = outCanvas.toDataURL('image/png')
  link.click()
}

document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot)

// ─── Status ───────────────────────────────────────────────────────────────────
function setStatus(text, color = '#00ff88') {
  document.getElementById('status-dot').style.background = color
  document.getElementById('status-text').textContent = text
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function toXY(lm, W, H) {
  return { x: lm.x * W, y: lm.y * H, z: lm.z || 0, v: lm.visibility ?? 1 }
}

function drawSeg(lm, a, b, W, H, color, lw) {
  const pa = toXY(lm[a], W, H), pb = toXY(lm[b], W, H)
  if (pa.v < 0.3 || pb.v < 0.3) return
  ctx.beginPath()
  ctx.moveTo(pa.x, pa.y)
  ctx.lineTo(pb.x, pb.y)
  ctx.strokeStyle = color
  ctx.lineWidth   = lw
  ctx.lineCap     = 'round'
  ctx.stroke()
}

const HAND_SEGS = [
  [0,1],[1,2],[2,3],[3,4],
  [5,6],[6,7],[7,8],
  [9,10],[10,11],[11,12],
  [13,14],[14,15],[15,16],
  [17,18],[18,19],[19,20],
  [0,5],[5,9],[9,13],[13,17],[0,17],
]

// ─── Avatar colour palette ────────────────────────────────────────────────────
const C = {
  skin:     '#FFD4B4', skinD:    '#D4956A',
  hair:     '#2C1810',
  shirt:    '#4A90D9', shirtD:   '#2E6CAF',
  pants:    '#5C4FCF', pantsD:   '#3E35A0',
  outline:  '#1a1a3e',
  eyeWhite: '#ffffff', eyeIris:  '#4A90D9', eyePupil: '#1a1a2e',
  mouth:    '#E8747C', blush:    'rgba(255,150,150,0.3)',
}

// ─── 2D CARTOON AVATAR ────────────────────────────────────────────────────────

function draw2DAvatar(results) {
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, W, H)

  const p    = results.poseLandmarks
  const face = results.multiFaceLandmarks?.[0]
  if (!p) return

  // Legs
  drawSeg(p, 23, 25, W, H, C.pants,  22)
  drawSeg(p, 25, 27, W, H, C.pantsD, 18)
  drawSeg(p, 24, 26, W, H, C.pants,  22)
  drawSeg(p, 26, 28, W, H, C.pantsD, 18)

  // Torso as gradient quad
  const ls = toXY(p[11], W, H), rs = toXY(p[12], W, H)
  const lh = toXY(p[23], W, H), rh = toXY(p[24], W, H)
  if (ls.v > 0.3 && rs.v > 0.3 && lh.v > 0.3 && rh.v > 0.3) {
    ctx.beginPath()
    ctx.moveTo(ls.x, ls.y)
    ctx.lineTo(rs.x, rs.y)
    ctx.lineTo(rh.x, rh.y)
    ctx.lineTo(lh.x, lh.y)
    ctx.closePath()
    const g = ctx.createLinearGradient(
      (ls.x + rs.x) / 2, ls.y,
      (lh.x + rh.x) / 2, lh.y
    )
    g.addColorStop(0, C.shirt)
    g.addColorStop(1, C.shirtD)
    ctx.fillStyle   = g
    ctx.fill()
    ctx.strokeStyle = C.outline
    ctx.lineWidth   = 2
    ctx.stroke()
  }

  // Arms: shirt upper, skin forearm
  drawSeg(p, 11, 13, W, H, C.shirt, 18)
  drawSeg(p, 13, 15, W, H, C.skin,  14)
  drawSeg(p, 12, 14, W, H, C.shirt, 18)
  drawSeg(p, 14, 16, W, H, C.skin,  14)

  // Neck
  if (ls.v > 0.3 && rs.v > 0.3) {
    const nose = toXY(p[0], W, H)
    ctx.beginPath()
    ctx.moveTo((ls.x + rs.x) / 2, (ls.y + rs.y) / 2)
    ctx.lineTo(nose.x, nose.y)
    ctx.strokeStyle = C.skin
    ctx.lineWidth   = 14
    ctx.lineCap     = 'round'
    ctx.stroke()
  }

  // Head
  const nose = toXY(p[0], W, H)
  const le   = toXY(p[7], W, H), re = toXY(p[8], W, H)
  const earD = Math.hypot(le.x - re.x, le.y - re.y)
  const hr   = Math.max(earD * 0.65, 35)

  // Shadow
  ctx.beginPath()
  ctx.arc(nose.x + 3, nose.y + 3, hr, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fill()

  // Face
  ctx.beginPath()
  ctx.arc(nose.x, nose.y, hr, 0, Math.PI * 2)
  ctx.fillStyle   = C.skin
  ctx.fill()
  ctx.strokeStyle = C.skinD
  ctx.lineWidth   = 2
  ctx.stroke()

  // Hair (clip to upper arc)
  ctx.save()
  ctx.beginPath()
  ctx.arc(nose.x, nose.y, hr, Math.PI, Math.PI * 2)
  ctx.lineTo(nose.x + hr, nose.y)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = C.hair
  ctx.fill()
  ctx.restore()

  // Hair puff on top
  ctx.beginPath()
  ctx.ellipse(nose.x, nose.y - hr * 0.35, hr * 0.65, hr * 0.45, 0, 0, Math.PI * 2)
  ctx.fillStyle = C.hair
  ctx.fill()

  // Hair side strands
  ctx.beginPath()
  ctx.ellipse(nose.x - hr * 0.85, nose.y + hr * 0.1, hr * 0.15, hr * 0.45, -0.3, 0, Math.PI * 2)
  ctx.fillStyle = C.hair
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(nose.x + hr * 0.85, nose.y + hr * 0.1, hr * 0.15, hr * 0.45, 0.3, 0, Math.PI * 2)
  ctx.fillStyle = C.hair
  ctx.fill()

  // Face features
  if (face) {
    drawEyebrows(face, W, H)
    drawFaceFeatures(face, W, H)
    drawNose(face, W, H)
  } else {
    drawSimpleEyes(nose.x, nose.y, hr)
  }

  // Hands
  if (results.multiHandLandmarks) {
    for (const hand of results.multiHandLandmarks) drawHandAvatar(hand, W, H)
  }
}

function drawHandAvatar(lms, W, H) {
  for (const [a, b] of HAND_SEGS) {
    const pa = toXY(lms[a], W, H), pb = toXY(lms[b], W, H)
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.strokeStyle = C.skin
    ctx.lineWidth   = 6
    ctx.lineCap     = 'round'
    ctx.stroke()
  }
  for (const lm of lms) {
    const p = toXY(lm, W, H)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = C.skinD
    ctx.fill()
  }
}

function drawEyebrows(face, W, H) {
  // Left brow inner→outer, Right brow inner→outer
  const lBrow = [107, 66, 105, 63, 70].map(i => toXY(face[i], W, H))
  const rBrow = [336, 296, 334, 293, 300].map(i => toXY(face[i], W, H))
  ctx.strokeStyle = C.hair
  ctx.lineWidth   = 3.5
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'
  for (const pts of [lBrow, rBrow]) {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) {
      const cp = { x: (pts[i-1].x + pts[i].x) / 2, y: (pts[i-1].y + pts[i].y) / 2 }
      ctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, cp.x, cp.y)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    ctx.stroke()
  }
}

function drawNose(face, W, H) {
  const bridge = toXY(face[6],   W, H)
  const tip    = toXY(face[4],   W, H)
  const lN     = toXY(face[64],  W, H)
  const rN     = toXY(face[294], W, H)
  ctx.strokeStyle = 'rgba(180,120,100,0.45)'
  ctx.lineWidth   = 1.5
  ctx.lineCap     = 'round'
  ctx.beginPath()
  ctx.moveTo(bridge.x, bridge.y)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.quadraticCurveTo(lN.x, lN.y, lN.x - 2, lN.y + 3)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.quadraticCurveTo(rN.x, rN.y, rN.x + 2, rN.y + 3)
  ctx.stroke()
}

function getEyeOpenness(face, isLeft) {
  const [ti, bi, li, ri] = isLeft ? [159, 145, 33, 133] : [386, 374, 362, 263]
  const top = face[ti], bot = face[bi], lc = face[li], rc = face[ri]
  const vert  = Math.hypot(top.x - bot.x, top.y - bot.y)
  const horiz = Math.hypot(lc.x  - rc.x,  lc.y  - rc.y)
  return horiz > 0 ? Math.min(1, (vert / horiz) * 4.5) : 1
}

function drawFaceFeatures(face, W, H) {
  const loC = toXY(face[33],  W, H), liC = toXY(face[133], W, H)
  const roC = toXY(face[263], W, H), riC = toXY(face[362], W, H)
  const lEX = (loC.x + liC.x) / 2, lEY = (loC.y + liC.y) / 2
  const rEX = (roC.x + riC.x) / 2, rEY = (roC.y + riC.y) / 2
  const ew  = Math.abs(loC.x - liC.x) * 0.65
  const eh  = ew * 0.55

  const lOpen = getEyeOpenness(face, true)
  const rOpen = getEyeOpenness(face, false)
  drawAnimeEye(lEX, lEY, ew, eh * lOpen)
  drawAnimeEye(rEX, rEY, ew, eh * rOpen)

  // Blush
  for (const [bx, by] of [[lEX - ew * 0.3, lEY + eh * 2.5], [rEX + ew * 0.3, rEY + eh * 2.5]]) {
    ctx.beginPath()
    ctx.ellipse(bx, by, ew * 0.7, eh * 0.5, 0, 0, Math.PI * 2)
    ctx.fillStyle = C.blush
    ctx.fill()
  }

  // Mouth
  const mL  = toXY(face[61],  W, H), mR  = toXY(face[291], W, H)
  const mT  = toXY(face[13],  W, H), mB  = toXY(face[14],  W, H)
  const mCX = (mL.x + mR.x) / 2
  const mCY = (mL.y + mR.y) / 2
  const mW  = Math.abs(mR.x - mL.x)
  const mH  = Math.abs(mB.y - mT.y)
  if (mH > 4) {
    ctx.beginPath()
    ctx.ellipse(mCX, mCY, mW * 0.4, mH * 0.6, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#3d0010'
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(mL.x, mL.y)
  ctx.bezierCurveTo(
    mCX - mW * 0.1, mCY + mW * 0.12,
    mCX + mW * 0.1, mCY + mW * 0.12,
    mR.x, mR.y
  )
  ctx.strokeStyle = C.mouth
  ctx.lineWidth   = 2
  ctx.stroke()
}

function drawAnimeEye(cx, cy, ew, eh) {
  if (eh < 1) return   // fully closed
  ctx.beginPath()
  ctx.ellipse(cx, cy, ew, eh, 0, 0, Math.PI * 2)
  ctx.fillStyle = C.eyeWhite
  ctx.fill()

  ctx.beginPath()
  ctx.ellipse(cx, cy, ew * 0.65, eh * 0.65, 0, 0, Math.PI * 2)
  ctx.fillStyle = C.eyeIris
  ctx.fill()

  ctx.beginPath()
  ctx.ellipse(cx, cy, ew * 0.32, eh * 0.32, 0, 0, Math.PI * 2)
  ctx.fillStyle = C.eyePupil
  ctx.fill()

  // Shine
  ctx.beginPath()
  ctx.arc(cx - ew * 0.22, cy - eh * 0.22, ew * 0.14, 0, Math.PI * 2)
  ctx.fillStyle = 'white'
  ctx.fill()

  // Outline + top lash
  ctx.beginPath()
  ctx.ellipse(cx, cy, ew, eh, 0, 0, Math.PI * 2)
  ctx.strokeStyle = C.eyePupil
  ctx.lineWidth   = 1.5
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx - ew, cy)
  ctx.quadraticCurveTo(cx, cy - eh * 1.4, cx + ew, cy)
  ctx.strokeStyle = C.eyePupil
  ctx.lineWidth   = 2
  ctx.stroke()
}

function drawSimpleEyes(hcx, hcy, hr) {
  for (const ex of [hcx - hr * 0.32, hcx + hr * 0.32]) {
    const er = hr * 0.12, ey = hcy - hr * 0.1
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, Math.PI * 2)
    ctx.fillStyle = C.eyePupil
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ex - er * 0.3, ey - er * 0.3, er * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()
  }
}

// ─── MATRIX RAIN STATE ────────────────────────────────────────────────────────

const MTX = {
  canvas: null, ctx: null, drops: null,
  CHARS: '0123456789ABCDEFabcdef#@$%アカタナ',
  CW: 13,
}

function _mtxInit(W, H) {
  MTX.canvas = document.createElement('canvas')
  MTX.canvas.width = W; MTX.canvas.height = H
  MTX.ctx = MTX.canvas.getContext('2d')
  MTX.ctx.fillStyle = '#000a00'; MTX.ctx.fillRect(0, 0, W, H)
  MTX.drops = Array.from({ length: Math.ceil(W / MTX.CW) },
    () => -(Math.random() * (H / MTX.CW) | 0))
}

function _mtxTick(W, H) {
  if (!MTX.canvas || MTX.canvas.width !== W || MTX.canvas.height !== H) _mtxInit(W, H)
  const mc = MTX.ctx, cw = MTX.CW
  mc.fillStyle = 'rgba(0,10,0,0.065)'; mc.fillRect(0, 0, W, H)
  mc.font = `${cw}px monospace`
  for (let i = 0; i < MTX.drops.length; i++) {
    const y = MTX.drops[i] * cw
    if (y >= 0 && y < H) {
      const ch = MTX.CHARS[Math.random() * MTX.CHARS.length | 0]
      const bright = Math.random() > 0.88
      mc.fillStyle = bright ? '#bbffbb' : 'rgba(0,205,55,0.72)'
      mc.shadowBlur = bright ? 8 : 0; mc.shadowColor = '#00ff55'
      mc.fillText(ch, i * cw, y + cw)
      mc.shadowBlur = 0
    }
    MTX.drops[i]++
    if (MTX.drops[i] * cw > H && Math.random() > 0.975)
      MTX.drops[i] = -(Math.random() * 10 | 0)
  }
}

function _synthwaveSky(W, H) {
  const horizon = H * 0.55
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#0d0015')
  sky.addColorStop(0.6, '#180025')
  sky.addColorStop(1, '#2a0040')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon)

  // Retrowave sun
  const sunCX = W / 2, sunCY = horizon * 0.62
  const sunR  = Math.min(W, H) * 0.10
  const g = ctx.createRadialGradient(sunCX, sunCY, 0, sunCX, sunCY, sunR)
  g.addColorStop(0,    'rgba(255,230,120,1)')
  g.addColorStop(0.35, 'rgba(255,80,190,0.95)')
  g.addColorStop(0.72, 'rgba(180,0,255,0.65)')
  g.addColorStop(1,    'rgba(90,0,180,0)')
  ctx.beginPath(); ctx.arc(sunCX, sunCY, sunR, 0, Math.PI * 2)
  ctx.fillStyle = g; ctx.fill()

  // Horizontal stripe cutouts on the sun (classic synthwave look)
  ctx.fillStyle = '#0d0015'
  for (let s = 1; s <= 6; s++) {
    const sy  = sunCY + sunR * (s / 7)
    const hw  = Math.sqrt(Math.max(0, sunR * sunR - (sy - sunCY) ** 2))
    ctx.fillRect(sunCX - hw, sy - 1.5, hw * 2, 3)
  }

  // Horizon glow
  const hg = ctx.createLinearGradient(0, horizon - 22, 0, horizon + 22)
  hg.addColorStop(0, 'transparent')
  hg.addColorStop(0.5, 'rgba(255,0,200,0.38)')
  hg.addColorStop(1, 'transparent')
  ctx.fillStyle = hg; ctx.fillRect(0, horizon - 22, W, 44)
}

// ─── 3D AVATAR STYLES ─────────────────────────────────────────────────────────

const STYLE_3D = {
  neon: {
    bg: '#050510', grid: 'rgba(0,80,180,0.12)',
    boneCol:    d => `rgb(${d*80|0},${(255-d*120)|0},${(220-d*60)|0})`,
    boneGlow:   d => `rgb(${d*80|0},${(255-d*120)|0},${(220-d*60)|0})`,
    boneW:      s => Math.max(2, 4*s),
    jointCol:   d => `rgb(${d*100|0},255,${(255-d*100)|0})`,
    jointGlow:  d => `rgb(${d*80|0},${(255-d*120)|0},${(220-d*60)|0})`,
    headFill:   'rgba(40,120,220,0.10)', headStroke: 'rgba(80,200,255,0.38)',
    faceStroke: 'rgba(80,200,255,0.50)', faceGlow: '#00ccff',
    eyeIris:    '#00ccff', eyeGlow: '#00aaff', handColor: '#00ff88',
  },
  ghost: {
    bg: '#050515', grid: 'rgba(100,50,200,0.07)',
    boneCol:    () => 'rgba(200,165,255,0.65)',
    boneGlow:   () => '#9977ff',
    boneW:      s => Math.max(1.5, 3*s),
    jointCol:   () => 'rgba(220,195,255,0.88)',
    jointGlow:  () => '#aa88ff',
    headFill:   'rgba(120,60,220,0.08)', headStroke: 'rgba(160,100,255,0.25)',
    faceStroke: 'rgba(180,140,255,0.40)', faceGlow: '#aa77ff',
    eyeIris:    'rgba(200,160,255,0.88)', eyeGlow: '#cc99ff', handColor: '#cc99ff',
  },
  robot: {
    bg: '#0a0800', grid: 'rgba(200,80,0,0.07)',
    boneCol:    d => `rgb(255,${(155-d*75)|0},${(15+d*10)|0})`,
    boneGlow:   () => '#ff8800',
    boneW:      s => Math.max(2, 4*s),
    jointCol:   d => `rgb(255,${(170-d*70)|0},20)`,
    jointGlow:  () => '#ff8800',
    headFill:   'rgba(80,30,0,0.15)', headStroke: 'rgba(255,140,0,0.35)',
    faceStroke: 'rgba(255,150,30,0.60)', faceGlow: '#ff7700',
    eyeIris:    'rgba(255,130,0,0.92)', eyeGlow: '#ff6600', handColor: '#ffaa00',
  },
  matrix: {
    bg: '#000a00', grid: 'rgba(0,180,0,0.08)',
    boneCol:    d => `rgba(0,${(255-d*70)|0},0,0.85)`,
    boneGlow:   () => '#00ff44',
    boneW:      s => Math.max(1.5, 3*s),
    jointCol:   () => 'rgba(0,255,70,0.92)',
    jointGlow:  () => '#00ff44',
    headFill:   'rgba(0,80,0,0.12)', headStroke: 'rgba(0,200,50,0.35)',
    faceStroke: 'rgba(0,220,50,0.55)', faceGlow: '#00ff44',
    eyeIris:    'rgba(0,255,60,0.92)', eyeGlow: '#00dd44', handColor: '#00ff88',
  },
  synthwave: {
    bg: '#0d0015', grid: 'rgba(255,0,220,0.20)',
    boneCol:    d => `rgb(${(255-d*50)|0},${(d*80)|0},255)`,
    boneGlow:   () => '#ff00ff',
    boneW:      s => Math.max(2, 4*s),
    jointCol:   d => `rgb(255,${(60+d*80)|0},255)`,
    jointGlow:  () => '#ff00ff',
    headFill:   'rgba(100,0,150,0.12)', headStroke: 'rgba(255,50,255,0.38)',
    faceStroke: 'rgba(255,80,255,0.58)', faceGlow: '#ff00ff',
    eyeIris:    'rgba(255,130,255,0.92)', eyeGlow: '#ff55ff', handColor: '#ff88ff',
  },
}

// ─── 3D WIREFRAME AVATAR ──────────────────────────────────────────────────────

function proj3D(lm, W, H, fov = 900) {
  const z = (lm.z || 0) * 300
  const s = fov / (fov - z)
  return { x: (lm.x - 0.5) * W * s + W / 2, y: (lm.y - 0.5) * H * s + H / 2, s }
}

// Draw a hexagon path (for Robot joints)
function _hex(x, y, r) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 - Math.PI / 6
    ctx[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a))
  }
  ctx.closePath()
}

function draw3DJoint(x, y, rad, d, S, sty) {
  const col = S.jointCol(d)
  ctx.shadowColor = S.jointGlow(d)

  if (sty === 'neon') {
    ctx.shadowBlur = 20
    const g = ctx.createRadialGradient(x - rad*0.3, y - rad*0.3, 0, x, y, rad)
    g.addColorStop(0, 'white'); g.addColorStop(0.4, col)
    g.addColorStop(1, `rgba(${d*100|0},${(200-d*80)|0},0,0.5)`)
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill()

  } else if (sty === 'ghost') {
    // Large pulsing soft orb + floating particles
    const t = performance.now() * 0.001
    const pulse = 1 + 0.15 * Math.sin(t * 1.8 + x * 0.04 + y * 0.03)
    const gr = rad * 2.2 * pulse
    const g = ctx.createRadialGradient(x, y, 0, x, y, gr)
    g.addColorStop(0, 'rgba(235,215,255,0.90)'); g.addColorStop(0.35, col)
    g.addColorStop(0.72, 'rgba(120,70,210,0.18)'); g.addColorStop(1, 'rgba(70,20,160,0)')
    ctx.shadowBlur = 28
    ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI*2); ctx.fillStyle = g; ctx.fill()
    // Outer ghost ring
    ctx.shadowBlur = 0
    ctx.beginPath(); ctx.arc(x, y, gr * 1.45, 0, Math.PI*2)
    ctx.strokeStyle = `rgba(180,130,255,${0.11 * pulse})`; ctx.lineWidth = 1; ctx.stroke()
    // 3 orbiting particles
    for (let p = 0; p < 3; p++) {
      const pt = t * (0.8 + p * 0.28) + p * 2.09
      const pr = rad * (1.9 + p * 0.5)
      ctx.beginPath(); ctx.arc(x + pr * Math.cos(pt), y + pr * Math.sin(pt) * 0.6, 1.5, 0, Math.PI*2)
      ctx.fillStyle = `rgba(210,170,255,${0.55 - p * 0.14})`; ctx.fill()
    }

  } else if (sty === 'robot') {
    // Hexagonal joint with inner targeting reticle + crosshairs
    ctx.shadowBlur = 14
    _hex(x, y, rad)
    ctx.fillStyle = 'rgba(8,4,0,0.92)'; ctx.fill()
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke()
    // Inner targeting circle
    ctx.shadowBlur = 0
    ctx.beginPath(); ctx.arc(x, y, rad * 0.45, 0, Math.PI*2)
    ctx.strokeStyle = `rgba(255,160,0,0.5)`; ctx.lineWidth = 0.8; ctx.stroke()
    // Faint crosshairs
    ctx.strokeStyle = 'rgba(255,140,0,0.22)'; ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(x - rad*1.9, y); ctx.lineTo(x + rad*1.9, y)
    ctx.moveTo(x, y - rad*1.9); ctx.lineTo(x, y + rad*1.9)
    ctx.stroke()

  } else {  // matrix — cluster of glyphs
    ctx.shadowBlur = 10
    ctx.font = `${Math.max(8, rad * 1.1) | 0}px monospace`
    ctx.fillStyle = col
    const t = performance.now() * 0.5 | 0
    const offsets = [[0,0],[-rad*0.8,-rad],[rad*0.5,-rad*0.7],[rad*0.2,rad*0.85],[-rad*0.55,rad*0.5]]
    for (let ci = 0; ci < offsets.length; ci++) {
      const h = Math.abs((Math.floor(x / 10) * 31 + Math.floor(y / 10) * 17 + ci + t) % MTX.CHARS.length)
      ctx.fillText(MTX.CHARS[h], x + offsets[ci][0] - rad*0.4, y + offsets[ci][1] + rad*0.4)
    }
  }
  ctx.shadowBlur = 0
}

function draw3DFaceContour(face, W, H, S, sty) {
  const C = [10,338,297,332,284,251,389,356,454,323,361,288,
    397,365,379,378,400,377,152,148,176,149,150,136,
    172,58,132,93,234,127,162,21,54,103,67,109,10]

  if (sty === 'matrix') {
    ctx.font = '9px monospace'; ctx.fillStyle = S.faceStroke
    ctx.shadowColor = S.faceGlow; ctx.shadowBlur = 4
    for (let i = 0; i < C.length - 1; i++) {
      const fa = face[C[i]]; if (!fa) continue
      const pa = proj3D(fa, W, H)
      const h = Math.abs((Math.floor(pa.x/10)*13 + Math.floor(pa.y/10)*7)) % MTX.CHARS.length
      ctx.fillText(MTX.CHARS[h], pa.x - 4, pa.y + 4)
    }
    ctx.shadowBlur = 0; return
  }
  ctx.strokeStyle = S.faceStroke; ctx.lineWidth = 0.8
  ctx.shadowColor = S.faceGlow; ctx.shadowBlur = sty === 'ghost' ? 8 : 6
  if (sty === 'ghost') ctx.setLineDash([4, 5])
  for (let i = 0; i < C.length - 1; i++) {
    const fa = face[C[i]], fb = face[C[i+1]]
    if (!fa || !fb) continue
    const pa = proj3D(fa, W, H), pb = proj3D(fb, W, H)
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
  }
  if (sty === 'ghost') ctx.setLineDash([])
  ctx.shadowBlur = 0
}

function draw3DFaceEyes(face, W, H, S, sty) {
  if (sty === 'robot') {
    // Single wide visor bar spanning both eyes
    const lO = proj3D(face[33],  W, H), rO = proj3D(face[263], W, H)
    const lT = proj3D(face[159], W, H), rT = proj3D(face[386], W, H)
    const lB = proj3D(face[145], W, H), rB = proj3D(face[374], W, H)
    const vx = lO.x, vy = (lT.y + rT.y) / 2 - 1
    const vw = Math.max(20, rO.x - lO.x), vh = Math.max(9, (lB.y + rB.y) / 2 - vy + 3)
    ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(vx, vy, vw, vh)
    const vg = ctx.createLinearGradient(vx, vy, vx, vy + vh)
    vg.addColorStop(0, 'rgba(255,80,0,0.06)'); vg.addColorStop(0.5, 'rgba(255,120,0,0.22)')
    vg.addColorStop(1, 'rgba(255,80,0,0.05)')
    ctx.fillStyle = vg; ctx.fillRect(vx, vy, vw, vh)
    ctx.strokeStyle = S.eyeGlow; ctx.lineWidth = 1.5
    ctx.shadowColor = S.eyeGlow; ctx.shadowBlur = 14
    ctx.strokeRect(vx, vy, vw, vh)
    // Animated scan line
    const scanT = (performance.now() * 0.0007) % 1
    ctx.fillStyle = 'rgba(255,160,0,0.6)'
    ctx.fillRect(vx, vy + vh * scanT, vw, 1.5)
    ctx.shadowBlur = 0; return
  }

  if (sty === 'matrix') {
    ctx.font = '11px monospace'; ctx.shadowColor = S.faceGlow; ctx.shadowBlur = 8
    for (const [oI, iI] of [[33,133],[263,362]]) {
      const po = proj3D(face[oI], W, H), pi = proj3D(face[iI], W, H)
      const ecx = (po.x + pi.x) / 2, ecy = (po.y + pi.y) / 2
      const ew = Math.hypot(po.x - pi.x, po.y - pi.y) / 2
      for (let k = 0; k < 5; k++) {
        const h = Math.abs((Math.floor(ecx/10)*7 + Math.floor(ecy/10)*13 + k)) % MTX.CHARS.length
        const ox = (k % 3 - 1) * ew * 0.5, oy = (k < 3 ? -1 : 0.6) * 7
        ctx.fillStyle = k === 0 ? '#ccffcc' : S.eyeIris
        ctx.fillText(MTX.CHARS[h], ecx + ox - 4, ecy + oy)
      }
    }
    ctx.shadowBlur = 0; return
  }

  // Neon + Ghost: ellipse eyes with iris/pupil/shine
  for (const [oI, iI, tI, bI] of [[33,133,159,145],[263,362,386,374]]) {
    const po = proj3D(face[oI], W, H), pi = proj3D(face[iI], W, H)
    const pt = proj3D(face[tI], W, H), pb = proj3D(face[bI], W, H)
    const ecx = (po.x + pi.x) / 2, ecy = (po.y + pi.y) / 2
    const ew = Math.hypot(po.x - pi.x, po.y - pi.y) / 2
    const eh = Math.max(1, Math.hypot(pt.x - pb.x, pt.y - pb.y) / 2)
    ctx.beginPath(); ctx.ellipse(ecx, ecy, ew, eh, 0, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fill()
    if (eh > 2) {
      ctx.beginPath(); ctx.ellipse(ecx, ecy, ew*0.55, eh*0.75, 0, 0, Math.PI*2)
      ctx.fillStyle = S.eyeIris; ctx.fill()
      ctx.beginPath(); ctx.arc(ecx, ecy, Math.min(ew*0.28, eh*0.45), 0, Math.PI*2)
      ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fill()
      ctx.beginPath(); ctx.arc(ecx - ew*0.18, ecy - eh*0.22, Math.min(ew*0.11, eh*0.16), 0, Math.PI*2)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill()
    }
    ctx.beginPath(); ctx.ellipse(ecx, ecy, ew, eh, 0, 0, Math.PI*2)
    ctx.strokeStyle = S.eyeGlow; ctx.lineWidth = 1.5
    ctx.shadowColor = S.eyeGlow; ctx.shadowBlur = sty === 'ghost' ? 18 : 10
    ctx.stroke(); ctx.shadowBlur = 0
  }
}

function draw3DFaceMouth(face, W, H, S, sty) {
  const mL = proj3D(face[61],  W, H), mR = proj3D(face[291], W, H)
  const mT = proj3D(face[13],  W, H), mB = proj3D(face[14],  W, H)
  const cx = (mL.x + mR.x) / 2, cy = (mL.y + mR.y) / 2
  const mw = Math.hypot(mR.x - mL.x, mR.y - mL.y) / 2
  const mh = Math.max(0, Math.hypot(mT.x - mB.x, mT.y - mB.y) / 2)

  if (sty === 'robot') {
    ctx.shadowColor = S.faceGlow; ctx.shadowBlur = 6
    ctx.strokeStyle = S.faceStroke; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(mL.x, cy); ctx.lineTo(mR.x, cy); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(mL.x, cy - 5); ctx.lineTo(mL.x, cy + 5)
    ctx.moveTo(mR.x, cy - 5); ctx.lineTo(mR.x, cy + 5)
    ctx.stroke()
    if (mh > 5) {
      ctx.strokeStyle = 'rgba(255,120,0,0.4)'; ctx.lineWidth = 1
      ctx.strokeRect(cx - mw*0.65, cy - mh*0.35, mw*1.3, mh * 0.95)
    }
    ctx.shadowBlur = 0; return
  }

  if (sty === 'matrix') {
    ctx.font = '10px monospace'; ctx.fillStyle = S.faceStroke
    ctx.shadowColor = S.faceGlow; ctx.shadowBlur = 4
    const steps = Math.max(3, mw * 0.18 | 0)
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const px = mL.x + (mR.x - mL.x) * t
      const h = Math.abs((Math.floor(px/10)*11 + Math.floor(cy/10)*7)) % MTX.CHARS.length
      ctx.fillText(MTX.CHARS[h], px - 4, cy + (mh > 4 ? mh * 0.35 : 2))
    }
    ctx.shadowBlur = 0; return
  }

  // Neon + Ghost: bezier lip curves
  if (mh > 3) {
    ctx.beginPath(); ctx.ellipse(cx, cy, mw*0.72, mh*0.85, 0, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(0,0,0,0.90)'; ctx.fill()
  }
  ctx.shadowColor = S.faceGlow; ctx.shadowBlur = sty === 'ghost' ? 10 : 6
  ctx.strokeStyle = S.faceStroke; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(mL.x, mL.y)
  ctx.bezierCurveTo(cx - mw*0.3, cy - mh*0.6, cx + mw*0.3, cy - mh*0.6, mR.x, mR.y)
  ctx.stroke()
  ctx.beginPath(); ctx.moveTo(mL.x, mL.y)
  ctx.bezierCurveTo(cx - mw*0.3, cy + mh*0.9, cx + mw*0.3, cy + mh*0.9, mR.x, mR.y)
  ctx.stroke()
  ctx.shadowBlur = 0
}

function draw3DAvatar(results) {
  const W = canvas.width, H = canvas.height
  const sty = avatar3dStyle
  const S = STYLE_3D[sty] ?? STYLE_3D.neon

  // ── Background ──
  if (sty === 'matrix') {
    _mtxTick(W, H)
    ctx.drawImage(MTX.canvas, 0, 0)
    ctx.fillStyle = 'rgba(0,8,0,0.32)'; ctx.fillRect(0, 0, W, H)
  } else if (sty === 'synthwave') {
    ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H)
    _synthwaveSky(W, H)
  } else {
    ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H)
  }

  // ── Perspective grid ──
  const horizon = sty === 'synthwave' ? H * 0.55 : H * 0.72
  ctx.strokeStyle = S.grid; ctx.lineWidth = 1
  if (sty === 'synthwave') {
    ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 5
  }
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, gy = horizon + (H - horizon) * t, sp = W * 0.55 * t
    ctx.beginPath(); ctx.moveTo(W/2 - sp, gy); ctx.lineTo(W/2 + sp, gy); ctx.stroke()
    const gx = W/2 + (i - 6) / 6 * W * 0.5
    ctx.beginPath(); ctx.moveTo(W/2, horizon); ctx.lineTo(gx, H); ctx.stroke()
  }
  ctx.shadowBlur = 0

  // ── CRT scan lines (robot + synthwave) ──
  if (sty === 'robot') {
    ctx.fillStyle = 'rgba(0,0,0,0.05)'
    for (let sy = 0; sy < H; sy += 4) ctx.fillRect(0, sy, W, 1)
  } else if (sty === 'synthwave') {
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    for (let sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1)
    // Animated slow scan line sweep
    const scanY = (performance.now() * 0.00018 * H) % H
    const sg = ctx.createLinearGradient(0, scanY - 35, 0, scanY + 35)
    sg.addColorStop(0, 'transparent')
    sg.addColorStop(0.5, 'rgba(255,0,255,0.07)')
    sg.addColorStop(1, 'transparent')
    ctx.fillStyle = sg; ctx.fillRect(0, scanY - 35, W, 70)
  }

  const p    = results.poseLandmarks
  const face = results.multiFaceLandmarks?.[0]
  if (!p) return

  // ── Ghost body aura (behind skeleton) ──
  if (sty === 'ghost' && p[11] && p[23]) {
    const ac = proj3D({ x: (p[11].x + p[23].x) / 2, y: (p[11].y + p[23].y) / 2, z: 0 }, W, H)
    const ar = Math.min(W, H) * 0.38
    const ag = ctx.createRadialGradient(ac.x, ac.y, 0, ac.x, ac.y, ar)
    ag.addColorStop(0, 'rgba(100,50,200,0.10)'); ag.addColorStop(0.5, 'rgba(80,30,160,0.05)')
    ag.addColorStop(1, 'rgba(40,0,80,0)')
    ctx.beginPath(); ctx.arc(ac.x, ac.y, ar, 0, Math.PI*2); ctx.fillStyle = ag; ctx.fill()
  }

  // ── Depth-sorted bones ──
  const segs = []
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = p[a], lb = p[b]
    if (!la || !lb || (la.visibility ?? 0) < 0.3 || (lb.visibility ?? 0) < 0.3) continue
    segs.push({ a: proj3D(la, W, H), b: proj3D(lb, W, H), z: (la.z + lb.z) / 2 })
  }
  segs.sort((x, y) => x.z - y.z)

  // ── Style-specific bone rendering ──
  if (sty === 'ghost') {
    const t = performance.now() * 0.001
    ctx.save(); ctx.setLineDash([10, 7]); ctx.lineDashOffset = -t * 18
    for (const seg of segs) {
      ctx.beginPath(); ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(seg.b.x, seg.b.y)
      ctx.lineWidth = S.boneW(seg.a.s) * 2.8; ctx.strokeStyle = 'rgba(130,80,220,0.11)'
      ctx.lineCap = 'butt'; ctx.stroke()
      ctx.lineWidth = S.boneW(seg.a.s); ctx.strokeStyle = S.boneCol()
      ctx.shadowColor = S.boneGlow(); ctx.shadowBlur = 12; ctx.stroke()
    }
    ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.restore()

  } else if (sty === 'robot') {
    for (const seg of segs) {
      const d = Math.min(1, Math.max(0, (seg.z + 0.3) / 0.6))
      ctx.beginPath(); ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(seg.b.x, seg.b.y)
      // Pipe shadow
      ctx.lineWidth = S.boneW(seg.a.s) + 6; ctx.strokeStyle = 'rgba(0,0,0,0.88)'
      ctx.lineCap = 'butt'; ctx.stroke()
      // Pipe barrel
      ctx.lineWidth = S.boneW(seg.a.s) + 2; ctx.strokeStyle = 'rgba(55,18,0,0.70)'; ctx.stroke()
      // Bright center conduit
      ctx.lineWidth = 1.5; ctx.strokeStyle = S.boneCol(d)
      ctx.shadowColor = S.boneGlow(); ctx.shadowBlur = 8
      ctx.lineCap = 'round'; ctx.stroke(); ctx.shadowBlur = 0
      // Square end-caps
      ctx.fillStyle = S.boneCol(d)
      const cp = 2.5
      ctx.fillRect(seg.a.x - cp, seg.a.y - cp, cp*2, cp*2)
      ctx.fillRect(seg.b.x - cp, seg.b.y - cp, cp*2, cp*2)
    }

  } else if (sty === 'matrix') {
    ctx.font = '10px monospace'
    for (const seg of segs) {
      const d = Math.min(1, Math.max(0, (seg.z + 0.3) / 0.6))
      const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y
      const steps = Math.max(1, Math.hypot(dx, dy) / 11 | 0)
      ctx.fillStyle = S.boneCol(d); ctx.shadowColor = S.boneGlow(); ctx.shadowBlur = 5
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, px = seg.a.x + dx*t, py = seg.a.y + dy*t
        const h = Math.abs(Math.floor(px/11)*31 + Math.floor(py/11)*17) % MTX.CHARS.length
        ctx.fillText(MTX.CHARS[h], px - 4, py + 4)
      }
    }
    ctx.shadowBlur = 0

  } else {  // neon
    for (const seg of segs) {
      const d = Math.min(1, Math.max(0, (seg.z + 0.3) / 0.6))
      ctx.shadowColor = S.boneGlow(d); ctx.shadowBlur = 14
      ctx.beginPath(); ctx.moveTo(seg.a.x, seg.a.y); ctx.lineTo(seg.b.x, seg.b.y)
      ctx.strokeStyle = S.boneCol(d); ctx.lineWidth = S.boneW(seg.a.s); ctx.lineCap = 'round'
      ctx.stroke()
    }
    ctx.shadowBlur = 0
  }

  // ── Joints ──
  for (const lm of p) {
    if ((lm.visibility ?? 0) < 0.3) continue
    const pt = proj3D(lm, W, H)
    const d  = Math.min(1, Math.max(0, (lm.z + 0.3) / 0.6))
    draw3DJoint(pt.x, pt.y, Math.max(3, 6 * pt.s), d, S, sty)
  }
  ctx.shadowBlur = 0

  // ── Head ──
  if ((p[0]?.visibility ?? 0) > 0.3) {
    const hp   = proj3D(p[0], W, H)
    const le   = toXY(p[7], W, H), re = toXY(p[8], W, H)
    const hRad = Math.max(20, Math.hypot(le.x - re.x, le.y - re.y) * 0.55 * hp.s)

    if (sty === 'robot') {
      // Targeting brackets instead of a circle
      const b = hRad * 1.45, bl = b * 0.38
      ctx.strokeStyle = S.faceStroke; ctx.lineWidth = 1.5
      ctx.shadowColor = S.faceGlow; ctx.shadowBlur = 6
      for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
        const bx = hp.x + sx*b, by = hp.y + sy*b
        ctx.beginPath()
        ctx.moveTo(bx, by - sy*bl); ctx.lineTo(bx, by); ctx.lineTo(bx - sx*bl, by)
        ctx.stroke()
      }
      ctx.font = '8px monospace'; ctx.fillStyle = S.faceStroke
      ctx.fillText('◈ TRACKING', hp.x - b, hp.y - b - 6)
      ctx.fillText(`SYS:${((hp.x * 0.1) | 0).toString(16).toUpperCase().padStart(2,'0')}`, hp.x - b, hp.y + b + 14)
      ctx.shadowBlur = 0
    } else {
      ctx.beginPath(); ctx.arc(hp.x, hp.y, hRad, 0, Math.PI*2)
      ctx.fillStyle = S.headFill; ctx.fill()
      ctx.strokeStyle = S.headStroke; ctx.lineWidth = 1.5
      ctx.shadowColor = S.faceGlow; ctx.shadowBlur = 8
      ctx.stroke(); ctx.shadowBlur = 0
    }
  }

  // ── Face contour + eyes + mouth ──
  if (face) {
    draw3DFaceContour(face, W, H, S, sty)
    draw3DFaceEyes(face, W, H, S, sty)
    draw3DFaceMouth(face, W, H, S, sty)
  }

  // ── Hands ──
  if (results.multiHandLandmarks) {
    for (const hand of results.multiHandLandmarks) {
      ctx.shadowColor = S.handColor; ctx.shadowBlur = 10
      for (const [a, b] of HAND_SEGS) {
        const la = hand[a], lb = hand[b]
        if (!la || !lb) continue
        const pa = proj3D(la, W, H), pb = proj3D(lb, W, H)
        if (sty === 'matrix') {
          ctx.font = '9px monospace'; ctx.fillStyle = S.handColor
          const h = Math.abs(Math.floor(pa.x*0.1)*11 + Math.floor(pa.y*0.07)*7) % MTX.CHARS.length
          ctx.fillText(MTX.CHARS[h], pa.x - 4, pa.y + 4)
        } else {
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y)
          ctx.strokeStyle = S.handColor; ctx.lineWidth = Math.max(1.5, 2.5*pa.s); ctx.stroke()
        }
      }
    }
    ctx.shadowBlur = 0
  }
}

// ─── OVERLAY (camera + skeleton) ─────────────────────────────────────────────

function drawOverlay(results) {
  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  if (results.multiFaceLandmarks) {
    for (const lms of results.multiFaceLandmarks)
      drawConnectors(ctx, lms, FACEMESH_TESSELATION, { color: '#C0C0C040', lineWidth: 1 })
  }
  if (results.multiHandLandmarks) {
    for (const lms of results.multiHandLandmarks) {
      drawConnectors(ctx, lms, HAND_CONNECTIONS, { color: '#00FF88', lineWidth: 4 })
      drawLandmarks(ctx, lms, { color: '#FF6B9D', lineWidth: 2, radius: 4 })
    }
  }
  if (results.poseLandmarks) {
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00AAFF', lineWidth: 3 })
    drawLandmarks(ctx, results.poseLandmarks, {
      color: '#FF6B9D', fillColor: '#FF6B9D', lineWidth: 1, radius: 3,
    })
  }
  ctx.restore()
}

// ─── MediaPipe Holistic ───────────────────────────────────────────────────────

const holistic = new Holistic({
  locateFile: file =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`,
})

holistic.setOptions({
  modelComplexity:        1,
  smoothLandmarks:        true,
  enableSegmentation:     false,
  refineFaceLandmarks:    true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence:  0.5,
})

holistic.onResults(results => {
  setStatus('Tracking active', '#00ff88')
  updateFPS()
  if      (mode === 'overlay') drawOverlay(results)
  else if (mode === '2d')      draw2DAvatar(results)
  else if (mode === '3d')      draw3DAvatar(results)
  else if (mode === 'vrm')     vrmAvatarInst?.setResults(results, video)
})

// ─── Camera ───────────────────────────────────────────────────────────────────

setStatus('Starting camera…', '#ffaa00')

const camera = new Camera(video, {
  onFrame: async () => { await holistic.send({ image: video }) },
  width: 1280, height: 720,
})

camera.start()
  .then(() => setStatus('Loading model…', '#ffaa00'))
  .catch(() => setStatus('Camera error — allow access', '#ff4444'))
